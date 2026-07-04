import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { providerKeys } from '@/lib/db/schema';
import { PROVIDER_IDS, PROVIDER_KEY_NAMES } from '@/src/core/providerRegistry';
import type { OpenProviderConfig, ProviderId, ProviderRuntimeConfig } from '@/src/core/types';

type ProviderKeyValues = Record<string, string>;

type UserProviderKeyStatus = {
  keyNames: string[];
  updatedAt: Date;
};

const CLOUDFLARE_ACCOUNT_PLACEHOLDER = '{account_id}';

function encryptionSecret(): string {
  const dedicatedSecret = process.env.OPENPROVIDER_KEY_ENCRYPTION_SECRET?.trim();
  if (dedicatedSecret) {
    return dedicatedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set OPENPROVIDER_KEY_ENCRYPTION_SECRET before saving user provider keys in production.');
  }

  const secret = (process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '').trim();

  if (!secret) {
    throw new Error('Set OPENPROVIDER_KEY_ENCRYPTION_SECRET or NEXTAUTH_SECRET before saving user provider keys.');
  }

  return secret;
}

function encryptionKey() {
  return createHash('sha256').update(encryptionSecret()).digest();
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function encryptValues(values: ProviderKeyValues): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = concatBytes([
    cipher.update(JSON.stringify(values), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    toBase64Url(iv),
    toBase64Url(tag),
    toBase64Url(ciphertext),
  ].join(':');
}

function decryptValues(payload: string): ProviderKeyValues {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Provider key payload uses an unsupported encryption format.');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), fromBase64Url(iv));
  decipher.setAuthTag(fromBase64Url(tag));
  const plaintextBytes = concatBytes([
    decipher.update(fromBase64Url(ciphertext)),
    decipher.final(),
  ]);
  const plaintext = Buffer.from(plaintextBytes).toString('utf8');

  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeAtxpOpenAiBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);

    if (url.hostname === 'chat.atxp.ai') {
      return 'https://llm.atxp.ai/v1';
    }

    if (url.hostname === 'llm.atxp.ai') {
      if (
        url.pathname === '' ||
        url.pathname === '/' ||
        url.pathname === '/v1' ||
        url.pathname === '/v1/models' ||
        url.pathname === '/v1/chat/completions'
      ) {
        return 'https://llm.atxp.ai/v1';
      }
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeOllamaOpenAiBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);
    if (url.hostname === 'api.ollama.com') {
      return 'https://ollama.com/v1';
    }

    if (url.hostname === 'ollama.com' && (url.pathname === '' || url.pathname === '/' || url.pathname === '/api')) {
      return 'https://ollama.com/v1';
    }

    if (
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
      (url.pathname === '' || url.pathname === '/' || url.pathname === '/api')
    ) {
      url.pathname = '/v1';
      return normalizeBaseUrl(url.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeOllamaModelsBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const url = new URL(normalized);
    if (url.hostname === 'api.ollama.com') {
      return 'https://ollama.com/api';
    }

    if (url.hostname === 'ollama.com' && (url.pathname === '' || url.pathname === '/' || url.pathname === '/v1')) {
      return 'https://ollama.com/api';
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function pick(values: ProviderKeyValues | undefined, names: readonly string[], fallback = ''): string {
  for (const name of names) {
    const value = values?.[name]?.trim();
    if (value) {
      return value;
    }
  }

  return fallback;
}

function accountApiRoot(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai`;
}

function disabledProvider(provider: ProviderRuntimeConfig, message: string): ProviderRuntimeConfig {
  return {
    ...provider,
    apiKey: '',
    enabled: false,
    missingConfigReason: message,
  };
}

function applyProviderValues(
  providerId: ProviderId,
  current: ProviderRuntimeConfig,
  values: ProviderKeyValues | undefined
): ProviderRuntimeConfig {
  if (providerId === 'llm7') {
    const apiKey = pick(values, PROVIDER_KEY_NAMES.llm7.apiKey);
    const baseUrl = pick(values, PROVIDER_KEY_NAMES.llm7.baseUrl, current.baseUrl);
    const modelsBaseUrl = pick(values, PROVIDER_KEY_NAMES.llm7.modelsBaseUrl ?? [], current.modelsBaseUrl);

    return {
      ...current,
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
      enabled: true,
      missingConfigReason: undefined,
    };
  }

  if (providerId === 'pollinations') {
    const apiKey = pick(values, PROVIDER_KEY_NAMES.pollinations.apiKey);
    const baseUrl = pick(values, PROVIDER_KEY_NAMES.pollinations.baseUrl, current.baseUrl);
    const modelsBaseUrl = pick(values, PROVIDER_KEY_NAMES.pollinations.modelsBaseUrl ?? [], current.modelsBaseUrl);

    return {
      ...current,
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
      enabled: true,
      missingConfigReason: undefined,
    };
  }

  if (providerId === 'openprovider') {
    const apiKey = pick(values, PROVIDER_KEY_NAMES.openprovider.apiKey, current.apiKey || 'anonymous');
    const baseUrl = pick(values, PROVIDER_KEY_NAMES.openprovider.baseUrl, current.baseUrl);
    const modelsBaseUrl = pick(values, PROVIDER_KEY_NAMES.openprovider.modelsBaseUrl ?? [], current.modelsBaseUrl);

    return {
      ...current,
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
      enabled: true,
      missingConfigReason: undefined,
    };
  }

  if (providerId === 'ollama') {
    const apiKey = pick(values, PROVIDER_KEY_NAMES.ollama.apiKey);
    const baseUrl = normalizeOllamaOpenAiBaseUrl(pick(values, PROVIDER_KEY_NAMES.ollama.baseUrl, current.baseUrl));
    const modelsBaseUrl = normalizeOllamaModelsBaseUrl(
      pick(values, PROVIDER_KEY_NAMES.ollama.modelsBaseUrl ?? [], current.modelsBaseUrl || baseUrl)
    );

    return {
      ...current,
      apiKey,
      baseUrl,
      modelsBaseUrl,
      enabled: apiKey.length > 0,
      missingConfigReason: apiKey ? undefined : 'Ollama Cloud API key is not configured.',
    };
  }

  if (providerId === 'atxp') {
    if (!values) {
      return disabledProvider(current, 'No user credential is saved for this provider.');
    }

    const apiKey = pick(values, PROVIDER_KEY_NAMES.atxp.apiKey);
    const baseUrl = normalizeAtxpOpenAiBaseUrl(pick(values, PROVIDER_KEY_NAMES.atxp.baseUrl, current.baseUrl));
    const modelsBaseUrl = normalizeAtxpOpenAiBaseUrl(
      pick(values, PROVIDER_KEY_NAMES.atxp.modelsBaseUrl ?? [], current.modelsBaseUrl || baseUrl)
    );

    return {
      ...current,
      apiKey,
      baseUrl,
      modelsBaseUrl,
      enabled: apiKey.length > 0,
      missingConfigReason: apiKey ? undefined : 'No user credential is saved for this provider.',
    };
  }

  if (!values) {
    return disabledProvider(current, 'No user credential is saved for this provider.');
  }

  if (providerId === 'cloudflare') {
    const apiKey = pick(values, PROVIDER_KEY_NAMES.cloudflare.apiKey);
    const accountId = pick(values, ['CLOUDFLARE_ACCOUNT_ID']);
    const accountRoot = accountId ? accountApiRoot(accountId) : '';
    const baseUrl = pick(
      values,
      PROVIDER_KEY_NAMES.cloudflare.baseUrl,
      accountRoot ? `${accountRoot}/v1` : current.baseUrl
    );
    const modelsBaseUrl = pick(
      values,
      PROVIDER_KEY_NAMES.cloudflare.modelsBaseUrl ?? [],
      accountRoot || current.modelsBaseUrl
    );
    const missing: string[] = [];

    if (!apiKey) {
      missing.push('Cloudflare API token is not configured');
    }

    if (!accountId || baseUrl.includes(CLOUDFLARE_ACCOUNT_PLACEHOLDER) || modelsBaseUrl.includes(CLOUDFLARE_ACCOUNT_PLACEHOLDER)) {
      missing.push('Cloudflare account id is not configured');
    }

    return {
      ...current,
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
      enabled: missing.length === 0,
      missingConfigReason: missing.length > 0 ? `${missing.join('; ')}.` : undefined,
    };
  }

  const names = PROVIDER_KEY_NAMES[providerId];
  const apiKey = pick(values, names.apiKey);
  const baseUrl = pick(values, names.baseUrl, current.baseUrl);
  const modelsBaseUrl = pick(values, names.modelsBaseUrl ?? [], current.modelsBaseUrl);

  return {
    ...current,
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    modelsBaseUrl: normalizeBaseUrl(modelsBaseUrl),
    enabled: apiKey.length > 0,
    missingConfigReason: apiKey ? undefined : 'No user credential is saved for this provider.',
  };
}

export async function listUserProviderKeyStatuses(userId: string): Promise<Map<ProviderId, UserProviderKeyStatus>> {
  const db = getDb();
  const statuses = new Map<ProviderId, UserProviderKeyStatus>();
  if (!db) {
    return statuses;
  }

  const rows = await db
    .select({
      provider: providerKeys.provider,
      encryptedValues: providerKeys.encryptedValues,
      updatedAt: providerKeys.updatedAt,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));

  for (const row of rows) {
    if (PROVIDER_IDS.includes(row.provider as ProviderId)) {
      const values = decryptValues(row.encryptedValues);
      const keyNames = Object.keys(values).sort();

      statuses.set(row.provider as ProviderId, {
        keyNames,
        updatedAt: row.updatedAt,
      });
    }
  }

  return statuses;
}

export async function saveUserProviderKeys(
  userId: string,
  providerId: ProviderId,
  values: ProviderKeyValues
): Promise<UserProviderKeyStatus> {
  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL is required before user provider keys can be saved.');
  }

  const existing = await db
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, providerId)))
    .limit(1);

  const previous = existing[0]?.encryptedValues ? decryptValues(existing[0].encryptedValues) : {};
  const merged = {
    ...previous,
    ...values,
  };
  const keyNames = Object.keys(merged).sort();
  const now = new Date();

  if (existing[0]) {
    await db
      .update(providerKeys)
      .set({
        encryptedValues: encryptValues(merged),
        keyNames,
        updatedAt: now,
      })
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, providerId)));
  } else {
    await db.insert(providerKeys).values({
      id: randomUUID(),
      userId,
      provider: providerId,
      encryptedValues: encryptValues(merged),
      keyNames,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { keyNames, updatedAt: now };
}

export async function loadUserProviderKeyValues(userId: string): Promise<Partial<Record<ProviderId, ProviderKeyValues>>> {
  const db = getDb();
  if (!db) {
    return {};
  }

  const rows = await db
    .select({
      provider: providerKeys.provider,
      encryptedValues: providerKeys.encryptedValues,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));

  const result: Partial<Record<ProviderId, ProviderKeyValues>> = {};
  for (const row of rows) {
    if (!PROVIDER_IDS.includes(row.provider as ProviderId)) {
      continue;
    }

    result[row.provider as ProviderId] = decryptValues(row.encryptedValues);
  }

  return result;
}

export async function findSingleProviderKeyUserId(): Promise<string | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  const rows = await db
    .select({
      userId: providerKeys.userId,
    })
    .from(providerKeys);
  const userIds = new Set(rows.map(row => row.userId).filter(Boolean));

  return userIds.size === 1 ? [...userIds][0] : null;
}

export async function applyUserProviderKeysToConfig(
  config: OpenProviderConfig,
  userId: string | null | undefined
): Promise<OpenProviderConfig> {
  const disableAll = (message: string): OpenProviderConfig => ({
    ...config,
    providers: Object.fromEntries(
      PROVIDER_IDS.map(providerId => [
        providerId,
        disabledProvider(config.providers[providerId], message),
      ])
    ) as Record<ProviderId, ProviderRuntimeConfig>,
  });

  if (!userId) {
    return disableAll('Sign in and save provider credentials in Account -> Provider setup.');
  }

  let userKeys: Partial<Record<ProviderId, ProviderKeyValues>>;

  try {
    userKeys = await loadUserProviderKeyValues(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider key storage is not available.';
    return disableAll(message);
  }

  return {
    ...config,
    providers: Object.fromEntries(
      PROVIDER_IDS.map(providerId => [
        providerId,
        applyProviderValues(providerId, config.providers[providerId], userKeys[providerId]),
      ])
    ) as Record<ProviderId, ProviderRuntimeConfig>,
  };
}
