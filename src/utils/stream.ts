import { ChatStreamEvent } from '../core/types';

type StreamState = {
  pendingText: string;
};

function parseJsonPayload(payload: string): unknown | undefined {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

function readFirstString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function textFromContent(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const text = value
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object') {
        return '';
      }

      const record = item as Record<string, unknown>;
      return typeof record.text === 'string'
        ? record.text
        : typeof record.content === 'string'
          ? record.content
          : '';
    })
    .filter(Boolean)
    .join('');

  return text || undefined;
}

function textFromReasoningDetails(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const text = value
    .map(item => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const record = item as Record<string, unknown>;
      return typeof record.text === 'string'
        ? record.text
        : typeof record.summary === 'string'
          ? record.summary
          : typeof record.content === 'string'
            ? record.content
            : '';
    })
    .filter(Boolean)
    .join('');

  return text || undefined;
}

function readChoiceDelta(chunk: unknown): { content?: string; reasoning?: string; toolCalls?: unknown[] } {
  const record = chunk && typeof chunk === 'object' ? chunk as Record<string, unknown> : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === 'object'
    ? choices[0] as Record<string, unknown>
    : undefined;
  const delta = firstChoice?.delta && typeof firstChoice.delta === 'object'
    ? firstChoice.delta as Record<string, unknown>
    : undefined;
  const message = firstChoice?.message && typeof firstChoice.message === 'object'
    ? firstChoice.message as Record<string, unknown>
    : undefined;

  return {
    content: (
      textFromContent(delta?.content) ??
      readFirstString(delta, ['text', 'output_text']) ??
      textFromContent(message?.content) ??
      readFirstString(message, ['text', 'output_text']) ??
      readFirstString(firstChoice, ['text']) ??
      readFirstString(record, ['output_text', 'text'])
    ),
    reasoning: (
      readFirstString(delta, [
        'reasoning_content',
        'reasoningContent',
        'reasoning',
        'thinking',
      ]) ??
      textFromReasoningDetails(delta?.reasoning_details) ??
      readFirstString(message, [
        'reasoning_content',
        'reasoningContent',
        'reasoning',
        'thinking',
      ]) ??
      textFromReasoningDetails(message?.reasoning_details)
    ),
    toolCalls: Array.isArray(delta?.tool_calls) ? delta.tool_calls : undefined,
  };
}

function eventFromPayload(payload: string, state: StreamState): ChatStreamEvent[] {
  if (payload === '[DONE]') {
    return [{ type: 'done' }];
  }

  const chunk = parseJsonPayload(payload);
  if (!chunk) {
    return [];
  }

  const events: ChatStreamEvent[] = [];
  const delta = readChoiceDelta(chunk);

  if (delta.content) {
    state.pendingText += delta.content;
    events.push({ type: 'text', content: delta.content });
  }

  if (delta.reasoning) {
    events.push({ type: 'reasoning', content: delta.reasoning });
  }

  for (const toolCall of delta.toolCalls ?? []) {
    events.push({ type: 'tool', toolCall });
  }

  events.push({ type: 'raw', chunk });
  return events;
}

export async function* parseOpenAICompatibleStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: StreamState = { pendingText: '' };
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const payload = trimmed.startsWith('data:')
          ? trimmed.slice('data:'.length).trim()
          : trimmed;

        for (const event of eventFromPayload(payload, state)) {
          yield event;
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const payload = tail.startsWith('data:')
        ? tail.slice('data:'.length).trim()
        : tail;

      for (const event of eventFromPayload(payload, state)) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
