import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { runImageGeneration } from '@/lib/openprovider/media';
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
        { error: { message: 'Sign in to generate images.' } },
        { headers: privateBrowserCacheHeaders(), status: 401 }
      );
    }

    const body = await readOpenProviderRequestBody(request);
    const payload = await runImageGeneration(body, {
      userId,
    });

    return NextResponse.json(payload, {
      headers: privateBrowserCacheHeaders(),
    });
  } catch (error) {
    return openProviderErrorResponse(error, 'Image generation failed.');
  }
}
