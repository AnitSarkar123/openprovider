import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { OpenProviderError } from '../utils/errors';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

type SafeRemoteImageOptions = {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
};

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(part => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice('::ffff:'.length));
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function parseRemoteImageUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OpenProviderError('Image URL must be a valid HTTP or HTTPS URL.', 400);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new OpenProviderError('Image URL must use HTTP or HTTPS.', 400);
  }

  if (url.username || url.password) {
    throw new OpenProviderError('Image URL credentials are not allowed.', 400);
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new OpenProviderError('Image URL host is not allowed.', 400);
  }

  return url;
}

function hostnameForChecks(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

export async function assertSafeRemoteImageUrl(value: string): Promise<string> {
  const url = parseRemoteImageUrl(value);
  const hostname = hostnameForChecks(url);
  const directAddressFamily = isIP(hostname);

  if (directAddressFamily) {
    if (isPrivateAddress(hostname)) {
      throw new OpenProviderError('Image URL host is not allowed.', 400);
    }
    return url.toString();
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: false });
  } catch {
    throw new OpenProviderError('Image URL host could not be resolved.', 400);
  }

  if (!addresses.length || addresses.some(result => isPrivateAddress(result.address))) {
    throw new OpenProviderError('Image URL host is not allowed.', 400);
  }

  return url.toString();
}

async function readBoundedResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new OpenProviderError('Remote image exceeds the 20 MB limit.', 413);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        throw new OpenProviderError('Remote image exceeds the 20 MB limit.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

export async function fetchSafeRemoteImageBytes(
  value: string,
  options: SafeRemoteImageOptions = {}
): Promise<Uint8Array> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url = await assertSafeRemoteImageUrl(value);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'image/*,application/octet-stream;q=0.8' },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenProviderError('Remote image fetch timed out.', 504);
      }
      throw new OpenProviderError('Remote image could not be fetched.', 400);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new OpenProviderError('Remote image redirect is missing a location.', 400);
      }
      url = await assertSafeRemoteImageUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      throw new OpenProviderError(`Image fetch failed with status ${response.status}.`, response.status);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType && !contentType.startsWith('image/') && !contentType.startsWith('application/octet-stream')) {
      throw new OpenProviderError('Remote URL did not return an image.', 415);
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new OpenProviderError('Remote image exceeds the 20 MB limit.', 413);
    }

    return readBoundedResponseBytes(response, maxBytes);
  }

  throw new OpenProviderError('Remote image redirected too many times.', 400);
}
