import type { ModelCategory, ProviderModel } from './types';

type CategorizedModel = Pick<ProviderModel, 'category' | 'inputModalities' | 'outputModalities'>;
type CapabilityModel = Pick<ProviderModel, 'category' | 'inputModalities' | 'outputModalities' | 'supportsTools' | 'supportsReasoning' | 'tags'>;

const MODEL_CATEGORIES = new Set<ModelCategory>(['text', 'image', 'vision', 'audio', 'auto']);

const MODALITY_ALIASES: Record<string, string> = {
  file_url: 'file',
  image_url: 'image',
  images: 'image',
  img: 'image',
  speech: 'audio',
  tts: 'audio',
  voice: 'audio',
  voices: 'audio',
};

const UNIVERSAL_TEXT_PARAMETERS = new Set([
  'frequency_penalty',
  'max_tokens',
  'presence_penalty',
  'response_format',
  'seed',
  'stop',
  'stream',
  'temperature',
  'top_p',
]);

export function isModelCategory(value: unknown): value is ModelCategory {
  return typeof value === 'string' && MODEL_CATEGORIES.has(value as ModelCategory);
}

export function normalizeModality(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) {
    return undefined;
  }

  return MODALITY_ALIASES[normalized] ?? normalized;
}

export function normalizeModalities(modalities: readonly unknown[] | undefined): string[] {
  const normalized = new Set<string>();

  for (const modality of modalities ?? []) {
    const value = normalizeModality(modality);
    if (value) {
      normalized.add(value);
    }
  }

  return [...normalized];
}

function hasModality(modalities: readonly string[], modality: string): boolean {
  return modalities.includes(modality);
}

/**
 * Returns the primary OpenProvider route category for a model.
 *
 * Category is a task/route choice, not a complete capability description.
 * Modalities remain separate facets so multimodal chat models can stay in
 * text while image generation and image analysis route to their own endpoints.
 */
export function categorizeModel(model: CategorizedModel): ModelCategory {
  if (isModelCategory(model.category) && model.category !== 'auto') {
    return model.category;
  }

  const inputMods = normalizeModalities(model.inputModalities);
  const outputMods = normalizeModalities(model.outputModalities);

  const hasTextInput = hasModality(inputMods, 'text');
  const hasImageInput = hasModality(inputMods, 'image');
  const hasFileInput = hasModality(inputMods, 'file');
  const hasAudioInput = hasModality(inputMods, 'audio');

  const hasTextOutput = hasModality(outputMods, 'text');
  const hasImageOutput = hasModality(outputMods, 'image');
  const hasAudioOutput = hasModality(outputMods, 'audio');

  if (hasImageOutput) {
    return 'image';
  }

  if (hasAudioOutput) {
    return 'audio';
  }

  if ((hasImageInput || hasFileInput) && hasTextOutput) {
    return 'vision';
  }

  if ((hasTextInput || hasAudioInput) && hasTextOutput) {
    return 'text';
  }

  if (isModelCategory(model.category) && model.category !== 'auto') {
    return model.category;
  }

  return 'text';
}

export function modelMatchesCategory(model: CategorizedModel, category: ModelCategory): boolean {
  return categorizeModel(model) === category;
}

export function isChatRouteCategory(category: ModelCategory): boolean {
  return category === 'text' || category === 'vision';
}

export function isChatRouteModel(model: CategorizedModel): boolean {
  return isChatRouteCategory(categorizeModel(model));
}

export function modelHasAllModalities(
  modelModalities: readonly unknown[] | undefined,
  requiredModalities: ReadonlySet<string> | null
): boolean {
  if (!requiredModalities || requiredModalities.size === 0) {
    return true;
  }

  const available = new Set(normalizeModalities(modelModalities));
  return [...requiredModalities].every(modality => available.has(modality));
}

export function modelSupportsParameter(model: CapabilityModel, parameter: string): boolean {
  const normalized = parameter.trim().toLowerCase();
  const category = categorizeModel(model);
  const tags = new Set((model.tags ?? []).map(tag => tag.toLowerCase()));

  if (normalized === 'tools' || normalized === 'tool_choice') {
    return Boolean(model.supportsTools);
  }

  if (normalized === 'reasoning' || normalized === 'include_reasoning') {
    return Boolean(model.supportsReasoning) || tags.has('reasoning') || tags.has('thinking');
  }

  if (UNIVERSAL_TEXT_PARAMETERS.has(normalized)) {
    return category === 'text' || category === 'vision';
  }

  return tags.has(normalized);
}

export function modelSupportsAllParameters(model: CapabilityModel, parameters: ReadonlySet<string> | null): boolean {
  if (!parameters || parameters.size === 0) {
    return true;
  }

  return [...parameters].every(parameter => modelSupportsParameter(model, parameter));
}
