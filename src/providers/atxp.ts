import { ProviderDefinition } from '../core/types';

const modelSpecs: Array<{ modelId: string; name: string }> = [
  { modelId: 'auto', name: 'Auto' },
  { modelId: 'auto-eco', name: 'Auto Eco' },
  { modelId: 'auto-premium', name: 'Auto Premium' },
  { modelId: 'openai/gpt-5.2', name: 'GPT-5.2' },
  { modelId: 'openai/gpt-5.2-pro', name: 'GPT-5.2 Pro' },
  { modelId: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex' },
  { modelId: 'openai/gpt-5.4', name: 'GPT-5.4' },
  { modelId: 'openai/gpt-5.5', name: 'GPT-5.5' },
  { modelId: 'openai/gpt-5.5-pro', name: 'GPT-5.5 Pro' },
  { modelId: 'anthropic/claude-opus-4-8', name: 'Claude Opus 4.8' },
  { modelId: 'anthropic/claude-opus-4-7', name: 'Claude Opus 4.7' },
  { modelId: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6' },
  { modelId: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { modelId: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  { modelId: 'openai/o4-mini', name: 'o4-mini' },
  { modelId: 'google-ai-studio/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
  { modelId: 'google-ai-studio/gemini-flash-latest', name: 'Gemini Flash Latest' },
  { modelId: 'grok/grok-4', name: 'Grok 4' },
  { modelId: 'grok/grok-4-1-fast', name: 'Grok 4.1 Fast' },
  { modelId: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2' },
  { modelId: 'grok/grok-3-mini', name: 'Grok 3 Mini' },
];

const models = modelSpecs.map(({ modelId, name }, index) => ({
  id: `atxp/${modelId}`,
  modelId,
  name,
  provider: 'atxp' as const,
  category: 'text' as const,
  inputModalities: ['text'],
  outputModalities: ['text'],
  priority: 72 - index,
  enabled: true,
  maxInputTokens: 128000,
  maxOutputTokens: 8192,
  supportsTools: true,
  supportsReasoning: false,
  free: true,
  freeReason: 'ATXP account starter/free credits',
  tags: ['atxp', 'text', 'free'],
}));

export const atxpProvider: ProviderDefinition = {
  id: 'atxp',
  name: 'ATXP LLM Gateway',
  models,
};
