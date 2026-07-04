import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import { hasDatabase } from '@/lib/db/client';

export const HEALTH_HEADERS = {
  'Cache-Control': 'no-store',
};

export function openProviderHealthPayload() {
  return {
    ok: true,
    service: packageJson.name,
    version: packageJson.version,
    database: hasDatabase() ? 'configured' : 'not_configured',
    timestamp: new Date().toISOString(),
  };
}

export function healthRouteHandler() {
  return NextResponse.json(openProviderHealthPayload(), {
    headers: HEALTH_HEADERS,
  });
}
