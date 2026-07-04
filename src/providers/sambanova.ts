import { ProviderDefinition, ProviderModel } from '../core/types';

const freeModels: Array<{
  modelId: string;
  name: string;
  context: number;
  output?: number;
  reasoning?: boolean;
  vision?: boolean;
}> = [
  {
    modelId: 'DeepSeek-V3.1',
    name: 'DeepSeek V3.1',
    context: 128000,
    reasoning: true,
  },
  {
    modelId: 'Meta-Llama-3.3-70B-Instruct',
    name: 'Meta Llama 3.3 70B Instruct',
    context: 128000,
  },
  {
    modelId: 'gpt-oss-120b',
    name: 'GPT OSS 120B',
    context: 128000,
    reasoning: true,
  },
  {
    modelId: 'DeepSeek-V3.2',
    name: 'DeepSeek V3.2',
    context: 32000,
    reasoning: true,
  },
  {
    modelId: 'Llama-4-Maverick-17B-128E-Instruct',
    name: 'Llama 4 Maverick 17B 128E Instruct',
    context: 128000,
    vision: true,
  },
];

const models: ProviderModel[] = freeModels.map((model, index) => ({
  id: `sambanova/${model.modelId}`,
  modelId: model.modelId,
  name: model.name,
  provider: 'sambanova',
  category: 'text',
  inputModalities: model.vision ? ['text', 'image'] : ['text'],
  outputModalities: ['text'],
  priority: 77 - index,
  enabled: true,
  maxInputTokens: model.context,
  maxOutputTokens: model.output ?? Math.min(8192, Math.max(1024, Math.floor(model.context / 8))),
  supportsTools: true,
  supportsReasoning: model.reasoning ?? false,
  free: true,
  freeReason: 'SambaNova Cloud free tier',
  tags: [
    'sambanova',
    'sambacloud',
    'text',
    'free',
    ...(model.reasoning ? ['reasoning'] : []),
    ...(model.vision ? ['vision'] : []),
  ],
}));

export const sambaNovaProvider: ProviderDefinition = {
  id: 'sambanova',
  name: 'SambaNova Cloud',
  models,
};
