import { ProviderDefinition } from '../core/types';

export const apiFreeLlmProvider: ProviderDefinition = {
  id: 'apifreellm',
  name: 'ApiFreeLLM',
  models: [
    {
      id: 'apifreellm/apifreellm',
      modelId: 'apifreellm',
      name: 'ApiFreeLLM',
      provider: 'apifreellm',
      category: 'text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      priority: 38,
      enabled: true,
      maxInputTokens: 32768,
      maxOutputTokens: 4096,
      supportsTools: false,
      supportsReasoning: false,
      free: true,
      freeReason: 'ApiFreeLLM free API access',
      tags: ['apifreellm', 'text', 'free'],
    },
  ],
};
