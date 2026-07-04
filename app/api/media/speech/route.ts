import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { runSpeechSynthesis } from '@/lib/openprovider/media';
import { readOpenProviderRequestBody } from '@/lib/openprovider/request-body';
import { openProviderErrorResponse } from '@/lib/openprovider/route-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: { message: 'Sign in to create speech.' } },
        { headers: privateBrowserCacheHeaders(), status: 401 }
      );
    }

    const body = await readOpenProviderRequestBody(request, [
      {
        bodyKey: 'ref_audio',
        defaultMimeType: 'audio/mpeg',
        fieldNames: ['ref_audio', 'refAudio', 'audio', 'file', 'upload'],
        label: 'Speech reference audio',
      },
    ]);
    const payload = await runSpeechSynthesis(body, {
      userId,
    });
    const bytes = Uint8Array.from(payload.bytes);

    return new Response(bytes, {
      headers: {
        ...Object.fromEntries(new Headers(privateBrowserCacheHeaders())),
        'Content-Length': String(bytes.byteLength),
        'Content-Type': payload.contentType,
        'X-OpenProvider-Model': payload.model,
        'X-OpenProvider-Provider': payload.provider,
      },
    });
  } catch (error) {
    return openProviderErrorResponse(error, 'Speech synthesis failed.');
  }
}
