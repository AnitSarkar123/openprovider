import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authIsConfigured, authOptions } from '@/lib/auth';
import { invalidateCatalogSnapshot } from '@/lib/openprovider/catalog';
import { PROVIDER_KEYS_BODY_BYTES, readJsonObject } from '@/lib/openprovider/request-guards';
import { getProviderSetup, getProviderSetups, missingRequiredEnv } from '@/lib/openprovider/provider-setup';
import { saveUserProviderKeys } from '@/lib/openprovider/provider-keys';
import { OpenProviderError } from '@/src/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProviderKeyBody = {
  bulkText?: unknown;
  providerId?: unknown;
  values?: unknown;
};

type IgnoredEnvName = {
  name: string;
  suggestion?: string;
};

function providerEnvNames(provider: ReturnType<typeof getProviderSetups>[number]): string[] {
  return [
    ...provider.requiredEnv,
    ...provider.optionalEnv,
    ...(provider.aliases ?? []),
    ...Object.values(provider.requiredEnvAliases ?? {}).flat(),
  ];
}

function cleanValues(values: unknown, allowedEnvNames: Set<string>) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return {};
  }

  const cleaned: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!allowedEnvNames.has(name) || typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if (/[\r\n\u0000]/.test(trimmed)) {
      throw new Error(`${name} cannot contain line breaks.`);
    }

    cleaned[name] = trimmed;
  }

  return cleaned;
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function normalizeEnvName(name: string): string {
  return name.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

function parseEnvText(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const withoutExport = rawLine.trim().replace(/^export\s+/, '');

    if (!withoutExport || withoutExport.startsWith('#')) {
      continue;
    }

    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const name = normalizeEnvName(withoutExport.slice(0, separatorIndex));
    const value = stripOuterQuotes(withoutExport.slice(separatorIndex + 1));

    if (/^[A-Z][A-Z0-9_]*$/.test(name) && value && !/[\r\n\u0000]/.test(value)) {
      result[name] = value;
    }
  }

  return result;
}

function compactEnvName(name: string): string {
  return normalizeEnvName(name).replace(/[^A-Z0-9]/g, '');
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex];
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + substitutionCost
      );
      diagonal = saved;
    }
  }

  return previous[right.length];
}

function suggestEnvName(name: string, knownNames: string[]): string | undefined {
  const normalizedName = compactEnvName(name);
  if (!normalizedName) {
    return undefined;
  }

  let best: { name: string; distance: number } | undefined;
  for (const knownName of knownNames) {
    const distance = editDistance(normalizedName, compactEnvName(knownName));
    if (!best || distance < best.distance || (distance === best.distance && knownName.length < best.name.length)) {
      best = { name: knownName, distance };
    }
  }

  if (!best) {
    return undefined;
  }

  const maxDistance = Math.max(2, Math.floor(Math.min(normalizedName.length, compactEnvName(best.name).length) * 0.28));
  return best.distance <= maxDistance ? best.name : undefined;
}

function describeIgnoredNames(names: string[]): IgnoredEnvName[] {
  const knownNames = Array.from(new Set(getProviderSetups().flatMap(provider => providerEnvNames(provider)))).sort();

  return names.map(name => ({
    name,
    suggestion: suggestEnvName(name, knownNames),
  }));
}

function groupBulkValues(entries: Record<string, string>) {
  const grouped = new Map<string, Record<string, string>>();
  const recognized = new Set<string>();

  for (const provider of getProviderSetups()) {
    const allowedEnvNames = new Set(providerEnvNames(provider));
    const values: Record<string, string> = {};

    for (const [name, value] of Object.entries(entries)) {
      if (allowedEnvNames.has(name)) {
        values[name] = value;
        recognized.add(name);
      }
    }

    if (Object.keys(values).length > 0) {
      grouped.set(provider.id, values);
    }
  }

  return {
    grouped,
    ignored: describeIgnoredNames(Object.keys(entries).filter(name => !recognized.has(name)).sort()),
  };
}

export async function POST(request: NextRequest) {
  let body: ProviderKeyBody;
  try {
    body = await readJsonObject(request, { maxBytes: PROVIDER_KEYS_BODY_BYTES });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : 'Invalid JSON body.' } },
      { status: error instanceof OpenProviderError ? error.status ?? 400 : 400 }
    );
  }

  const bulkText = typeof body.bulkText === 'string' ? body.bulkText : '';
  if (bulkText.trim()) {
    if (!authIsConfigured()) {
      return NextResponse.json(
        { error: { message: 'Google OAuth must be configured before provider credentials can be saved.' } },
        { status: 503 }
      );
    }

    const session = authIsConfigured() ? await getServerSession(authOptions) : null;
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: { message: 'Sign in to save provider credentials for your account.' } },
        { status: 401 }
      );
    }

    const entries = parseEnvText(bulkText);
    const { grouped, ignored } = groupBulkValues(entries);

    if (grouped.size === 0) {
      return NextResponse.json(
        { error: { message: 'No recognized provider credential names were found.', ignored } },
        { status: 400 }
      );
    }

    try {
      const savedProviders = [];

      for (const [providerId, values] of grouped.entries()) {
        const provider = getProviderSetup(providerId);
        if (!provider) {
          continue;
        }

        const saved = await saveUserProviderKeys(userId, provider.id, values);
        const missingRequired = missingRequiredEnv(provider, saved.keyNames);
        savedProviders.push({
          providerId: provider.id,
          name: provider.name,
          updated: Object.keys(values),
          configured: missingRequired.length === 0,
          missingReason: missingRequired.length > 0 ? `Missing saved values: ${missingRequired.join(', ')}.` : undefined,
        });
      }

      invalidateCatalogSnapshot(`user:${userId}`);

      return NextResponse.json({
        ok: true,
        storage: 'database',
        mode: 'bulk',
        savedProviders,
        ignored,
        updated: savedProviders.flatMap(provider => provider.updated),
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            message: error instanceof Error
              ? error.message
              : 'Unable to save provider credentials to the database.',
          },
        },
        { status: 503 }
      );
    }
  }

  const providerId = typeof body.providerId === 'string' ? body.providerId : '';
  const provider = getProviderSetup(providerId);
  if (!provider) {
    return NextResponse.json({ error: { message: 'Unknown provider.' } }, { status: 404 });
  }

  const allowedEnvNames = new Set([
    ...providerEnvNames(provider),
  ]);

  let values: Record<string, string>;
  try {
    values = cleanValues(body.values, allowedEnvNames);
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : 'Invalid credential value.' } },
      { status: 400 }
    );
  }

  if (Object.keys(values).length === 0) {
    return NextResponse.json(
      { error: { message: 'Enter at least one key value to save.' } },
      { status: 400 }
    );
  }

  if (!authIsConfigured()) {
    return NextResponse.json(
      { error: { message: 'Google OAuth must be configured before provider credentials can be saved.' } },
      { status: 503 }
    );
  }

  const session = authIsConfigured() ? await getServerSession(authOptions) : null;
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Sign in to save provider credentials for your account.' } },
      { status: 401 }
    );
  }

  try {
    const saved = await saveUserProviderKeys(userId, provider.id, values);
    invalidateCatalogSnapshot(`user:${userId}`);
    const missingRequired = missingRequiredEnv(provider, saved.keyNames);

    return NextResponse.json({
      ok: true,
      providerId: provider.id,
      storage: 'database',
      updated: Object.keys(values),
      configured: missingRequired.length === 0,
      missingReason: missingRequired.length > 0 ? `Missing saved values: ${missingRequired.join(', ')}.` : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error
            ? error.message
            : 'Unable to save provider credentials to the database.',
        },
      },
      { status: 503 }
    );
  }
}
