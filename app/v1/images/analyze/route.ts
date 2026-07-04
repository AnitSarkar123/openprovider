import { NextResponse } from 'next/server';
import { requireOpenProviderApiKey } from '@/lib/openprovider/api-auth';
import {
  recordOpenProviderApiUsage,
  routeInfoFromPayload,
  statusCodeFromOpenProviderError,
} from '@/lib/openprovider/api-usage';
import { runImageAnalysis } from '@/lib/openprovider/media';
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
    body = await readOpenProviderRequestBody(request, [
      {
        bodyKey: 'image',
        defaultMimeType: 'image/png',
        fieldNames: ['image', 'file', 'upload'],
        label: 'Image',
      },
    ]);
    const payload = await runImageAnalysis(body, {
      userId: authResult.auth.userId,
    });
    const route = routeInfoFromPayload(payload);
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/images/analyze',
      method: 'POST',
      ok: true,
      provider: route.provider,
      routedModel: route.model,
      startedAt,
      statusCode: 200,
      workflow: 'image_analysis',
    });

    return NextResponse.json(payload);
  } catch (error) {
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/images/analyze',
      error,
      method: 'POST',
      ok: false,
      startedAt,
      statusCode: statusCodeFromOpenProviderError(error),
      workflow: 'image_analysis',
    });
    return openProviderErrorResponse(error, 'Image analysis failed.');
  }
}
