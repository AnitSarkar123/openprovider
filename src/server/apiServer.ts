import { createServer } from 'node:http';
import { loadOpenProviderConfig } from '../config/env';
import { ModelRegistry, createDefaultModelRegistry } from '../core/modelRegistry';
import { discoverConfiguredProviderModels } from '../core/providerDiscovery';
import {
  ModelCategory,
  OpenProviderConfig,
  ProviderDiscoveryResult,
  ProviderModel,
} from '../core/types';
import { OpenProviderError } from '../utils/errors';
import { sendProviderChatCompletion } from './providerChat';
import { generateProviderImage } from './providerImage';
import { generateProviderImageToText } from './providerImageToText';
import { synthesizeProviderSpeech } from './providerSpeech';
import {
  isOpenProviderAutoModel,
  OPENPROVIDER_AUTO_FREE_MODEL_ID,
  OPENPROVIDER_AUTO_FREE_MODEL_NAME,
  rankOpenProviderAutoCandidates,
} from '../core/autoFreeRouter';
import { categorizeModel, isChatRouteModel, normalizeModalities } from '../core/modelCategoryUtils';
import { getModelStatus } from '../core/modelStatus';

type RequestBody = Record<string, unknown>;

type ApiServerOptions = {
  host?: string;
  port?: number;
  config?: OpenProviderConfig;
};

type ApiState = {
  registry: ModelRegistry;
  providerResults: ProviderDiscoveryResult[];
  lastSyncedAt: string;
  syncPromise?: Promise<ProviderModel[]>;
};

type ChatSelection = {
  selected: ProviderModel;
  candidates: ProviderModel[];
  explicitModel: boolean;
};

const CORS_ALLOW_HEADERS = 'authorization, content-type';
const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';

function readServerPort(): number {
  const raw = process.env.OPENPROVIDER_PORT ?? '3000';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

function readServerHost(): string {
  return process.env.OPENPROVIDER_HOST?.trim() || '127.0.0.1';
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function configuredCorsOrigins(): Set<string> {
  return new Set(
    (process.env.OPENPROVIDER_V1_CORS_ORIGINS ?? '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin))
  );
}

function allowedCorsOrigin(request: any): string | null {
  const origin = String(request.headers?.origin ?? '').trim();
  if (!origin) {
    return null;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return null;
  }

  return configuredCorsOrigins().has(normalizedOrigin) ? normalizedOrigin : null;
}

function setCorsHeaders(response: any, origin?: string | null): void {
  response.setHeader('Vary', 'Origin');
  if (!origin) {
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  response.setHeader('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
}

function sendJson(response: any, statusCode: number, payload: unknown): void {
  setCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload, null, 2));
}

function sendNoContent(response: any): void {
  setCorsHeaders(response);
  response.statusCode = 204;
  response.end();
}

function sendBinary(
  response: any,
  statusCode: number,
  bytes: Uint8Array,
  contentType: string,
  extraHeaders: Record<string, string> = {}
): void {
  setCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', String(bytes.byteLength));

  for (const [key, value] of Object.entries(extraHeaders)) {
    response.setHeader(key, value);
  }

  response.end(bytes);
}

function readRequestBody(request: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk: unknown) => {
      body += String(chunk);
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function readJsonBody(request: any): Promise<RequestBody> {
  const text = await readRequestBody(request);
  if (!text.trim()) {
    return {};
  }

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OpenProviderError('Request body must be a JSON object.', 400);
  }

  return parsed as RequestBody;
}

function isAuthorized(request: any, config: OpenProviderConfig): boolean {
  if (!config.apiKey.trim()) {
    return true;
  }

  const authorization = String(request.headers?.authorization ?? '');
  return authorization === `Bearer ${config.apiKey.trim()}`;
}

function publicModel(model: ProviderModel): Record<string, unknown> {
  const category = categorizeModel(model);
  const description = model.description ?? `${model.name} is a free ${model.provider} ${category} model available through OpenProvider.`;
  const status = getModelStatus(model.id);

  return {
    id: model.id,
    object: 'model',
    owned_by: model.provider,
    name: model.name,
    description,
    provider: model.provider,
    modelId: model.modelId,
    routeFormat: model.routeFormat ?? 'openai-compatible',
    category,
    inputModalities: model.inputModalities ?? ['text'],
    outputModalities: model.outputModalities ?? ['text'],
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    supportsTools: model.supportsTools,
    supportsReasoning: Boolean(model.supportsReasoning),
    free: model.free,
    freeReason: model.freeReason,
    tags: model.tags,
    status: status.status,
    statusCheckedAt: status.checkedAt,
    statusLatencyMs: status.latencyMs,
    statusError: status.error,
    statusSuccesses: status.successes,
    statusFailures: status.failures,
    statusConsecutiveFailures: status.consecutiveFailures,
    statusLastSuccessAt: status.lastSuccessAt,
    statusLastFailureAt: status.lastFailureAt,
  };
}

function publicOpenProviderAutoModel(models: ProviderModel[]): Record<string, unknown> {
  const chatModels = models.filter(model => model.free && isChatRouteModel(model));
  const maxInputTokens = Math.max(128000, ...chatModels.map(model => model.maxInputTokens));
  const maxOutputTokens = Math.max(4096, ...chatModels.map(model => model.maxOutputTokens));
  const inputModalities = normalizeModalities(chatModels.flatMap(model => model.inputModalities));
  const status = getModelStatus(OPENPROVIDER_AUTO_FREE_MODEL_ID);

  return {
    id: OPENPROVIDER_AUTO_FREE_MODEL_ID,
    object: 'model',
    owned_by: 'openprovider',
    name: OPENPROVIDER_AUTO_FREE_MODEL_NAME,
    description: 'OpenProvider Auto Free routes each request to the best available free chat model across your configured providers using context size, task type, reasoning support, tools support, and live fallback availability.',
    provider: 'openprovider',
    modelId: 'auto-free',
    category: 'text',
    inputModalities: inputModalities.includes('image') ? ['text', 'image'] : ['text'],
    outputModalities: ['text'],
    maxInputTokens,
    maxOutputTokens,
    supportsTools: chatModels.some(model => model.supportsTools),
    supportsReasoning: chatModels.some(model => model.supportsReasoning),
    free: true,
    freeReason: 'automatic free route',
    tags: ['openprovider', 'auto', 'free', 'router', 'chat', 'fallback'],
    status: status.status,
    statusCheckedAt: status.checkedAt,
    statusLatencyMs: status.latencyMs,
    statusError: status.error,
    statusSuccesses: status.successes,
    statusFailures: status.failures,
  };
}

function requestWantsReasoning(requestBody: RequestBody): boolean {
  if (requestBody.thinking === true || requestBody.include_reasoning === true || typeof requestBody.reasoning_effort === 'string') {
    return true;
  }

  if (requestBody.reasoning === true) {
    return true;
  }

  const reasoning = requestBody.reasoning;
  return Boolean(reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning) && (reasoning as Record<string, unknown>).exclude !== true);
}

function shouldTryNextChatModel(error: unknown): boolean {
  if (!(error instanceof OpenProviderError)) {
    return false;
  }

  return [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(error.status ?? 0);
}

function categoryCounts(models: ProviderModel[]): Record<string, number> {
  return models.reduce<Record<string, number>>((counts, model) => {
    const category = categorizeModel(model);
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}

function providerStatus(result: ProviderDiscoveryResult): Record<string, unknown> {
  const counts = categoryCounts(result.models);

  return {
    provider: result.provider,
    ok: result.ok,
    skipped: result.skipped,
    modelCount: result.modelCount,
    categoryCounts: counts,
    textModelCount: counts.text ?? 0,
    imageModelCount: counts.image ?? 0,
    visionModelCount: counts.vision ?? 0,
    audioModelCount: counts.audio ?? 0,
    discoveredModelCount: result.discoveredModelCount,
    filteredModelCount: result.filteredModelCount,
    status: result.status,
    error: result.error,
  };
}

function handleHealth(config: OpenProviderConfig, state: ApiState, response: any): void {
  const providers = Object.values(config.providers);
  const configuredProviders = providers.filter(provider => provider.enabled).length;

  sendJson(response, 200, {
    ok: true,
    service: 'openprovider',
    version: '0.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    freeOnly: config.freeModelsOnly,
    configuredProviders,
    cachedModels: state.registry.list().filter(model => model.free).length,
    cachedCategoryCounts: categoryCounts(state.registry.list().filter(model => model.free)),
    cachedTextModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'text').length,
    cachedImageModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'image').length,
    cachedVisionModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'vision').length,
    cachedAudioModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'audio').length,
    syncedAt: state.lastSyncedAt || null,
  });
}

async function syncModels(config: OpenProviderConfig, state: ApiState): Promise<ProviderModel[]> {
  if (state.syncPromise) {
    return state.syncPromise;
  }

  state.syncPromise = discoverConfiguredProviderModels(config)
    .then(results => {
      state.providerResults = results;
      const models = results.flatMap(result => result.models);

      if (models.length > 0) {
        state.registry.replaceModels(models);
      }

      state.lastSyncedAt = new Date().toISOString();
      return state.registry.list();
    })
    .finally(() => {
      state.syncPromise = undefined;
    });

  return state.syncPromise;
}

function modelsNeedSync(config: OpenProviderConfig, state: ApiState): boolean {
  if (!state.lastSyncedAt) {
    return true;
  }

  const lastSyncedMs = Date.parse(state.lastSyncedAt);
  if (!Number.isFinite(lastSyncedMs)) {
    return true;
  }

  return Date.now() - lastSyncedMs >= config.modelSyncTtlMs;
}

async function ensureFreshModels(config: OpenProviderConfig, state: ApiState): Promise<void> {
  if (modelsNeedSync(config, state)) {
    await syncModels(config, state);
  }
}

function selectChatCandidates(
  state: ApiState,
  requestedModel: unknown,
  requestBody: RequestBody
): ChatSelection {
  const modelName = typeof requestedModel === 'string' && requestedModel.trim()
    ? requestedModel.trim()
    : OPENPROVIDER_AUTO_FREE_MODEL_ID;

  const availableModels = state.registry.list().filter(model => model.enabled && model.free && isChatRouteModel(model));
  const needsTools = Array.isArray(requestBody.tools) && requestBody.tools.length > 0;
  const needsReasoning = requestWantsReasoning(requestBody);
  const toolCandidates = needsTools
    ? availableModels.filter(model => model.supportsTools)
    : availableModels;
  if (isOpenProviderAutoModel(modelName)) {
    const candidates = rankOpenProviderAutoCandidates(
      needsReasoning || needsTools ? toolCandidates : availableModels,
      requestBody
    );
    const autoModel = candidates[0] ?? toolCandidates[0] ?? availableModels[0];
    if (!autoModel) {
      throw new OpenProviderError(
        'No free models are currently available.',
        503
      );
    }
    return {
      selected: autoModel,
      candidates: candidates.length > 0 ? candidates : [autoModel],
      explicitModel: false,
    };
  }

  const model = state.registry.find(modelName);
  if (!model || !model.enabled || !model.free || !isChatRouteModel(model)) {
    throw new OpenProviderError(`Model "${modelName}" is not available in the free model registry.`, 404);
  }

  if (needsTools && !model.supportsTools) {
    throw new OpenProviderError(`Model "${modelName}" does not support tools.`, 400);
  }

  return {
    selected: model,
    candidates: [model],
    explicitModel: true,
  };
}

function selectImageModel(
  state: ApiState,
  requestedModel: unknown
): ProviderModel {
  const modelName = typeof requestedModel === 'string' && requestedModel.trim()
    ? requestedModel.trim()
    : 'auto';
  const availableModels = state.registry.list().filter(model => model.enabled && model.free && categorizeModel(model) === 'image');

  if (modelName.toLowerCase() === 'auto') {
    const autoModel = availableModels[0];
    if (!autoModel) {
      throw new OpenProviderError(
        'No free image generation models are currently available.',
        503
      );
    }
    return autoModel;
  }

  const model = state.registry.find(modelName);
  if (!model || !model.enabled || !model.free || categorizeModel(model) !== 'image') {
    throw new OpenProviderError(`Model "${modelName}" is not available in the free image model registry.`, 404);
  }

  return model;
}

function selectCategoryModel(
  state: ApiState,
  requestedModel: unknown,
  category: ModelCategory,
  emptyMessage: string,
  missingMessage: (modelName: string) => string
): ProviderModel {
  const modelName = typeof requestedModel === 'string' && requestedModel.trim()
    ? requestedModel.trim()
    : 'auto';
  const availableModels = state.registry.list().filter(model => model.enabled && model.free && categorizeModel(model) === category);

  if (modelName.toLowerCase() === 'auto') {
    const autoModel = availableModels[0];
    if (!autoModel) {
      throw new OpenProviderError(
        emptyMessage,
        503
      );
    }
    return autoModel;
  }

  const model = state.registry.find(modelName);
  if (!model || !model.enabled || !model.free || categorizeModel(model) !== category) {
    throw new OpenProviderError(missingMessage(modelName), 404);
  }

  return model;
}

async function proxyStreamingResponse(providerResponse: Response, response: any): Promise<void> {
  if (!providerResponse.body) {
    throw new OpenProviderError('Provider returned an empty stream.', providerResponse.status);
  }

  setCorsHeaders(response);
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');

  const reader = providerResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      response.write(value);
    }
  } finally {
    reader.releaseLock();
    response.end();
  }
}

async function handleModels(config: OpenProviderConfig, state: ApiState, url: URL, response: any): Promise<void> {
  const models = await syncModels(config, state);
  const category = url.searchParams.get('category');
  const filteredModels = models
    .filter(model => model.free)
    .filter(model => !category || categorizeModel(model) === category);
  const includeOpenProviderAuto = !category || category === 'text';

  sendJson(response, 200, {
    object: 'list',
    data: [
      ...(includeOpenProviderAuto ? [publicOpenProviderAutoModel(models)] : []),
      ...filteredModels.map(publicModel),
    ],
    syncedAt: state.lastSyncedAt,
    freeOnly: config.freeModelsOnly,
    category: category || 'all',
  });
}

async function handleProviderStatus(config: OpenProviderConfig, state: ApiState, response: any): Promise<void> {
  await syncModels(config, state);

  sendJson(response, 200, {
    object: 'provider_status',
    data: state.providerResults.map(providerStatus),
    syncedAt: state.lastSyncedAt,
    totalModels: state.registry.list().filter(model => model.free).length,
    totalCategoryCounts: categoryCounts(state.registry.list().filter(model => model.free)),
    totalTextModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'text').length,
    totalImageModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'image').length,
    totalVisionModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'vision').length,
    totalAudioModels: state.registry.list().filter(model => model.free && categorizeModel(model) === 'audio').length,
  });
}

async function handleChatCompletions(
  config: OpenProviderConfig,
  state: ApiState,
  request: any,
  response: any
): Promise<void> {
  const body = await readJsonBody(request);

  if (!Array.isArray(body.messages)) {
    throw new OpenProviderError('messages must be an array.', 400);
  }

  await ensureFreshModels(config, state);

  const { candidates, explicitModel } = selectChatCandidates(state, body.model, body);
  const attempts: Array<{ model: string; status?: number; error: string }> = [];

  for (const model of candidates) {
    try {
      const providerResponse = await sendProviderChatCompletion(config, model, {
        ...body,
        model: model.modelId,
      });

      if (body.stream === true) {
        await proxyStreamingResponse(providerResponse, response);
        return;
      }

      const payload = await providerResponse.text();
      setCorsHeaders(response);
      response.statusCode = 200;
      response.setHeader('Content-Type', providerResponse.headers.get('content-type') ?? 'application/json; charset=utf-8');
      response.end(payload);
      return;
    } catch (error) {
      attempts.push({
        model: model.id,
        status: error instanceof OpenProviderError ? error.status : undefined,
        error: error instanceof Error ? error.message : 'Unknown provider error',
      });

      if (explicitModel || !shouldTryNextChatModel(error)) {
        throw error;
      }
    }
  }

  const last = attempts.at(-1);
  throw new OpenProviderError(last?.error ?? 'No available chat model returned a response.', last?.status ?? 503, JSON.stringify({ attempts }));
}

async function handleImageGenerations(
  config: OpenProviderConfig,
  state: ApiState,
  request: any,
  response: any
): Promise<void> {
  const body = await readJsonBody(request);

  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    throw new OpenProviderError('prompt must be a non-empty string.', 400);
  }

  await ensureFreshModels(config, state);

  const model = selectImageModel(state, body.model);
  const payload = await generateProviderImage(config, model, {
    ...body,
    model: model.modelId,
  });

  sendJson(response, 200, payload);
}

async function handleImageToText(
  config: OpenProviderConfig,
  state: ApiState,
  request: any,
  response: any
): Promise<void> {
  const body = await readJsonBody(request);

  await ensureFreshModels(config, state);

  const model = selectCategoryModel(
    state,
    body.model,
    'vision',
    'No free vision models are currently available.',
    modelName => `Model "${modelName}" is not available in the free vision model registry.`
  );
  const payload = await generateProviderImageToText(config, model, {
    ...body,
    model: model.modelId,
  });

  sendJson(response, 200, payload);
}

async function handleAudioSpeech(
  config: OpenProviderConfig,
  state: ApiState,
  request: any,
  response: any
): Promise<void> {
  const body = await readJsonBody(request);

  if (typeof body.input !== 'string' || !body.input.trim()) {
    throw new OpenProviderError('input must be a non-empty string.', 400);
  }

  await ensureFreshModels(config, state);

  const model = selectCategoryModel(
    state,
    body.model,
    'audio',
    'No free audio models are currently available.',
    modelName => `Model "${modelName}" is not available in the free audio model registry.`
  );
  const payload = await synthesizeProviderSpeech(config, model, {
    ...body,
    model: model.modelId,
  });

  sendBinary(response, 200, payload.bytes, payload.contentType, {
    'X-OpenProvider-Model': payload.model,
    'X-OpenProvider-Provider': payload.provider,
  });
}

function errorStatus(error: unknown): number {
  if (error instanceof OpenProviderError && error.status) {
    return error.status;
  }

  if (error instanceof SyntaxError) {
    return 400;
  }

  return 500;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bopk_(?:live|test)_[A-Za-z0-9._~+/=-]+/gi, 'opk_[redacted]')
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, match => {
      const separator = match.includes('=') ? '=' : ':';
      return `${match.slice(0, match.indexOf(separator) + 1)} [redacted]`;
    });
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof SyntaxError) {
    return 'Invalid JSON request body.';
  }

  const status = errorStatus(error);
  if (error instanceof OpenProviderError && status < 500) {
    return redactSensitiveText(error.message);
  }

  return 'OpenProvider request failed.';
}

function errorPayload(error: unknown): Record<string, unknown> {
  return {
    error: {
      message: safeErrorMessage(error),
      type: error instanceof OpenProviderError ? error.name : 'OpenProviderServerError',
    },
  };
}

export function createOpenProviderApiServer(options: ApiServerOptions = {}) {
  const config = options.config ?? loadOpenProviderConfig();
  const state: ApiState = {
    registry: createDefaultModelRegistry(),
    providerResults: [],
    lastSyncedAt: '',
  };

  return createServer((request: any, response: any) => {
    void (async () => {
      const corsOrigin = allowedCorsOrigin(request);
      setCorsHeaders(response, corsOrigin);

      if (request.method === 'OPTIONS') {
        if (request.headers?.origin && !corsOrigin) {
          sendJson(response, 403, {
            error: {
              message: 'This origin is not allowed to call the OpenProvider API.',
              type: 'CorsError',
            },
          });
          return;
        }

        sendNoContent(response);
        return;
      }

      if (!isAuthorized(request, config)) {
        sendJson(response, 401, {
          error: {
            message: 'Missing or invalid OpenProvider API key.',
            type: 'AuthenticationError',
          },
        });
        return;
      }

      const url = new URL(String(request.url ?? '/'), 'http://localhost');

      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/health')) {
        handleHealth(config, state, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/models') {
        await handleModels(config, state, url, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/providers/status') {
        await handleProviderStatus(config, state, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        await handleChatCompletions(config, state, request, response);
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/images/generations'
      ) {
        await handleImageGenerations(config, state, request, response);
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/images/analyze'
      ) {
        await handleImageToText(config, state, request, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/audio/speech') {
        await handleAudioSpeech(config, state, request, response);
        return;
      }

      sendJson(response, 404, {
        error: {
          message: `Route not found: ${request.method} ${url.pathname}`,
          type: 'NotFoundError',
        },
      });
    })().catch(error => {
      sendJson(response, errorStatus(error), errorPayload(error));
    });
  });
}

export function startOpenProviderApiServer(options: ApiServerOptions = {}): void {
  const config = options.config ?? loadOpenProviderConfig();
  const host = options.host ?? readServerHost();
  const port = options.port ?? readServerPort();
  const server = createOpenProviderApiServer({ ...options, config });

  server.listen(port, host, () => {
    console.log(`OpenProvider API server listening at http://${host}:${port}`);
    console.log('Endpoints: GET /health, GET /v1/models, GET /v1/providers/status, POST /v1/chat/completions, POST /v1/images/generations, POST /v1/images/analyze, POST /v1/audio/speech');
  });
}
