import type { ProviderId } from '@/src/core/types';
import { PROVIDER_ENTRIES, getProviderMetadata } from '@/src/core/providerRegistry';
import { listUserProviderKeyStatuses } from './provider-keys';

export type ProviderSetup = {
  id: ProviderId;
  name: string;
  description: string;
  getKeyUrl: string;
  docsUrl: string;
  requiredEnv: string[];
  requiredEnvAliases?: Record<string, string[]>;
  optionalEnv: string[];
  aliases?: string[];
  capabilities: string[];
  note: string;
};

export type ProviderSetupStatus = ProviderSetup & {
  configured: boolean;
  missingReason?: string;
  savedKeyNames?: string[];
  storage: 'database' | 'missing';
};

const providers: ProviderSetup[] = PROVIDER_ENTRIES
  .filter(provider => provider.id !== 'openprovider')
  .map(provider => {
    const setup: ProviderSetup = {
      id: provider.id as ProviderId,
      name: provider.name,
      description: provider.description,
      getKeyUrl: provider.getKeyUrl,
      docsUrl: provider.docsUrl,
      requiredEnv: [...provider.requiredEnv],
      optionalEnv: [...provider.optionalEnv],
      capabilities: [...provider.capabilities],
      note: provider.note,
    };

    if (provider.requiredEnvAliases) {
      setup.requiredEnvAliases = Object.fromEntries(
        Object.entries(provider.requiredEnvAliases).map(([name, aliases]) => [name, [...aliases]])
      );
    }

    if (provider.aliases) {
      setup.aliases = [...provider.aliases];
    }

    return setup;
  });

export function getProviderSetupStatuses(): ProviderSetupStatus[] {
  return providers.map(provider => {
    if (provider.requiredEnv.length === 0) {
      return {
        ...provider,
        configured: true,
        storage: 'missing',
      };
    }

    return {
      ...provider,
      configured: false,
      missingReason: 'Sign in and save provider credentials in Account -> Provider setup.',
      storage: 'missing',
    };
  });
}

export async function getProviderSetupStatusesForUser(userId?: string | null): Promise<ProviderSetupStatus[]> {
  if (!userId) {
    return getProviderSetupStatuses();
  }

  let savedStatuses: Map<ProviderId, { keyNames: string[]; updatedAt: Date }>;

  try {
    savedStatuses = await listUserProviderKeyStatuses(userId);
  } catch {
    return providers.map(provider => ({
      ...provider,
      configured: false,
      missingReason: 'Provider key storage is not migrated yet.',
      storage: 'missing',
    }));
  }

  return providers.map(provider => {
    const saved = savedStatuses.get(provider.id);
    if (!saved) {
      if (provider.requiredEnv.length === 0) {
        return {
          ...provider,
          configured: true,
          storage: 'missing',
        };
      }

      return {
        ...provider,
        configured: false,
        missingReason: 'No credential is saved for this provider.',
        storage: 'missing',
      };
    }

    const missingRequired = missingRequiredEnv(provider, saved.keyNames);

    return {
      ...provider,
      configured: missingRequired.length === 0,
      missingReason: missingRequired.length > 0 ? `Missing saved values: ${missingRequired.join(', ')}.` : undefined,
      savedKeyNames: saved.keyNames,
      storage: 'database',
    };
  });
}

export function getProviderSetup(providerId: string): ProviderSetup | undefined {
  const provider = getProviderMetadata(providerId);
  if (!provider) {
    return undefined;
  }

  return providers.find(item => item.id === provider.id);
}

export function getProviderSetups(): ProviderSetup[] {
  return providers;
}

export function missingRequiredEnv(provider: ProviderSetup, keyNames: string[]): string[] {
  const saved = new Set(keyNames);

  return provider.requiredEnv.filter(name => {
    if (saved.has(name)) {
      return false;
    }

    return !(provider.requiredEnvAliases?.[name] ?? []).some(alias => saved.has(alias));
  });
}
