import { getCatalogSnapshot, type PublicModel } from '@/lib/openprovider/catalog';
import { applyUserProviderKeysToConfig, loadUserProviderKeyValues } from '@/lib/openprovider/provider-keys';
import { loadOpenProviderConfig } from '@/src/config/env';
import { isOpenProviderAutoModel } from '@/src/core/autoFreeRouter';
import { categorizeModel } from '@/src/core/modelCategoryUtils';
import type { ModelCategory, OpenProviderConfig, ProviderModel } from '@/src/core/types';
import { generateProviderImage } from '@/src/server/providerImage';
import { generateProviderImageToText } from '@/src/server/providerImageToText';
import { synthesizeProviderSpeech, type ProviderSpeechResponse } from '@/src/server/providerSpeech';
import { OpenProviderError } from '@/src/utils/errors';

type MediaRequestBody = Record<string, unknown>;

type MediaRunOptions = {
  userId?: string | null;
};

function toProviderModel(model: PublicModel): ProviderModel | undefined {
  if (model.provider === 'openprovider') {
    return undefined;
  }

  return {
    id: model.id,
    modelId: model.modelId,
    name: model.name,
    description: model.description,
    provider: model.provider as ProviderModel['provider'],
    routeFormat: model.routeFormat === 'anthropic-messages' ? 'anthropic-messages' : 'openai-compatible',
    category: model.category,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    priority: model.priority,
    enabled: true,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning,
    free: true,
    freeReason: model.freeReason,
    tags: model.tags,
  };
}

function isAutoModel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'auto' || isOpenProviderAutoModel(normalized);
}

function findRequestedModel(models: ProviderModel[], modelName: string): ProviderModel | undefined {
  const normalized = modelName.trim().toLowerCase();
  return models.find(model => (
    model.id.toLowerCase() === normalized ||
    model.modelId.toLowerCase() === normalized
  ));
}

function categoryLabel(category: ModelCategory): string {
  if (category === 'image') return 'image generation';
  if (category === 'vision') return 'image analysis';
  if (category === 'audio') return 'speech';
  if (category === 'text') return 'text';
  return 'auto';
}

function selectCategoryModel(
  config: OpenProviderConfig,
  models: ProviderModel[],
  requestedModel: unknown,
  category: ModelCategory
): ProviderModel {
  const modelName = typeof requestedModel === 'string' && requestedModel.trim()
    ? requestedModel.trim()
    : 'auto';
  const categoryModels = models.filter(model => model.free && categorizeModel(model) === category);

  if (isAutoModel(modelName)) {
    const availableModels = categoryModels.filter(model => (
      model.enabled &&
      config.providers[model.provider]?.enabled
    ));
    const autoModel = availableModels[0];
    if (!autoModel) {
      throw new OpenProviderError(
        `No configured free ${categoryLabel(category)} models are currently available.`,
        503
      );
    }

    return autoModel;
  }

  const model = findRequestedModel(models, modelName);
  if (!model || !model.enabled || !model.free || categorizeModel(model) !== category) {
    throw new OpenProviderError(
      `Model "${modelName}" is not available in the free ${categoryLabel(category)} model registry.`,
      404
    );
  }

  return model;
}

async function loadMediaModels(userId?: string | null) {
  const userKeys = userId ? await loadUserProviderKeyValues(userId) : {};
  const hasCustomKeys = Object.keys(userKeys).length > 0;

  const config = hasCustomKeys
    ? await applyUserProviderKeysToConfig(loadOpenProviderConfig(), userId)
    : loadOpenProviderConfig();

  const snapshot = await getCatalogSnapshot({
    config,
    cacheKey: hasCustomKeys ? `user:${userId}` : 'base',
  });

  return {
    config,
    configuredModels: snapshot.models.map(toProviderModel).filter((model): model is ProviderModel => Boolean(model)),
  };
}

function withMediaRoutePayload(payload: unknown, model: ProviderModel): Record<string, unknown> {
  const route = {
    model: model.id,
    provider: model.provider,
  };

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const existingRoute = record.openprovider && typeof record.openprovider === 'object'
      ? record.openprovider as Record<string, unknown>
      : {};

    return {
      ...record,
      model: typeof record.model === 'string' ? record.model : model.id,
      openprovider: {
        ...existingRoute,
        ...route,
      },
    };
  }

  return {
    data: payload,
    model: model.id,
    openprovider: route,
  };
}

export async function runImageGeneration(body: MediaRequestBody, options: MediaRunOptions = {}) {
  const { config, configuredModels } = await loadMediaModels(options.userId);
  const model = selectCategoryModel(config, configuredModels, body.model, 'image');

  const payload = await generateProviderImage(config, model, {
    ...body,
    model: model.modelId,
  });
  return withMediaRoutePayload(payload, model);
}

export async function runImageAnalysis(body: MediaRequestBody, options: MediaRunOptions = {}) {
  const { config, configuredModels } = await loadMediaModels(options.userId);
  const model = selectCategoryModel(config, configuredModels, body.model, 'vision');

  const payload = await generateProviderImageToText(config, model, {
    ...body,
    model: model.modelId,
  });
  return withMediaRoutePayload(payload, model);
}

export async function runSpeechSynthesis(
  body: MediaRequestBody,
  options: MediaRunOptions = {}
): Promise<ProviderSpeechResponse> {
  const { config, configuredModels } = await loadMediaModels(options.userId);
  const model = selectCategoryModel(config, configuredModels, body.model, 'audio');

  return synthesizeProviderSpeech(config, model, {
    ...body,
    model: model.modelId,
  });
}
