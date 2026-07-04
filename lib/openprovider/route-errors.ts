import { NextResponse } from 'next/server';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { OpenProviderError } from '@/src/utils/errors';

export function openProviderErrorStatus(error: unknown): number {
  if (error instanceof OpenProviderError) {
    return error.status ?? 500;
  }

  if (error instanceof SyntaxError) {
    return 400;
  }

  return 500;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bopk_(?:live|test)_[A-Za-z0-9._~+/=-]+/gi, 'opk_[redacted]')
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, match => {
      const separator = match.includes('=') ? '=' : ':';
      return `${match.slice(0, match.indexOf(separator) + 1)} [redacted]`;
    });
}

export function safeErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof SyntaxError) {
    return 'Invalid JSON request body.';
  }

  const status = openProviderErrorStatus(error);
  if (error instanceof OpenProviderError && status < 500) {
    return redactSensitiveText(error.message);
  }

  return fallbackMessage;
}

export function openProviderErrorResponse(error: unknown, fallbackMessage: string) {
  const status = openProviderErrorStatus(error);

  return NextResponse.json({
    error: {
      message: safeErrorMessage(error, fallbackMessage),
      type: error instanceof OpenProviderError ? error.name : 'OpenProviderRouteError',
    },
  }, {
    headers: privateBrowserCacheHeaders(),
    status,
  });
}
