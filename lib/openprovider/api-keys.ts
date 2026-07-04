import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, or } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { openProviderApiKeys } from '@/lib/db/schema';

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export type PublicOpenProviderApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type AuthenticatedOpenProviderApiKey = {
  userId: string;
  keyId: string;
  keyPrefix: string;
};

function legacyHashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function apiKeyHashSecret(): string | undefined {
  return process.env.OPENPROVIDER_API_KEY_HASH_SECRET?.trim() || undefined;
}

function currentHashKey(secret: string): string {
  const hashSecret = apiKeyHashSecret();
  if (!hashSecret) {
    return legacyHashKey(secret);
  }

  return `hmac-sha256:${createHmac('sha256', hashSecret).update(secret).digest('hex')}`;
}

function candidateKeyHashes(secret: string): string[] {
  const current = currentHashKey(secret);
  const legacy = legacyHashKey(secret);
  return current === legacy ? [current] : [current, legacy];
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return 'Default key';
  return value.slice(0, 80);
}

function publicKey(row: typeof openProviderApiKeys.$inferSelect): PublicOpenProviderApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

function requireDb() {
  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL is required before OpenProvider API keys can be managed.');
  }

  return db;
}

function readApiKeyFromRequest(request: Request): string {
  const auth = request.headers.get('authorization')?.trim() ?? '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerKey = request.headers.get('x-openprovider-api-key')?.trim();
  return bearer || headerKey || '';
}

function shouldTouchLastUsed(lastUsedAt: Date | null, now: Date): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS;
}

export async function listOpenProviderApiKeys(userId: string): Promise<PublicOpenProviderApiKey[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  const rows = await db
    .select()
    .from(openProviderApiKeys)
    .where(eq(openProviderApiKeys.userId, userId))
    .orderBy(desc(openProviderApiKeys.createdAt));

  return rows.map(publicKey);
}

export async function createOpenProviderApiKey(
  userId: string,
  name: unknown
): Promise<{ key: PublicOpenProviderApiKey; secret: string }> {
  const db = requireDb();
  const secret = `opk_live_${toBase64Url(randomBytes(32))}`;
  const now = new Date();
  const [created] = await db
    .insert(openProviderApiKeys)
    .values({
      id: randomUUID(),
      userId,
      name: cleanName(name),
      keyPrefix: `${secret.slice(0, 12)}...${secret.slice(-4)}`,
      keyHash: currentHashKey(secret),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    key: publicKey(created),
    secret,
  };
}

export async function deleteOpenProviderApiKey(userId: string, keyId: string): Promise<{ ok: true }> {
  const db = requireDb();

  await db
    .delete(openProviderApiKeys)
    .where(and(eq(openProviderApiKeys.userId, userId), eq(openProviderApiKeys.id, keyId)));

  return { ok: true };
}

export async function authenticateOpenProviderApiKey(
  request: Request
): Promise<AuthenticatedOpenProviderApiKey | null> {
  const secret = readApiKeyFromRequest(request);
  if (!secret.startsWith('opk_live_')) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  const keyHashes = candidateKeyHashes(secret);
  const hashFilter = keyHashes.length === 1
    ? eq(openProviderApiKeys.keyHash, keyHashes[0])
    : or(...keyHashes.map(hash => eq(openProviderApiKeys.keyHash, hash)));
  const [row] = await db
    .select()
    .from(openProviderApiKeys)
    .where(hashFilter)
    .limit(1);

  const matchingHash = row
    ? keyHashes.find(hash => safeEquals(row.keyHash, hash))
    : undefined;

  if (!row || !matchingHash) {
    return null;
  }

  const now = new Date();
  if (row.revokedAt || (row.expiresAt && row.expiresAt <= now)) {
    return null;
  }

  const currentHash = keyHashes[0];
  const updateValues: {
    keyHash?: string;
    lastUsedAt?: Date;
    updatedAt: Date;
  } = { updatedAt: now };

  if (row.keyHash !== currentHash) {
    updateValues.keyHash = currentHash;
  }

  if (shouldTouchLastUsed(row.lastUsedAt, now)) {
    updateValues.lastUsedAt = now;
  }

  if (updateValues.keyHash || updateValues.lastUsedAt) {
    await db
      .update(openProviderApiKeys)
      .set(updateValues)
      .where(eq(openProviderApiKeys.id, row.id));
  }

  return {
    userId: row.userId,
    keyId: row.id,
    keyPrefix: row.keyPrefix,
  };
}
