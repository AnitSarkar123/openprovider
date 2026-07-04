import { ProviderDefinition } from '../core/types';

export const cerbesProvider: ProviderDefinition = {
  id: 'cerbes',
  name: 'Cerbes AI',
  models: [
    {
      id: 'cerbes/auto',
      modelId: 'cerbes/auto',
      name: 'Cerbes Auto',
      provider: 'cerbes',
      priority: 45,
      enabled: true,
      maxInputTokens: 32000,
      maxOutputTokens: 4096,
      supportsTools: false,
      free: true,
      freeReason: 'provider free-tier pool',
      tags: ['cerbes', 'auto'],
    },
  ],
};
