import { OpenProviderError } from '@/src/utils/errors';

export const DEFAULT_JSON_BODY_BYTES = 1024 * 1024;
export const MEDIA_BODY_BYTES = 24 * 1024 * 1024;
export const PROVIDER_KEYS_BODY_BYTES = 256 * 1024;

type ReadJsonOptions = {
  allowEmpty?: boolean;
  invalidTypeMessage?: string;
  maxBytes?: number;
};

function bodyByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertRequestContentLength(
  request: Request,
  maxBytes: number,
  label = 'Request body'
) {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return;

  const parsed = Number.parseInt(contentLength, 10);
  if (Number.isFinite(parsed) && parsed > maxBytes) {
    throw new OpenProviderError(`${label} exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`, 413);
  }
}

export async function readJsonObject(
  request: Request,
  options: ReadJsonOptions = {}
): Promise<Record<string, unknown>> {
  const maxBytes = options.maxBytes ?? DEFAULT_JSON_BODY_BYTES;
  assertRequestContentLength(request, maxBytes);

  const text = await request.text();
  if (bodyByteLength(text) > maxBytes) {
    throw new OpenProviderError(`Request body exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`, 413);
  }

  if (!text.trim()) {
    if (options.allowEmpty) {
      return {};
    }
    throw new OpenProviderError('Request body must be valid JSON.', 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpenProviderError('Request body must be valid JSON.', 400);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OpenProviderError(options.invalidTypeMessage ?? 'Request body must be a JSON object.', 400);
  }

  return parsed as Record<string, unknown>;
}
