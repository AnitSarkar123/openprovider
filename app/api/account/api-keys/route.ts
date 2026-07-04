import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authIsConfigured, authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import {
  createOpenProviderApiKey,
  deleteOpenProviderApiKey,
  listOpenProviderApiKeys,
} from '@/lib/openprovider/api-keys';
import { readJsonObject } from '@/lib/openprovider/request-guards';
import { OpenProviderError } from '@/src/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentUserId() {
  if (!authIsConfigured()) {
    return null;
  }

  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ data: [] }, { headers: privateBrowserCacheHeaders() });
  }

  return NextResponse.json({ data: await listOpenProviderApiKeys(userId) }, {
    headers: privateBrowserCacheHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Sign in to create OpenProvider API keys.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  let body: { name?: unknown };
  try {
    body = await readJsonObject(request, { allowEmpty: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Invalid JSON body.',
        },
      },
      {
        headers: privateBrowserCacheHeaders(),
        status: error instanceof OpenProviderError ? error.status ?? 400 : 400,
      }
    );
  }

  try {
    return NextResponse.json(await createOpenProviderApiKey(userId, body.name), {
      headers: privateBrowserCacheHeaders(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Unable to create API key.',
        },
      },
      { headers: privateBrowserCacheHeaders(), status: 503 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Sign in to delete OpenProvider API keys.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  const keyId = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!keyId) {
    return NextResponse.json(
      { error: { message: 'Missing API key id.' } },
      { headers: privateBrowserCacheHeaders(), status: 400 }
    );
  }

  try {
    return NextResponse.json(await deleteOpenProviderApiKey(userId, keyId), {
      headers: privateBrowserCacheHeaders(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Unable to delete API key.',
        },
      },
      { headers: privateBrowserCacheHeaders(), status: 503 }
    );
  }
}
