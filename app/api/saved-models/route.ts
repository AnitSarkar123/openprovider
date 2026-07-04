import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { findModel, getCatalogSnapshotForUser } from '@/lib/openprovider/catalog';
import { readJsonObject } from '@/lib/openprovider/request-guards';
import { listSavedModels, removeSavedModel, saveModelForUser } from '@/lib/openprovider/saved-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ data: [] }, { headers: privateBrowserCacheHeaders() });
  }

  return NextResponse.json({ data: await listSavedModels(userId) }, { headers: privateBrowserCacheHeaders() });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Sign in to save models.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  const body = await readJsonObject(request);
  const modelId = typeof body.modelId === 'string' ? body.modelId : '';
  const snapshot = await getCatalogSnapshotForUser(userId);
  const model = findModel(snapshot, modelId);

  if (!model) {
    return NextResponse.json(
      { error: { message: 'Model not found.' } },
      { headers: privateBrowserCacheHeaders(), status: 404 }
    );
  }

  return NextResponse.json(await saveModelForUser(userId, model), {
    headers: privateBrowserCacheHeaders(),
  });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Sign in to remove models.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  const body = await readJsonObject(request);
  const modelId = typeof body.modelId === 'string' ? body.modelId : '';
  return NextResponse.json(await removeSavedModel(userId, modelId), {
    headers: privateBrowserCacheHeaders(),
  });
}
