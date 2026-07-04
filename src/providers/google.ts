import { ProviderDefinition } from '../core/types';

export const googleProvider: ProviderDefinition = {
  id: 'google',
  name: 'Google AI Studio',
  models: [
    {
      id: 'google/gemini-flash-latest',
      modelId: 'gemini-flash-latest',
      name: 'Gemini Flash Latest',
      provider: 'google',
      category: 'text',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      priority: 73,
      enabled: true,
      maxInputTokens: 1048576,
      maxOutputTokens: 65536,
      supportsTools: true,
      supportsReasoning: true,
      free: true,
      freeReason: 'tested Google AI Studio free API-key alias',
      tags: ['google', 'gemini', 'flash', 'text', 'vision', 'reasoning', 'free'],
    },
  ],
};
