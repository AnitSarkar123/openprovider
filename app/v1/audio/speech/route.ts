import { requireOpenProviderApiKey } from '@/lib/openprovider/api-auth';
import { recordOpenProviderApiUsage, statusCodeFromOpenProviderError } from '@/lib/openprovider/api-usage';
import { runSpeechSynthesis } from '@/lib/openprovider/media';
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
        bodyKey: 'ref_audio',
        defaultMimeType: 'audio/mpeg',
        fieldNames: ['ref_audio', 'refAudio', 'audio', 'file', 'upload'],
        label: 'Speech reference audio',
      },
    ]);
    const payload = await runSpeechSynthesis(body, {
      userId: authResult.auth.userId,
    });
    const bytes = Uint8Array.from(payload.bytes);
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/audio/speech',
      method: 'POST',
      ok: true,
      provider: payload.provider,
      routedModel: payload.model,
      startedAt,
      statusCode: 200,
      tokenUsage: {
        bytes: bytes.byteLength,
        contentType: payload.contentType,
      },
      workflow: 'speech',
    });

    return new Response(bytes, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.byteLength),
        'Content-Type': payload.contentType,
        'X-OpenProvider-Model': payload.model,
        'X-OpenProvider-Provider': payload.provider,
      },
    });
  } catch (error) {
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      body,
      endpoint: '/v1/audio/speech',
      error,
      method: 'POST',
      ok: false,
      startedAt,
      statusCode: statusCodeFromOpenProviderError(error),
      workflow: 'speech',
    });
    return openProviderErrorResponse(error, 'Speech synthesis failed.');
  }
}
