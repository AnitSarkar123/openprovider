import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { CONVERSATION_LIMIT_ERROR_CODE, isConversationLimitError, runChatCompletion, runChatCompletionStream } from '@/lib/openprovider/chat';
import { recordSessionRequestTrace, statusCodeFromOpenProviderError } from '@/lib/openprovider/api-usage';
import { readJsonObject } from '@/lib/openprovider/request-guards';
import { redactSensitiveText } from '@/lib/openprovider/route-errors';
import { OpenProviderError } from '@/src/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatStreamTraceState = {
  error?: Error;
  model?: string;
  provider?: string;
  usage?: unknown;
};

function webChatErrorResponse(error: unknown) {
  const status = statusCodeFromOpenProviderError(error);
  const message = error instanceof SyntaxError
    ? 'Invalid JSON request body.'
    : error instanceof OpenProviderError
      ? redactSensitiveText(error.message)
      : 'Chat completion failed.';

  return NextResponse.json({
    error: {
      ...(isConversationLimitError(error) ? { code: CONVERSATION_LIMIT_ERROR_CODE } : {}),
      message,
      type: error instanceof OpenProviderError ? error.name : 'OpenProviderRouteError',
    },
  }, {
    headers: privateBrowserCacheHeaders(),
    status,
  });
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

function updateChatStreamTraceState(state: ChatStreamTraceState, block: string): void {
  const parsed = parseSseBlock(block);
  if (!parsed?.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return;
  }

  const data = parsed.data as Record<string, unknown>;
  if ((parsed.event === 'metadata' || parsed.event === 'done') && typeof data.model === 'string') {
    state.model = data.model;
  }

  if ((parsed.event === 'metadata' || parsed.event === 'done') && typeof data.provider === 'string') {
    state.provider = data.provider;
  }

  if (parsed.event === 'done' && data.usage) {
    state.usage = data.usage;
  }

  if (parsed.event === 'error') {
    state.error = new Error(typeof data.message === 'string' ? data.message : 'Streaming chat request failed.');
  }
}

function traceChatStream({
  body,
  startedAt,
  stream,
  userId,
}: {
  body: Record<string, unknown>;
  startedAt: number;
  stream: ReadableStream<Uint8Array>;
  userId: string;
}): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const streamDecoder = new TextDecoder();
  const state: ChatStreamTraceState = {};
  let buffer = '';
  let recorded = false;

  function consumeChunk(chunk: Uint8Array, flush = false) {
    buffer += streamDecoder.decode(chunk, { stream: !flush });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      updateChatStreamTraceState(state, block);
    }

    if (flush && buffer.trim()) {
      updateChatStreamTraceState(state, buffer);
      buffer = '';
    }
  }

  async function recordOnce(statusCode?: number) {
    if (recorded) {
      return;
    }

    recorded = true;
    await recordSessionRequestTrace({
      userId,
      body,
      endpoint: '/api/chat',
      error: state.error,
      method: 'POST',
      ok: !state.error,
      provider: state.provider,
      routedModel: state.model,
      source: 'web-chat',
      startedAt,
      statusCode: statusCode ?? (state.error ? statusCodeFromOpenProviderError(state.error) : 200),
      tokenUsage: state.usage,
      workflow: 'chat',
    });
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            consumeChunk(new Uint8Array(), true);
            await recordOnce();
            controller.close();
            return;
          }

          if (value) {
            consumeChunk(value);
            controller.enqueue(value);
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
  const startedAt = Date.now();
  let body: Record<string, unknown> | undefined;
  let userId: string | undefined;

  try {
    const session = await getServerSession(authOptions);
    userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: { message: 'Sign in to use chat.' } },
        { headers: privateBrowserCacheHeaders(), status: 401 }
      );
    }

    body = await readJsonObject(request);
    if (body?.stream === true) {
      const stream = await runChatCompletionStream(body, { userId });
      return new Response(traceChatStream({ body, startedAt, stream, userId }), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const result = await runChatCompletion(body, { userId });
    await recordSessionRequestTrace({
      userId,
      body,
      endpoint: '/api/chat',
      method: 'POST',
      ok: true,
      provider: result.provider,
      routedModel: result.model,
      source: 'web-chat',
      startedAt,
      statusCode: 200,
      tokenUsage: result.usage,
      workflow: 'chat',
    });
    return NextResponse.json(result, {
      headers: privateBrowserCacheHeaders(),
    });
  } catch (error) {
    if (userId) {
      await recordSessionRequestTrace({
        userId,
        body,
        endpoint: '/api/chat',
        error,
        method: 'POST',
        ok: false,
        source: 'web-chat',
        startedAt,
        statusCode: statusCodeFromOpenProviderError(error),
        workflow: 'chat',
      });
    }
    return webChatErrorResponse(error);
  }
}
