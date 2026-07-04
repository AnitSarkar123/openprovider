import { normalizeModality } from '@/src/core/modelCategoryUtils';
import type { ModelCategory } from '@/src/core/types';

const modelCategories = new Set<ModelCategory>(['text', 'image', 'vision', 'audio', 'auto']);

export function parseModelCategory(value: string | null): ModelCategory | null {
  const category = value?.trim();
  return category && modelCategories.has(category as ModelCategory) ? category as ModelCategory : null;
}

export function parseModalitySet(value: string | null): Set<string> | null {
  if (!value) {
    return null;
  }

  const modalities = value
    .split(',')
    .map(item => normalizeModality(item))
    .filter((item): item is string => Boolean(item) && item !== 'all');

  return modalities.length > 0 ? new Set(modalities) : null;
}

export function parseSupportedParameters(value: string | null): Set<string> | null {
  if (!value) {
    return null;
  }

  const parameters = value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  return parameters.length > 0 ? new Set(parameters) : null;
}
