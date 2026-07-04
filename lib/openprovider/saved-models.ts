import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { savedModels } from '@/lib/db/schema';
import type { PublicModel } from './catalog';

type SavedModelsRow = typeof savedModels.$inferSelect;

type SavedModelsCacheEntry = {
  rows: SavedModelsRow[];
  expiresAt: number;
};

const SAVED_MODELS_CACHE_TTL_MS = 30 * 1000;
const MAX_SAVED_MODELS_CACHE_ENTRIES = 500;
const savedModelsCache = new Map<string, SavedModelsCacheEntry>();

function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase();
}

function pruneSavedModelsCache(now: number): void {
  for (const [key, value] of savedModelsCache.entries()) {
    if (value.expiresAt <= now) {
      savedModelsCache.delete(key);
    }
  }

  while (savedModelsCache.size > MAX_SAVED_MODELS_CACHE_ENTRIES) {
    const oldestKey = savedModelsCache.keys().next().value;
    if (!oldestKey) {
      break;
    }

    savedModelsCache.delete(oldestKey);
  }
}

export function invalidateSavedModelsCache(userId?: string): void {
  if (!userId) {
    savedModelsCache.clear();
    return;
  }

  savedModelsCache.delete(normalizeUserId(userId));
}

export async function listSavedModels(userId: string) {
  const now = Date.now();
  const cacheKey = normalizeUserId(userId);
  const cached = savedModelsCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.rows;
  }

  const db = getDb();
  if (!db) {
    return [];
  }

  const rows = await db
    .select()
    .from(savedModels)
    .where(eq(savedModels.userId, userId))
    .orderBy(desc(savedModels.createdAt));

  savedModelsCache.set(cacheKey, {
    rows,
    expiresAt: now + SAVED_MODELS_CACHE_TTL_MS,
  });
  pruneSavedModelsCache(now);

  return rows;
}

export async function saveModelForUser(userId: string, model: PublicModel) {
  const db = getDb();
  if (!db) {
    return { ok: false, reason: 'DATABASE_URL is not configured.' };
  }

  await db
    .insert(savedModels)
    .values({
      id: crypto.randomUUID(),
      userId,
      modelId: model.id,
      provider: model.provider,
      category: model.category,
      modelName: model.name,
      metadata: model,
    })
    .onConflictDoNothing({
      target: [savedModels.userId, savedModels.modelId],
    });

  invalidateSavedModelsCache(userId);

  return { ok: true };
}

export async function removeSavedModel(userId: string, modelId: string) {
  const db = getDb();
  if (!db) {
    return { ok: false, reason: 'DATABASE_URL is not configured.' };
  }

  await db
    .delete(savedModels)
    .where(and(eq(savedModels.userId, userId), eq(savedModels.modelId, modelId)));

  invalidateSavedModelsCache(userId);

  return { ok: true };
}
