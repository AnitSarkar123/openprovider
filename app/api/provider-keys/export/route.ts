import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authIsConfigured, authOptions } from '@/lib/auth';
import { loadUserProviderKeyValues } from '@/lib/openprovider/provider-keys';
import { getProviderSetups } from '@/lib/openprovider/provider-setup';
import type { ProviderId } from '@/src/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatEnvValue(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_./:@+=,\-]+$/.test(trimmed)) {
    return trimmed;
  }

  return `"${trimmed
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

function providerEnvOrder(provider: ReturnType<typeof getProviderSetups>[number]): string[] {
  return [
    ...provider.requiredEnv,
    ...provider.optionalEnv,
    ...(provider.aliases ?? []),
    ...Object.values(provider.requiredEnvAliases ?? {}).flat(),
  ];
}

function orderedEnvNames(provider: ReturnType<typeof getProviderSetups>[number], values: Record<string, string>): string[] {
  const preferred = providerEnvOrder(provider);
  const seen = new Set<string>();
  const names: string[] = [];

  for (const name of preferred) {
    if (values[name] && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  for (const name of Object.keys(values).sort()) {
    if (!seen.has(name)) {
      names.push(name);
    }
  }

  return names;
}

function buildEnvFile(userKeys: Partial<Record<ProviderId, Record<string, string>>>): string {
  const providers = getProviderSetups();
  const lines = [
    '# OpenProvider provider keys export',
    `# Generated ${new Date().toISOString()}`,
    '# Paste these values into .env.local or .env before running: npm run status:models',
    '',
  ];

  for (const provider of providers) {
    const values = userKeys[provider.id];
    if (!values || Object.keys(values).length === 0) {
      continue;
    }

    lines.push(`# ${provider.name}`);
    for (const name of orderedEnvNames(provider, values)) {
      const value = values[name]?.trim();
      if (value) {
        lines.push(`${name}=${formatEnvValue(value)}`);
      }
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export async function GET() {
  if (!authIsConfigured()) {
    return NextResponse.json(
      { error: { message: 'Google OAuth must be configured before provider credentials can be exported.' } },
      { status: 503 }
    );
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Sign in to download provider credentials for your account.' } },
      { status: 401 }
    );
  }

  try {
    const envText = buildEnvFile(await loadUserProviderKeyValues(userId));
    const filename = `openprovider-provider-keys-${new Date().toISOString().slice(0, 10)}.env`;

    return new NextResponse(envText, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error
            ? error.message
            : 'Unable to export provider credentials.',
        },
      },
      { status: 503 }
    );
  }
}
