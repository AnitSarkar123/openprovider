import { NextResponse } from 'next/server';
import { requireOpenProviderApiKey } from '@/lib/openprovider/api-auth';
import { recordOpenProviderApiUsage, statusCodeFromOpenProviderError } from '@/lib/openprovider/api-usage';
import type { AuthenticatedOpenProviderApiKey } from '@/lib/openprovider/api-keys';
import { runChatCompletion, runChatCompletionStream } from '@/lib/openprovider/chat';
import { readJsonObject } from '@/lib/openprovider/request-guards';
import { openProviderErrorResponse } from '@/lib/openprovider/route-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StreamUsageRecordingInput = {
  auth: AuthenticatedOpenProviderApiKey;
  body: Record<string, unknown>;
  startedAt: number;
  stream: ReadableStream<Uint8Array>;
};

type StreamRouteState = {
  id?: string;
  error?: Error;
  provider?: string;
  model?: string;
  attempts?: unknown;
  toolCallCount?: number;
  usage?: unknown;
};

const streamEncoder = new TextEncoder();

function resultPayload(result: Awaited<ReturnType<typeof runChatCompletion>>) {
  if (result.raw && typeof result.raw === 'object' && !Array.isArray(result.raw)) {
    return {
      ...result.raw,
      model: result.model,
      openprovider: {
        provider: result.provider,
        attempts: result.attempts,
      },
    };
  }

  return {
    id: result.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: result.content,
          reasoning: result.reasoning || undefined,
        },
        finish_reason: 'stop',
      },
    ],
    openprovider: {
      provider: result.provider,
      attempts: result.attempts,
    },
  };
}

function parseSseBlock(block: string): { data?: unknown; event?: string } | null {
  const lines = block.split(/\r?\n/);
  const event = lines
    .find(line => line.startsWith('event:'))
    ?.slice('event:'.length)
    .trim();
  const data = lines
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trimStart())
    .join('\n')
    .trim();

  if (!event && !data) {
    return null;
  }

  if (!data || data === '[DONE]') {
    return { event };
  }

  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event };
  }
}

function updateStreamRouteState(state: StreamRouteState, block: string): void {
  const parsed = parseSseBlock(block);
  if (!parsed || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return;
  }

  const data = parsed.data as Record<string, unknown>;
  if ((parsed.event === 'metadata' || parsed.event === 'done') && typeof data.id === 'string') {
    state.id = data.id;
  }

  if ((parsed.event === 'metadata' || parsed.event === 'done') && typeof data.provider === 'string') {
    state.provider = data.provider;
  }

  if ((parsed.event === 'metadata' || parsed.event === 'done') && typeof data.model === 'string') {
    state.model = data.model;
  }

  if ((parsed.event === 'metadata' || parsed.event === 'error') && Array.isArray(data.attempts)) {
    state.attempts = data.attempts;
  }

  if (parsed.event === 'tool') {
    state.toolCallCount = (state.toolCallCount ?? 0) + 1;
  }

  if (parsed.event === 'done' && data.usage) {
    state.usage = data.usage;
  }

  if (parsed.event === 'error') {
    const message = typeof data.message === 'string' ? data.message : 'Streaming chat request failed.';
    state.error = new Error(message);
  }
}

function recordStreamCompletion({
  auth,
  body,
  startedAt,
  state,
  statusCode,
}: {
  auth: StreamUsageRecordingInput['auth'];
  body: Record<string, unknown>;
  startedAt: number;
  state: StreamRouteState;
  statusCode?: number;
}) {
  return recordOpenProviderApiUsage({
    auth,
    body,
    endpoint: '/v1/chat/completions',
    error: state.error,
    method: 'POST',
    ok: !state.error,
    provider: state.provider,
    routedModel: state.model,
    startedAt,
    statusCode: statusCode ?? (state.error ? statusCodeFromOpenProviderError(state.error) : 200),
    tokenUsage: state.usage,
    workflow: 'chat',
  });
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function encodeOpenAIChunk(data: unknown): Uint8Array {
  return streamEncoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function encodeOpenAIDone(): Uint8Array {
  return streamEncoder.encode('data: [DONE]\n\n');
}

function encodeOpenAIError(message: string): Uint8Array {
  return streamEncoder.encode(`event: error\ndata: ${JSON.stringify({ error: { message } })}\n\n`);
}

function openProviderMetadata(state: StreamRouteState) {
  return {
    provider: state.provider,
    attempts: Array.isArray(state.attempts) ? state.attempts : undefined,
  };
}

function openAIStreamChunk({
  state,
  requestedModel,
  created,
  delta,
  finishReason,
  usage,
}: {
  state: StreamRouteState;
  requestedModel: string;
  created: number;
  delta: Record<string, unknown>;
  finishReason: string | null;
  usage?: unknown;
}) {
  return {
    id: state.id ?? `chatcmpl_${crypto.randomUUID()}`,
    object: 'chat.completion.chunk',
    created,
    model: state.model ?? requestedModel,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
    usage,
    openprovider: openProviderMetadata(state),
  };
}

function normaliseToolCallDelta(toolCall: unknown): Record<string, unknown> | undefined {
  const record = asRecord(toolCall);
  if (!record) {
    return undefined;
  }

  const functionRecord = asRecord(record.function);
  const hasFunctionArguments = Boolean(functionRecord && hasOwn(functionRecord, 'arguments'));
  const hasArguments = hasOwn(record, 'arguments');
  const hasArgs = hasOwn(record, 'args');
  const hasInput = hasOwn(record, 'input');
  const name = typeof functionRecord?.name === 'string'
    ? functionRecord.name
    : typeof record.name === 'string'
      ? record.name
      : undefined;
  const argumentsJson = hasFunctionArguments && typeof functionRecord?.arguments === 'string'
    ? functionRecord.arguments
    : hasArguments && typeof record.arguments === 'string'
      ? record.arguments
      : hasInput && typeof record.input === 'string'
        ? record.input
        : hasArguments || hasArgs || hasInput
          ? JSON.stringify(record.arguments ?? record.args ?? record.input ?? {})
          : undefined;

  if (!record.id && !name && argumentsJson === undefined) {
    return undefined;
  }

  const functionDelta: Record<string, unknown> = {};
  if (name) {
    functionDelta.name = name;
  }
  if (argumentsJson !== undefined) {
    functionDelta.arguments = argumentsJson;
  }

  return {
    index: typeof record.index === 'number' ? record.index : 0,
    id: typeof record.id === 'string' ? record.id : undefined,
    type: record.type === 'function' || name || argumentsJson !== undefined ? 'function' : record.type,
    function: functionDelta,
  };
}

function openAIChunksFromInternalEvent({
  parsed,
  state,
  requestedModel,
  created,
}: {
  parsed: { data?: unknown; event?: string };
  state: StreamRouteState;
  requestedModel: string;
  created: number;
}): Uint8Array[] {
  const data = asRecord(parsed.data);
  if (!data) {
    return [];
  }

  if (Array.isArray(data.choices)) {
    return [encodeOpenAIChunk(data)];
  }

  if (parsed.event === 'delta' && typeof data.content === 'string') {
    return [encodeOpenAIChunk(openAIStreamChunk({
      state,
      requestedModel,
      created,
      delta: { content: data.content },
      finishReason: null,
    }))];
  }

  if (parsed.event === 'reasoning' && typeof data.content === 'string') {
    return [encodeOpenAIChunk(openAIStreamChunk({
      state,
      requestedModel,
      created,
      delta: {
        reasoning: data.content,
        reasoning_content: data.content,
      },
      finishReason: null,
    }))];
  }

  if (parsed.event === 'tool') {
    const toolCall = normaliseToolCallDelta(data.toolCall ?? data);
    if (!toolCall) {
      return [];
    }

    return [encodeOpenAIChunk(openAIStreamChunk({
      state,
      requestedModel,
      created,
      delta: { tool_calls: [toolCall] },
      finishReason: null,
    }))];
  }

  if (parsed.event === 'done') {
    return [
      encodeOpenAIChunk(openAIStreamChunk({
        state,
        requestedModel,
        created,
        delta: {},
        finishReason: state.toolCallCount ? 'tool_calls' : 'stop',
        usage: data.usage,
      })),
      encodeOpenAIDone(),
    ];
  }

  if (parsed.event === 'error') {
    const message = typeof data.message === 'string' ? data.message : 'Streaming chat request failed.';
    return [encodeOpenAIError(message)];
  }

  return [];
}

function withOpenAICompatibleStream({
  auth,
  body,
  startedAt,
  stream,
}: StreamUsageRecordingInput): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const state: StreamRouteState = {};
  const requestedModel = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : 'openprovider/auto-free';
  const created = Math.floor(Date.now() / 1000);
  let buffer = '';
  let recorded = false;

  async function recordOnce(statusCode?: number) {
    if (recorded) {
      return;
    }

    recorded = true;
    await recordStreamCompletion({ auth, body, startedAt, state, statusCode });
  }

  function consumeChunk(chunk: Uint8Array, controller: ReadableStreamDefaultController<Uint8Array>, flush = false) {
    buffer += decoder.decode(chunk, { stream: !flush });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      updateStreamRouteState(state, block);
      const parsed = parseSseBlock(block);
      if (!parsed) {
        continue;
      }
      for (const outputChunk of openAIChunksFromInternalEvent({ parsed, state, requestedModel, created })) {
        controller.enqueue(outputChunk);
      }
    }

    if (flush && buffer.trim()) {
      updateStreamRouteState(state, buffer);
      const parsed = parseSseBlock(buffer);
      if (parsed) {
        for (const outputChunk of openAIChunksFromInternalEvent({ parsed, state, requestedModel, created })) {
          controller.enqueue(outputChunk);
        }
      }
      buffer = '';
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            consumeChunk(new Uint8Array(), controller, true);
            await recordOnce();
            controller.close();
            return;
          }

          if (value) {
            consumeChunk(value, controller);
          }
        }
      } catch (error) {
        state.error = error instanceof Error ? error : new Error('Streaming chat request failed.');
        await recordOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      state.error = reason instanceof Error ? reason : new Error('Client disconnected while streaming.');
      await reader.cancel(reason);
      await recordOnce(499);
    },
  });
}

export async function POST(request: Request) {
  const authResult = await requireOpenProviderApiKey(request);
  if ('response' in authResult) return authResult.response;
  const startedAt = Date.now();
  let body: Record<string, unknown> | undefined;

  try {
    const requestBody = await readJsonObject(request);
    body = requestBody;
    if (requestBody.stream === true) {
      const stream = await runChatCompletionStream(requestBody, {
        persist: false,
        userId: authResult.auth.userId,
      });
      return new Response(withOpenAICompatibleStream({
        auth: authResult.auth,
        body: requestBody,
        startedAt,
        stream,
      }), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const result = await runChatCompletion(requestBody, {
      persist: false,
      userId: authResult.auth.userId,
    });
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body: requestBody,
      endpoint: '/v1/chat/completions',
      method: 'POST',
      ok: true,
      provider: result.provider,
      routedModel: result.model,
      startedAt,
      statusCode: 200,
      tokenUsage: result.usage,
      workflow: 'chat',
    });

    return NextResponse.json(resultPayload(result));
  } catch (error) {
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/chat/completions',
      error,
      method: 'POST',
      ok: false,
      startedAt,
      statusCode: statusCodeFromOpenProviderError(error),
      workflow: 'chat',
    });
    return openProviderErrorResponse(error, 'Chat completion failed.');
  }
}
