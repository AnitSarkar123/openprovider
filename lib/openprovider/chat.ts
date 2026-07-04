import { getServerSession } from 'next-auth';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db/client';
import { chatMessages, conversations } from '@/lib/db/schema';
import { loadOpenProviderConfig } from '@/src/config/env';
import { applyUserProviderKeysToConfig, loadUserProviderKeyValues } from '@/lib/openprovider/provider-keys';
import type { OpenProviderConfig, ProviderModel } from '@/src/core/types';
import { OpenProviderError } from '@/src/utils/errors';
import { parseOpenAICompatibleStream } from '@/src/utils/stream';
import { sendProviderChatCompletion } from '@/src/server/providerChat';
import { getCatalogSnapshot, type PublicModel } from './catalog';
import {
  isOpenProviderAutoModel,
  OPENPROVIDER_AUTO_FREE_MODEL_ID,
  rankOpenProviderAutoCandidates,
} from '@/src/core/autoFreeRouter';
import { isChatRouteModel } from '@/src/core/modelCategoryUtils';

const DEFAULT_MAX_TOKENS = 4096;
export const MAX_USER_CONVERSATIONS = 10;
export const CONVERSATION_LIMIT_ERROR_CODE = 'conversation_limit_reached';
export const CONVERSATION_LIMIT_MESSAGE = `You reached the ${MAX_USER_CONVERSATIONS} conversation limit. Delete an old conversation before starting a new chat.`;

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | Array<string | Record<string, unknown>>;
  reasoning?: string;
  tokenUsage?: unknown;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

type ChatRequestBody = {
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  maxTokens?: number;
  stream?: boolean;
  thinking?: boolean;
  include_reasoning?: boolean;
  reasoning?: boolean | Record<string, unknown>;
  reasoning_effort?: string;
  tools?: unknown[];
  tool_choice?: unknown;
  stream_strategy?: 'fallback-buffered' | 'passthrough';
  conversationId?: string;
  displayUserContent?: string;
  replaceConversationMessages?: boolean;
};

type ChatAttempt = {
  id: string;
  provider: string;
  status?: number;
  error?: string;
};

type ChatRunOptions = {
  persist?: boolean;
  userId?: string | null;
};

function toProviderModel(model: PublicModel): ProviderModel | undefined {
  if (model.id === OPENPROVIDER_AUTO_FREE_MODEL_ID) {
    return undefined;
  }

  return {
    id: model.id,
    modelId: model.modelId,
    name: model.name,
    description: model.description,
    provider: model.provider as ProviderModel['provider'],
    routeFormat: model.routeFormat === 'anthropic-messages' ? 'anthropic-messages' : 'openai-compatible',
    category: model.category,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    priority: model.priority,
    enabled: true,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning,
    free: true,
    freeReason: model.freeReason,
    tags: model.tags,
  };
}

function availableChatModels(models: ProviderModel[]): ProviderModel[] {
  return models.filter(model => model.enabled && model.free && isChatRouteModel(model));
}

function shouldTryNext(error: unknown): boolean {
  if (isConversationLimitError(error)) {
    return false;
  }

  if (!(error instanceof OpenProviderError)) {
    return true;
  }

  // Only retry on transient upstream errors or rate limits.
  // Do not retry on client errors (400, 401, 402, 403, 404).
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(error.status ?? 0);
}

function extractChoiceText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message;
  const delta = choice?.delta;
  const content = message?.content ?? delta?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object') {
        return '';
      }

      return typeof item.text === 'string'
        ? item.text
        : typeof item.content === 'string'
          ? item.content
          : '';
    }).filter(Boolean).join('\n');
  }

  const candidates = [
    message?.text,
    message?.output_text,
    delta?.text,
    delta?.output_text,
    choice?.text,
    payload?.output_text,
    payload?.text,
  ];

  return candidates.find((value): value is string => typeof value === 'string') ?? '';
}

function extractChoiceReasoning(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message;
  const reasoning = message?.reasoning_content ?? message?.reasoningContent ?? message?.reasoning ?? message?.thinking;

  return typeof reasoning === 'string' ? reasoning : '';
}

function providerChatBody(body: ChatRequestBody, model: ProviderModel, stream: boolean): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    messages: body.messages,
    model: model.modelId,
    max_tokens: body.max_tokens ?? body.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream,
  };

  if (body.temperature !== undefined) requestBody.temperature = body.temperature;
  if (body.tools !== undefined) requestBody.tools = body.tools;
  if (body.tool_choice !== undefined) requestBody.tool_choice = body.tool_choice;
  if (body.thinking !== undefined) requestBody.thinking = body.thinking;
  if (body.include_reasoning !== undefined) requestBody.include_reasoning = body.include_reasoning;
  if (body.reasoning !== undefined) requestBody.reasoning = body.reasoning;
  if (body.reasoning_effort !== undefined) requestBody.reasoning_effort = body.reasoning_effort;

  return requestBody;
}

function isProviderGeneratedFailure(model: ProviderModel, text: string): boolean {
  if (model.provider !== 'llm7') {
    return false;
  }

  return /^\s*(?:error:\s*)?failed to process request after multiple attempts\.?\s*(?:try again later\.?)?\s*$/i
    .test(text);
}

function providerGeneratedFailure(model: ProviderModel): OpenProviderError {
  return new OpenProviderError(
    `${model.provider} returned an upstream model failure. Try another model or save a provider token for better limits.`,
    502
  );
}

function emptyProviderResponseFailure(model: ProviderModel): OpenProviderError {
  return new OpenProviderError(
    `${model.provider} returned an empty response. Try another model or refresh model status so this route can be skipped.`,
    502
  );
}

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function chatAttempt(model: ProviderModel, error: unknown): ChatAttempt {
  return {
    id: model.id,
    provider: model.provider,
    status: error instanceof OpenProviderError ? error.status : undefined,
    error: error instanceof Error ? error.message : 'Unknown provider error',
  };
}

type BufferedStreamResult = {
  id: string;
  content: string;
  reasoning: string;
  toolCalls: unknown[];
  usage: unknown;
};

async function readProviderStreamToCompletion(
  providerResponse: Response,
  model: ProviderModel
): Promise<BufferedStreamResult> {
  if (!providerResponse.body) {
    throw new OpenProviderError('Provider returned an empty stream.', providerResponse.status);
  }

  let content = '';
  let reasoning = '';
  const toolCalls: unknown[] = [];
  let usage: unknown;
  let id = `chatcmpl_${crypto.randomUUID()}`;

  for await (const event of parseOpenAICompatibleStream(providerResponse.body)) {
    if (event.type === 'text') {
      content += event.content;
    }

    if (event.type === 'reasoning') {
      reasoning += event.content;
    }

    if (event.type === 'tool') {
      toolCalls.push(event.toolCall);
    }

    if (event.type === 'raw') {
      const chunk = event.chunk as Record<string, unknown>;
      if (typeof chunk.id === 'string') {
        id = chunk.id;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
  }

  if (isProviderGeneratedFailure(model, content)) {
    throw providerGeneratedFailure(model);
  }

  if (!content.trim() && toolCalls.length === 0) {
    throw emptyProviderResponseFailure(model);
  }

  return {
    id,
    content,
    reasoning,
    toolCalls,
    usage,
  };
}

function tokenUsageRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function messageContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }

      if (!part || typeof part !== 'object') {
        return '';
      }

      const record = part as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return record.text;
      }

      if (typeof record.content === 'string') {
        return record.content;
      }

      if (
        record.type === 'image_url' ||
        record.type === 'input_image' ||
        record.type === 'image'
      ) {
        return '[Attached image]';
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function isConversationLimitError(error: unknown): boolean {
  return error instanceof OpenProviderError && error.detail === CONVERSATION_LIMIT_ERROR_CODE;
}

export async function countUserConversations(userId: string): Promise<number> {
  const db = getDb();
  if (!db) {
    return 0;
  }

  const [row] = await db
    .select({ value: count() })
    .from(conversations)
    .where(eq(conversations.userId, userId));

  return Number(row?.value ?? 0);
}

async function userOwnsConversation(userId: string, conversationId: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    return false;
  }

  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  return existing.length > 0;
}

async function shouldCreateConversation(body: ChatRequestBody, userId: string): Promise<boolean> {
  if (!body.conversationId) {
    return true;
  }

  return !(await userOwnsConversation(userId, body.conversationId));
}

async function enforceConversationLimit(
  body: ChatRequestBody,
  userId: string | null | undefined,
  persist: boolean
): Promise<void> {
  if (!persist || !userId || !(await shouldCreateConversation(body, userId))) {
    return;
  }

  const total = await countUserConversations(userId);
  if (total >= MAX_USER_CONVERSATIONS) {
    throw new OpenProviderError(CONVERSATION_LIMIT_MESSAGE, 409, CONVERSATION_LIMIT_ERROR_CODE);
  }
}

async function saveConversation(
  body: ChatRequestBody,
  model: ProviderModel,
  assistantText: string,
  usage: unknown,
  userIdOverride?: string | null
): Promise<string | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  const userId = userIdOverride === undefined
    ? (await getServerSession(authOptions))?.user?.id
    : userIdOverride;
  if (!userId) {
    return null;
  }

  const userMessage = [...(body.messages ?? [])].reverse().find(message => message.role === 'user');
  const displayUserContent = typeof body.displayUserContent === 'string' ? body.displayUserContent.trim() : '';
  const userMessageText = displayUserContent || messageContentText(userMessage?.content);
  const title = userMessageText.slice(0, 80) || 'New conversation';
  const now = new Date();
  let conversationId = body.conversationId;
  const replaceConversationMessages = body.replaceConversationMessages === true;

  if (conversationId) {
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      conversationId = undefined;
    }
  }

  if (!conversationId) {
    await enforceConversationLimit(body, userId, true);

    const [created] = await db
      .insert(conversations)
      .values({
        id: crypto.randomUUID(),
        userId,
        title,
        modelId: model.id,
        provider: model.provider,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id });
    conversationId = created.id;
  } else {
    await db
      .update(conversations)
      .set({ modelId: model.id, provider: model.provider, updatedAt: now })
      .where(eq(conversations.id, conversationId));
  }

  if (replaceConversationMessages) {
    await db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId));

    const transcriptMessages = (body.messages ?? [])
      .filter(message => message.role !== 'system')
      .map(message => ({
        ...message,
        contentText: messageContentText(message.content),
      }))
      .filter(message => message.contentText.trim())
      .map((message, index) => ({
        id: crypto.randomUUID(),
        conversationId,
        role: message.role,
        content: message.contentText,
        tokenUsage: tokenUsageRecord(message.tokenUsage),
        createdAt: new Date(now.getTime() + index),
      }));

    await db.insert(chatMessages).values([
      ...transcriptMessages,
      {
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: assistantText,
        tokenUsage: tokenUsageRecord(usage),
        createdAt: new Date(now.getTime() + transcriptMessages.length),
      },
    ]);

    return conversationId;
  }

  if (userMessage && userMessageText) {
    await db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: userMessageText,
      createdAt: now,
    });
  }

  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    conversationId,
    role: 'assistant',
    content: assistantText,
    tokenUsage: tokenUsageRecord(usage),
    createdAt: new Date(now.getTime() + 1),
  });

  return conversationId;
}

function selectChatCandidates(
  body: ChatRequestBody,
  configuredModels: ProviderModel[],
  config: OpenProviderConfig
): { selected: ProviderModel; candidates: ProviderModel[]; explicitModel: boolean } {
  const requestedModel = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : OPENPROVIDER_AUTO_FREE_MODEL_ID;
  const explicitModel = !isOpenProviderAutoModel(requestedModel);
  const enabledModels = configuredModels
    .filter(model => config.providers[model.provider]?.enabled);
  const chatModels = availableChatModels(explicitModel ? configuredModels : enabledModels);
  const autoCandidates = explicitModel ? [] : rankOpenProviderAutoCandidates(chatModels, body);
  if (!explicitModel && chatModels.length === 0) {
    throw new OpenProviderError(
      'No configured free chat models are currently available.',
      503
    );
  }

  const selected = explicitModel
    ? configuredModels.find(model => (
      model.id.toLowerCase() === requestedModel.toLowerCase() ||
      model.modelId.toLowerCase() === requestedModel.toLowerCase()
    ))
    : autoCandidates[0] ?? chatModels[0];

  if (!selected || !selected.free || !isChatRouteModel(selected)) {
    throw new OpenProviderError(`Model "${requestedModel}" is not available in the free chat registry.`, 404);
  }

  const candidates = explicitModel ? [selected] : (autoCandidates.length > 0 ? autoCandidates : chatModels);
  if (!explicitModel && candidates.length === 0) {
    throw new OpenProviderError(
      'No configured free chat models are currently available.',
      503
    );
  }

  return { selected, candidates, explicitModel };
}

function streamProviderResponse(
  providerResponse: Response,
  body: ChatRequestBody,
  model: ProviderModel,
  attempts: ChatAttempt[],
  userId: string | null,
  persist: boolean
): ReadableStream<Uint8Array> {
  if (!providerResponse.body) {
    throw new OpenProviderError('Provider returned an empty stream.', providerResponse.status);
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let content = '';
      let reasoning = '';
      let toolCallCount = 0;
      let usage: unknown;
      let id = `chatcmpl_${crypto.randomUUID()}`;

      controller.enqueue(sse('metadata', {
        id,
        model: model.id,
        modelName: model.name,
        provider: model.provider,
        supportsReasoning: Boolean(model.supportsReasoning),
        attempts,
      }));

      try {
        for await (const event of parseOpenAICompatibleStream(providerResponse.body!)) {
          if (event.type === 'text') {
            content += event.content;
            controller.enqueue(sse('delta', { content: event.content }));
          }

          if (event.type === 'reasoning') {
            reasoning += event.content;
            controller.enqueue(sse('reasoning', { content: event.content }));
          }

          if (event.type === 'tool') {
            toolCallCount += 1;
            controller.enqueue(sse('tool', { toolCall: event.toolCall }));
          }

          if (event.type === 'raw') {
            const chunk = event.chunk as Record<string, unknown>;
            if (typeof chunk.id === 'string') {
              id = chunk.id;
            }
            if (chunk.usage) {
              usage = chunk.usage;
            }
          }
        }

        if (isProviderGeneratedFailure(model, content)) {
          const error = providerGeneratedFailure(model);
          controller.enqueue(sse('error', { message: error.message }));
          return;
        }

        if (!content.trim() && toolCallCount === 0) {
          const error = emptyProviderResponseFailure(model);
          controller.enqueue(sse('error', { message: error.message }));
          return;
        }

        const conversationId = persist && content.trim()
          ? await saveConversation(body, model, content, usage, userId)
          : null;
        controller.enqueue(sse('done', {
          id,
          model: model.id,
          modelName: model.name,
          provider: model.provider,
          content,
          reasoning,
          usage,
          conversationId,
        }));
      } catch (error) {
        controller.enqueue(sse('error', {
          message: error instanceof Error ? error.message : 'Streaming chat request failed.',
          code: isConversationLimitError(error) ? CONVERSATION_LIMIT_ERROR_CODE : undefined,
        }));
      } finally {
        controller.close();
      }
    },
  });
}

function streamAutoProviderResponse(
  config: OpenProviderConfig,
  body: ChatRequestBody,
  candidates: ProviderModel[],
  userId: string | null,
  persist: boolean
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const attempts: ChatAttempt[] = [];

      try {
        for (const model of candidates) {
          try {
            const providerResponse = await sendProviderChatCompletion(
              config,
              model,
              providerChatBody(body, model, true)
            );
            const result = await readProviderStreamToCompletion(providerResponse, model);
            const conversationId = persist && result.content.trim()
              ? await saveConversation(body, model, result.content, result.usage, userId)
              : null;

            controller.enqueue(sse('metadata', {
              id: result.id,
              model: model.id,
              modelName: model.name,
              provider: model.provider,
              supportsReasoning: Boolean(model.supportsReasoning),
              attempts,
            }));
            if (result.reasoning) {
              controller.enqueue(sse('reasoning', { content: result.reasoning }));
            }
            for (const toolCall of result.toolCalls) {
              controller.enqueue(sse('tool', { toolCall }));
            }
            if (result.content) {
              controller.enqueue(sse('delta', { content: result.content }));
            }
            controller.enqueue(sse('done', {
              id: result.id,
              model: model.id,
              modelName: model.name,
              provider: model.provider,
              content: result.content,
              reasoning: result.reasoning,
              usage: result.usage,
              conversationId,
            }));
            return;
          } catch (error) {
            attempts.push(chatAttempt(model, error));

            if (!shouldTryNext(error)) {
              controller.enqueue(sse('error', {
                message: error instanceof Error ? error.message : 'Streaming chat request failed.',
                code: isConversationLimitError(error) ? CONVERSATION_LIMIT_ERROR_CODE : undefined,
                attempts,
              }));
              return;
            }
          }
        }

        const last = attempts.at(-1);
        controller.enqueue(sse('error', {
          message: last?.error ?? 'No available chat model returned a response.',
          code: attempts.some(attempt => attempt.status === 409 && attempt.error === CONVERSATION_LIMIT_MESSAGE)
            ? CONVERSATION_LIMIT_ERROR_CODE
            : undefined,
          attempts,
        }));
      } finally {
        controller.close();
      }
    },
  });
}

async function loadChatModels(userId?: string | null) {
  const userKeys = userId ? await loadUserProviderKeyValues(userId) : {};
  const hasCustomKeys = Object.keys(userKeys).length > 0;

  const config = hasCustomKeys
    ? await applyUserProviderKeysToConfig(loadOpenProviderConfig(), userId)
    : loadOpenProviderConfig();

  const snapshot = await getCatalogSnapshot({
    config,
    cacheKey: hasCustomKeys ? `user:${userId}` : 'base',
  });
  const discoveredModels = snapshot.providerResults
    .flatMap(result => result.models)
    .filter(model => model.free);

  return {
    config,
    configuredModels: discoveredModels.length > 0
      ? discoveredModels
      : snapshot.models.map(toProviderModel).filter((model): model is ProviderModel => Boolean(model)),
  };
}

export async function runChatCompletion(body: ChatRequestBody, options: ChatRunOptions = {}) {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new OpenProviderError('messages must be a non-empty array.', 400);
  }

  const session = options.userId === undefined ? await getServerSession(authOptions) : null;
  const userId = options.userId === undefined ? session?.user?.id ?? null : options.userId;
  const persist = options.persist ?? true;
  await enforceConversationLimit(body, userId, persist);
  const { config, configuredModels } = await loadChatModels(userId);
  const { candidates, explicitModel } = selectChatCandidates(body, configuredModels, config);
  const attempts: ChatAttempt[] = [];

  for (const model of candidates) {
    try {
      const providerResponse = await sendProviderChatCompletion(config, model, providerChatBody(body, model, false));
      const payload = await providerResponse.json();
      const text = extractChoiceText(payload);
      const reasoning = extractChoiceReasoning(payload);
      if (isProviderGeneratedFailure(model, text)) {
        throw providerGeneratedFailure(model);
      }

      if (!text.trim()) {
        throw emptyProviderResponseFailure(model);
      }

      const conversationId = persist
        ? await saveConversation(body, model, text, payload.usage, userId)
        : null;

      return {
        id: payload.id ?? `chatcmpl_${crypto.randomUUID()}`,
        model: model.id,
        modelName: model.name,
        provider: model.provider,
        content: text,
        reasoning,
        usage: payload.usage,
        conversationId,
        attempts,
        raw: payload,
      };
    } catch (error) {
      attempts.push(chatAttempt(model, error));

      if (explicitModel || !shouldTryNext(error)) {
        throw error;
      }
    }
  }

  const last = attempts.at(-1);
  throw new OpenProviderError(last?.error ?? 'No available chat model returned a response.', last?.status ?? 503);
}

export async function runChatCompletionStream(
  body: ChatRequestBody,
  options: ChatRunOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new OpenProviderError('messages must be a non-empty array.', 400);
  }

  const session = options.userId === undefined ? await getServerSession(authOptions) : null;
  const userId = options.userId === undefined ? session?.user?.id ?? null : options.userId;
  const persist = options.persist ?? true;
  await enforceConversationLimit(body, userId, persist);
  const { config, configuredModels } = await loadChatModels(userId);
  const { candidates, explicitModel } = selectChatCandidates(body, configuredModels, config);
  const attempts: ChatAttempt[] = [];

  if (!explicitModel && body.stream_strategy !== 'passthrough') {
    return streamAutoProviderResponse(config, body, candidates, userId, persist);
  }

  for (const model of candidates) {
    try {
      const providerResponse = await sendProviderChatCompletion(config, model, providerChatBody(body, model, true));
      const responseStream = streamProviderResponse(providerResponse, body, model, attempts, userId, persist);
      return responseStream;
    } catch (error) {
      attempts.push(chatAttempt(model, error));

      if (explicitModel || !shouldTryNext(error)) {
        throw error;
      }
    }
  }

  const last = attempts.at(-1);
  throw new OpenProviderError(last?.error ?? 'No available chat model returned a response.', last?.status ?? 503);
}

export async function listRecentConversations(userId: string) {
  const db = getDb();
  if (!db) {
    return [];
  }

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(20);
}

export async function getConversationWithMessages(userId: string, conversationId: string) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    return null;
  }

  const messages = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      tokenUsage: chatMessages.tokenUsage,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

  return {
    ...conversation,
    messages,
  };
}

export async function renameConversation(userId: string, conversationId: string, title: string) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const cleanTitle = title.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!cleanTitle) {
    throw new OpenProviderError('Conversation title cannot be empty.', 400);
  }

  const [conversation] = await db
    .update(conversations)
    .set({ title: cleanTitle })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning();

  return conversation ?? null;
}

export async function replaceConversationMessages(
  userId: string,
  conversationId: string,
  nextMessages: Array<{ role: 'user' | 'assistant'; content: string; tokenUsage?: unknown }>
) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const rows = nextMessages
    .filter(message => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
    .map((message, index) => ({
      id: crypto.randomUUID(),
      conversationId,
      role: message.role,
      content: message.content,
      tokenUsage: tokenUsageRecord(message.tokenUsage),
      createdAt: new Date(now.getTime() + index),
    }));

  await db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId));
  if (rows.length > 0) {
    await db.insert(chatMessages).values(rows);
  }

  const [conversation] = await db
    .update(conversations)
    .set({ updatedAt: now })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning();

  return conversation ?? null;
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    return false;
  }

  const deleted = await db
    .delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });

  return deleted.length > 0;
}
