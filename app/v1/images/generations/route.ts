import { NextResponse } from 'next/server';
import { requireOpenProviderApiKey } from '@/lib/openprovider/api-auth';
import {
  recordOpenProviderApiUsage,
  routeInfoFromPayload,
  statusCodeFromOpenProviderError,
} from '@/lib/openprovider/api-usage';
import { runImageGeneration } from '@/lib/openprovider/media';
import { readOpenProviderRequestBody } from '@/lib/openprovider/request-body';
import { openProviderErrorResponse } from '@/lib/openprovider/route-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authResult = await requireOpenProviderApiKey(request);
  if ('response' in authResult) return authResult.response;
  const startedAt = Date.now();
  let body: Record<string, unknown> | undefined;

  try {
    body = await readOpenProviderRequestBody(request);
    const payload = await runImageGeneration(body, {
      userId: authResult.auth.userId,
    });
    const route = routeInfoFromPayload(payload);
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/images/generations',
      method: 'POST',
      ok: true,
      provider: route.provider,
      routedModel: route.model,
      startedAt,
      statusCode: 200,
      workflow: 'image',
    });

    return NextResponse.json(payload);
  } catch (error) {
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/images/generations',
      error,
      method: 'POST',
      ok: false,
      startedAt,
      statusCode: statusCodeFromOpenProviderError(error),
      workflow: 'image',
    });
    return openProviderErrorResponse(error, 'Image generation failed.');
  }
}
