import { OpenProviderError } from '../utils/errors';
import { OpenProviderConfig, ProviderId, ProviderModel, ProviderRuntimeConfig } from '../core/types';
import { bearerAuthorizationHeader, bearerToken } from '../utils/auth';

type ChatCompletionBody = Record<string, unknown>;

const OPTIONAL_CHAT_AUTH_PROVIDERS = new Set<ProviderId>(['openprovider', 'llm7', 'pollinations']);
const ANTHROPIC_MESSAGES_VERSION = '2023-06-01';

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function anthropicMessagesEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/messages`;
}

function modelBaseUrl(provider: ProviderRuntimeConfig, model: ProviderModel): string {
  return model.routeBaseUrl?.trim() || provider.baseUrl;
}

function apiFreeLlmEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat`;
}

function readRequestedStream(body: ChatCompletionBody): boolean {
  return body.stream === true;
}

function providerRequiresChatToken(providerId: ProviderId): boolean {
  return !OPTIONAL_CHAT_AUTH_PROVIDERS.has(providerId);
}

function providerRequiresChatTokenForConfig(provider: ProviderRuntimeConfig): boolean {
  return providerRequiresChatToken(provider.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textFromContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }

      if (!isRecord(part)) {
        return '';
      }

      if (typeof part.text === 'string') {
        return part.text;
      }

      if (typeof part.content === 'string') {
        return part.content;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeChatRole(role: unknown): string {
  if (typeof role !== 'string') {
    return 'user';
  }

  const normalized = role.trim().toLowerCase();
  if (normalized === 'model') {
    return 'assistant';
  }

  if (['system', 'developer', 'user', 'assistant', 'tool', 'function'].includes(normalized)) {
    return normalized;
  }

  return 'user';
}

function sanitizeContentPart(part: unknown): unknown | undefined {
  if (typeof part === 'string') {
    return { type: 'text', text: part };
  }

  if (!isRecord(part)) {
    return undefined;
  }

  const type = typeof part.type === 'string' ? part.type : '';

  if ((type === 'text' || type === 'input_text') && typeof part.text === 'string') {
    return { type: 'text', text: part.text };
  }

  if (type === 'image_url') {
    const imageUrl = part.image_url;
    if (typeof imageUrl === 'string') {
      return { type: 'image_url', image_url: imageUrl };
    }

    if (isRecord(imageUrl) && typeof imageUrl.url === 'string') {
      return {
        type: 'image_url',
        image_url: {
          url: imageUrl.url,
          ...(typeof imageUrl.detail === 'string' ? { detail: imageUrl.detail } : {}),
        },
      };
    }
  }

  if (type === 'input_image') {
    const url = typeof part.image_url === 'string'
      ? part.image_url
      : typeof part.url === 'string'
        ? part.url
        : undefined;

    if (url) {
      return { type: 'image_url', image_url: { url } };
    }
  }

  return undefined;
}

function sanitizeMessageContent(content: unknown): string | null | unknown[] {
  if (content === null) {
    return null;
  }

  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(sanitizeContentPart)
    .filter((part): part is unknown => part !== undefined);
}

function sanitizeFunctionCall(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = typeof value.name === 'string' ? value.name : undefined;
  const args = value.arguments;
  const argumentsJson = typeof args === 'string'
    ? args
    : args === undefined
      ? undefined
      : JSON.stringify(args);

  if (!name && argumentsJson === undefined) {
    return undefined;
  }

  return {
    ...(name ? { name } : {}),
    ...(argumentsJson !== undefined ? { arguments: argumentsJson } : {}),
  };
}

function sanitizeToolCall(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const functionCall = sanitizeFunctionCall(value.function);
  if (!functionCall) {
    return undefined;
  }

  return {
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    type: 'function',
    function: functionCall,
  };
}

function sanitizeChatMessage(message: unknown): Record<string, unknown> | undefined {
  if (!isRecord(message)) {
    return undefined;
  }

  const role = normalizeChatRole(message.role);
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map(sanitizeToolCall).filter((call): call is Record<string, unknown> => Boolean(call))
    : undefined;
  const functionCall = sanitizeFunctionCall(message.function_call);
  const content = sanitizeMessageContent(message.content);

  return {
    role,
    content: content === '' && role === 'assistant' && toolCalls?.length ? null : content,
    ...(typeof message.name === 'string' ? { name: message.name } : {}),
    ...(typeof message.tool_call_id === 'string' ? { tool_call_id: message.tool_call_id } : {}),
    ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
    ...(functionCall ? { function_call: functionCall } : {}),
  };
}

function sanitizeChatMessages(messages: unknown): Record<string, unknown>[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map(sanitizeChatMessage)
    .filter((message): message is Record<string, unknown> => Boolean(message));
}

function copyIfPresent(source: ChatCompletionBody, target: ChatCompletionBody, key: string): void {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    target[key] = source[key];
  }
}

function omitChatKeys(body: ChatCompletionBody, keys: string[]): ChatCompletionBody {
  const next = { ...body };

  for (const key of keys) {
    delete next[key];
  }

  return next;
}

function sanitizeChatCompletionBody(body: ChatCompletionBody): ChatCompletionBody {
  const sanitized: ChatCompletionBody = {
    messages: sanitizeChatMessages(body.messages),
  };
  const keys = [
    'model',
    'temperature',
    'top_p',
    'max_tokens',
    'max_completion_tokens',
    'stream',
    'stop',
    'n',
    'presence_penalty',
    'frequency_penalty',
    'logit_bias',
    'user',
    'tools',
    'tool_choice',
    'functions',
    'function_call',
    'response_format',
    'seed',
    'stream_options',
    'parallel_tool_calls',
    'logprobs',
    'top_logprobs',
    'thinking',
    'include_reasoning',
    'reasoning',
    'reasoning_effort',
    'reasoning_format',
  ];

  for (const key of keys) {
    copyIfPresent(body, sanitized, key);
  }

  return sanitized;
}

function apiFreeLlmPrompt(body: ChatCompletionBody): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  return messages
    .map(message => {
      if (!isRecord(message)) {
        return '';
      }

      const role = typeof message.role === 'string' ? message.role : 'user';
      const content = textFromContent(message.content).trim();

      return content ? `${role}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function openAiChatPayload(model: ProviderModel, content: string, raw: unknown) {
  return {
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model.modelId,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: undefined,
    raw,
  };
}

function openAiStreamPayload(model: ProviderModel, content: string): string {
  const id = `chatcmpl_${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: model.modelId,
    choices: [
      {
        index: 0,
        delta: {
          content,
        },
        finish_reason: null,
      },
    ],
  };
  const done = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: model.modelId,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop',
      },
    ],
  };

  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

function positiveIntegerValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function anthropicTextBlock(text: string): Record<string, unknown> | undefined {
  return text ? { type: 'text', text } : undefined;
}

function anthropicImageBlockFromUrl(url: string): Record<string, unknown> | undefined {
  const dataUrlMatch = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    };
  }

  if (/^https?:\/\//i.test(url)) {
    return {
      type: 'image',
      source: {
        type: 'url',
        url,
      },
    };
  }

  return undefined;
}

function anthropicContentPart(part: unknown): Record<string, unknown> | undefined {
  if (typeof part === 'string') {
    return anthropicTextBlock(part);
  }

  if (!isRecord(part)) {
    return undefined;
  }

  const type = typeof part.type === 'string' ? part.type : '';
  if ((type === 'text' || type === 'input_text') && typeof part.text === 'string') {
    return anthropicTextBlock(part.text);
  }

  if (type === 'image_url') {
    const imageUrl = part.image_url;
    const url = typeof imageUrl === 'string'
      ? imageUrl
      : isRecord(imageUrl) && typeof imageUrl.url === 'string'
        ? imageUrl.url
        : undefined;
    return url ? anthropicImageBlockFromUrl(url) : undefined;
  }

  if (type === 'input_image') {
    const url = typeof part.image_url === 'string'
      ? part.image_url
      : typeof part.url === 'string'
        ? part.url
        : undefined;
    return url ? anthropicImageBlockFromUrl(url) : undefined;
  }

  return undefined;
}

function anthropicMessageContent(content: unknown): string | Record<string, unknown>[] {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return textFromContent(content);
  }

  const parts = content
    .map(anthropicContentPart)
    .filter((part): part is Record<string, unknown> => Boolean(part));

  return parts.length > 0 ? parts : textFromContent(content);
}

function hasToolUse(body: ChatCompletionBody, messages: Record<string, unknown>[]): boolean {
  return Boolean(
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    body.tool_choice !== undefined ||
    (Array.isArray(body.functions) && body.functions.length > 0) ||
    body.function_call !== undefined ||
    messages.some(message => (
      message.role === 'tool' ||
      message.role === 'function' ||
      Array.isArray(message.tool_calls) ||
      message.function_call !== undefined ||
      typeof message.tool_call_id === 'string'
    ))
  );
}

function anthropicMessagesPayload(model: ProviderModel, body: ChatCompletionBody): ChatCompletionBody {
  const messages = sanitizeChatMessages(body.messages);

  if (hasToolUse(body, messages)) {
    throw new OpenProviderError('FreeModel Claude route uses Anthropic Messages; OpenProvider tool-call translation is not implemented for this route yet.', 501);
  }

  const system: string[] = [];
  const anthropicMessages: Record<string, unknown>[] = [];

  for (const message of messages) {
    const role = typeof message.role === 'string' ? message.role : 'user';
    if (role === 'system' || role === 'developer') {
      const text = textFromContent(message.content).trim();
      if (text) {
        system.push(text);
      }
      continue;
    }

    if (role !== 'user' && role !== 'assistant') {
      continue;
    }

    anthropicMessages.push({
      role,
      content: anthropicMessageContent(message.content),
    });
  }

  if (anthropicMessages.length === 0) {
    throw new OpenProviderError('FreeModel Claude route requires at least one user or assistant message.', 400);
  }

  const maxTokens = positiveIntegerValue(body.max_tokens)
    ?? positiveIntegerValue(body.max_completion_tokens)
    ?? Math.min(Math.max(1024, model.maxOutputTokens || 4096), 8192);
  const payload: ChatCompletionBody = {
    model: providerApiModelId(model),
    max_tokens: maxTokens,
    messages: anthropicMessages,
    stream: false,
  };

  if (system.length > 0) {
    payload.system = system.join('\n\n');
  }

  copyIfPresent(body, payload, 'temperature');
  copyIfPresent(body, payload, 'top_p');
  if (body.stop !== undefined) {
    payload.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }

  return payload;
}

function anthropicTextFromPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    return '';
  }

  const content = payload.content;
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

      if (!isRecord(part)) {
        return '';
      }

      return typeof part.text === 'string' ? part.text : '';
    })
    .filter(Boolean)
    .join('');
}

function anthropicFinishReason(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.stop_reason !== 'string') {
    return null;
  }

  if (payload.stop_reason === 'end_turn' || payload.stop_reason === 'stop_sequence') {
    return 'stop';
  }

  if (payload.stop_reason === 'max_tokens') {
    return 'length';
  }

  return payload.stop_reason;
}

function anthropicUsage(payload: unknown): Record<string, unknown> | undefined {
  const usage = isRecord(payload) ? payload.usage : undefined;
  if (!isRecord(usage)) {
    return undefined;
  }

  return {
    prompt_tokens: positiveIntegerValue(usage.input_tokens) ?? 0,
    completion_tokens: positiveIntegerValue(usage.output_tokens) ?? 0,
    total_tokens: (positiveIntegerValue(usage.input_tokens) ?? 0) + (positiveIntegerValue(usage.output_tokens) ?? 0),
    anthropic: usage,
  };
}

function openAiChatPayloadFromAnthropic(model: ProviderModel, content: string, raw: unknown) {
  return {
    id: isRecord(raw) && typeof raw.id === 'string' ? raw.id : `chatcmpl_${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model.modelId,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: anthropicFinishReason(raw),
      },
    ],
    usage: anthropicUsage(raw),
    raw,
  };
}

function assertUsableFreeModelClaudeResponse(model: ProviderModel, content: string, raw: unknown): void {
  if (model.provider !== 'freemodel') {
    return;
  }

  if (/^\s*please use claude code cli\.?\s*$/i.test(content)) {
    throw new OpenProviderError(
      'FreeModel returned its Claude Code CLI-only response for this Claude route. Use a FreeModel key/client that is allowed to call the Anthropic Messages API, or choose a FreeModel OpenAI-compatible model.',
      501,
      JSON.stringify(raw)
    );
  }
}

function apiFreeLlmErrorMessage(detail: string, fallback: string): string {
  try {
    const payload = JSON.parse(detail) as unknown;
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // Provider sometimes returns plain text on edge failures.
  }

  return fallback;
}

function readReasoningPreference(body: ChatCompletionBody): boolean | undefined {
  if (typeof body.thinking === 'boolean') {
    return body.thinking;
  }

  if (isRecord(body.thinking) && typeof body.thinking.type === 'string') {
    return body.thinking.type.toLowerCase() !== 'disabled';
  }

  if (typeof body.include_reasoning === 'boolean') {
    return body.include_reasoning;
  }

  if (typeof body.reasoning === 'boolean') {
    return body.reasoning;
  }

  if (isRecord(body.reasoning)) {
    if (body.reasoning.exclude === true || body.reasoning.enabled === false) {
      return false;
    }

    return true;
  }

  if (typeof body.reasoning_effort === 'string' && body.reasoning_effort.trim()) {
    return true;
  }

  return undefined;
}

function omitReasoningKeys(body: ChatCompletionBody): ChatCompletionBody {
  const {
    thinking,
    include_reasoning,
    reasoning,
    reasoning_effort,
    reasoning_format,
    ...rest
  } = body;

  void thinking;
  void include_reasoning;
  void reasoning;
  void reasoning_effort;
  void reasoning_format;

  return rest;
}

function applyReasoningOptions(model: ProviderModel, body: ChatCompletionBody): ChatCompletionBody {
  const preference = readReasoningPreference(body);

  if (preference === undefined) {
    return body;
  }

  const next = omitReasoningKeys(body);
  if (model.provider === 'atxp') {
    return next;
  }

  if (!model.supportsReasoning) {
    return next;
  }

  if (model.provider === 'zai') {
    return {
      ...next,
      thinking: {
        type: preference ? 'enabled' : 'disabled',
      },
    };
  }

  if (model.provider === 'openrouter' || model.provider === 'openprovider') {
    const reasoning = isRecord(body.reasoning) && preference
      ? body.reasoning
      : preference
        ? { effort: typeof body.reasoning_effort === 'string' ? body.reasoning_effort : 'medium' }
        : { exclude: true };

    return {
      ...next,
      reasoning,
    };
  }

  if (model.provider === 'groq') {
    const isGptOss = model.modelId.toLowerCase().includes('gpt-oss');

    if (isGptOss) {
      return {
        ...next,
        include_reasoning: preference,
        ...(preference && typeof body.reasoning_effort === 'string' ? { reasoning_effort: body.reasoning_effort } : {}),
      };
    }

    return {
      ...next,
      reasoning_format: preference ? 'parsed' : 'hidden',
    };
  }

  if (model.provider === 'nvidia') {
    const effort = typeof body.reasoning_effort === 'string' ? body.reasoning_effort : 'medium';
    const existingTemplateKwargs = isRecord(body.chat_template_kwargs) ? body.chat_template_kwargs : {};

    return {
      ...next,
      chat_template_kwargs: {
        ...existingTemplateKwargs,
        enable_thinking: preference,
      },
      ...(preference && model.modelId.toLowerCase().includes('gpt-oss') ? { reasoning_effort: effort } : {}),
    };
  }

  if (model.provider === 'google') {
    return {
      ...next,
      ...(preference ? { reasoning_effort: typeof body.reasoning_effort === 'string' ? body.reasoning_effort : 'medium' } : {}),
    };
  }

  if (model.provider === 'siliconflow') {
    return {
      ...next,
      enable_thinking: preference,
    };
  }

  return next;
}

function atxpChatModelId(modelId: string): string {
  const normalized = modelId.trim().replace(/^~?anthropic\//i, '');

  if (/^claude-opus-(?:latest|4)$/i.test(normalized)) {
    return 'claude-opus-4-7';
  }

  if (/^claude-(?:opus|sonnet|haiku)-\d+\.\d+/i.test(normalized)) {
    return normalized.replace(/(\d+)\.(\d+)/, '$1-$2');
  }

  return normalized;
}

function providerApiModelId(model: ProviderModel): string {
  return model.provider === 'atxp' ? atxpChatModelId(model.modelId) : model.modelId;
}

function applyProviderCompatibilityOptions(model: ProviderModel, body: ChatCompletionBody): ChatCompletionBody {
  if (model.provider !== 'atxp') {
    return body;
  }

  const apiModelId = typeof body.model === 'string' ? body.model : providerApiModelId(model);

  if (/^claude-opus-4-7$/i.test(apiModelId)) {
    return omitChatKeys(body, ['temperature']);
  }

  return body;
}

function providerErrorDetail(detail: string): string | undefined {
  if (!detail.trim()) {
    return undefined;
  }

  try {
    const payload = JSON.parse(detail) as unknown;
    if (!isRecord(payload)) {
      return undefined;
    }

    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail.trim();
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }

    const error = isRecord(payload.error) ? payload.error : undefined;
    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  } catch {
    return detail.trim().slice(0, 240);
  }

  return undefined;
}

function providerChatErrorMessage(
  model: ProviderModel,
  status: number,
  detail: string
): string {
  const parsedDetail = providerErrorDetail(detail);

  if (status === 404 || status === 410) {
    const providerName = model.provider === 'nvidia' ? 'NVIDIA' : model.provider;
    return [
      `${providerName} model "${model.modelId}" is listed in the provider catalog but is not callable via chat completions for this account, or the provider has removed/deprecated this hosted route.`,
      parsedDetail ? `Provider detail: ${parsedDetail}` : undefined,
    ].filter(Boolean).join(' ');
  }

  return [
    `${model.provider} chat completion failed with status ${status}.`,
    parsedDetail ? `Provider detail: ${parsedDetail}` : undefined,
  ].filter(Boolean).join(' ');
}

async function sendApiFreeLlmChatCompletion(
  provider: ProviderRuntimeConfig,
  model: ProviderModel,
  body: ChatCompletionBody,
  options: { signal?: AbortSignal } = {}
): Promise<Response> {
  const message = apiFreeLlmPrompt(body);

  if (!message) {
    throw new OpenProviderError('ApiFreeLLM requires at least one text message.', 400);
  }

  const authorization = bearerAuthorizationHeader(provider.apiKey);
  if (!authorization) {
    throw new OpenProviderError('ApiFreeLLM API key is not configured.', 503);
  }

  const response = await fetch(apiFreeLlmEndpoint(provider.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      message,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new OpenProviderError(
        apiFreeLlmErrorMessage(
          detail,
          'ApiFreeLLM rejected the saved API key. Re-save the key from ApiFreeLLM API Access and paste only the token value.'
        ),
        response.status,
        detail
      );
    }

    if (response.status === 429) {
      throw new OpenProviderError(
        apiFreeLlmErrorMessage(detail, 'ApiFreeLLM rate limit exceeded. Wait 40 seconds before trying this key again.'),
        response.status,
        detail
      );
    }

    throw new OpenProviderError(
      `apifreellm chat completion failed with status ${response.status}.`,
      response.status,
      detail
    );
  }

  const payload = await response.json();
  const content = isRecord(payload) && typeof payload.response === 'string' ? payload.response : '';

  if (body.stream === true) {
    return new Response(openAiStreamPayload(model, content), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }

  return Response.json(openAiChatPayload(model, content, payload));
}

async function sendAnthropicMessagesChatCompletion(
  provider: ProviderRuntimeConfig,
  model: ProviderModel,
  body: ChatCompletionBody,
  options: { signal?: AbortSignal } = {}
): Promise<Response> {
  const token = bearerToken(provider.apiKey);
  if (!token) {
    throw new OpenProviderError(`${model.provider} API key is not configured.`, 503);
  }

  const response = await fetch(anthropicMessagesEndpoint(modelBaseUrl(provider, model)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'anthropic-version': ANTHROPIC_MESSAGES_VERSION,
      'x-api-key': token,
    },
    body: JSON.stringify(anthropicMessagesPayload(model, body)),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenProviderError(
      providerChatErrorMessage(model, response.status, detail),
      response.status,
      detail
    );
  }

  const payload = await response.json().catch(() => undefined) as unknown;
  const content = anthropicTextFromPayload(payload);
  assertUsableFreeModelClaudeResponse(model, content, payload);

  if (!content) {
    throw new OpenProviderError(`${model.provider} returned an empty Anthropic Messages response.`, 502);
  }

  if (body.stream === true) {
    return new Response(openAiStreamPayload(model, content), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }

  return Response.json(openAiChatPayloadFromAnthropic(model, content, payload));
}

export async function sendProviderChatCompletion(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ChatCompletionBody,
  options: { signal?: AbortSignal } = {}
): Promise<Response> {
  const provider = config.providers[model.provider];
  const usesProviderAuth = model.routeUsesProviderAuth !== false;
  const token = provider && usesProviderAuth ? bearerToken(provider.apiKey) : '';

  if (!provider?.enabled || (providerRequiresChatTokenForConfig(provider) && !token)) {
    throw new OpenProviderError(`${model.provider} API key is not configured.`, 503);
  }

  if (model.provider === 'apifreellm') {
    return sendApiFreeLlmChatCompletion(provider, model, body, options);
  }

  if (model.routeFormat === 'anthropic-messages') {
    return sendAnthropicMessagesChatCompletion(provider, model, body, options);
  }

  const stream = readRequestedStream(body);
  const sanitizedBody = sanitizeChatCompletionBody(body);
  const providerBodyBase = applyProviderCompatibilityOptions(model, applyReasoningOptions(model, {
    ...sanitizedBody,
    model: providerApiModelId(model),
  }));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint(modelBaseUrl(provider, model)), {
    method: 'POST',
    headers,
    body: JSON.stringify(providerBodyBase),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenProviderError(
      providerChatErrorMessage(model, response.status, detail),
      response.status,
      detail
    );
  }

  return response;
}
