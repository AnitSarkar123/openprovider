import { OpenProviderError } from '@/src/utils/errors';
import { sendProviderChatCompletion } from '@/src/server/providerChat';
import { categorizeModel, isModelCategory } from '@/src/core/modelCategoryUtils';
import { markModelFailing, markModelUnknown, markModelWorking, type RuntimeModelStatus } from '@/src/core/modelStatus';
import { generateProviderImage } from '@/src/server/providerImage';
import { generateProviderImageToText } from '@/src/server/providerImageToText';
import { synthesizeProviderSpeech } from '@/src/server/providerSpeech';
import type { OpenProviderConfig, ProviderId, ProviderModel } from '@/src/core/types';
import {
  finishModelStatusRun,
  hydratePersistedModelStatuses,
  recordModelStatus,
  recordModelStatusUnknown,
  startModelStatusRun,
  type PersistedModelStatus,
} from './model-status';

type ModelStatusCheckOptions = {
  concurrency?: number;
  excludeModelIds?: Iterable<string>;
  force?: boolean;
  limit?: number;
  maxRuntimeMs?: number;
  finalizeUnknown?: boolean;
  provider?: ProviderId;
  providerDelayMs?: number;
  slowRetryConcurrency?: number;
  slowRetryTimeoutMs?: number;
  softFailureThreshold?: number;
  staleAfterMs?: number;
  status?: RuntimeModelStatus;
  timeoutMs?: number;
  trigger?: string;
};

type CheckedModelResult = {
  modelId: string;
  provider: ProviderId;
  ok: boolean;
  outcome: RuntimeModelStatus;
  latencyMs: number;
  status?: number;
  error?: string;
  attempts: number;
  retried?: boolean;
  softFailure?: boolean;
};

type RetryCandidate = {
  model: ProviderModel;
  latencyMs: number;
  status?: number;
  error?: string;
};

type ProbeBatchResult = {
  results: CheckedModelResult[];
  retryCandidates: RetryCandidate[];
};

type ModelStatusCheckSummary = {
  checkableCount: number;
  checkedCount: number;
  dueCount: number;
  workingCount: number;
  failingCount: number;
  unknownCount: number;
  retryCount: number;
  softFailureCount: number;
  remainingDueCount: number;
  selectedCount: number;
  skippedCount: number;
  stoppedByBudget: boolean;
  results: CheckedModelResult[];
};

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_RUNTIME_MS = 240000;
const DEFAULT_PROVIDER_DELAY_MS = 2100;
const DEFAULT_SLOW_RETRY_CONCURRENCY = 3;
const DEFAULT_SLOW_RETRY_TIMEOUT_MS = 20000;
const DEFAULT_SOFT_FAILURE_THRESHOLD = 3;
const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_STALE_AFTER_MS = 20 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Status probe timed out.';
  }

  return error instanceof Error ? error.message : 'Status probe failed.';
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof Error && error.name === 'AbortError') {
    return 408;
  }

  return error instanceof OpenProviderError ? error.status : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isSoftProbeStatus(status: number | undefined): boolean {
  return status !== undefined && [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function isCredentialProbeStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

function normalizedErrorText(message: string | undefined): string {
  return (message ?? '').replace(/\s+/g, ' ').trim();
}

function providerDisplayName(provider: ProviderId): string {
  const knownNames: Partial<Record<ProviderId, string>> = {
    apifreellm: 'ApiFreeLLM',
    atxp: 'ATXP',
    cerbes: 'Cerebras',
    cloudflare: 'Cloudflare',
    cohere: 'Cohere',
    freemodel: 'FreeModel',
    google: 'Google AI Studio',
    groq: 'Groq',
    huggingface: 'Hugging Face',
    llm7: 'LLM7.io',
    llmgateway: 'LLMGateway',
    mistral: 'Mistral',
    nvidia: 'NVIDIA',
    ollama: 'Ollama',
    openprovider: 'OpenProvider',
    openrouter: 'OpenRouter',
    pollinations: 'Pollinations.ai',
    puter: 'Puter',
    routeway: 'Routeway',
    sambanova: 'SambaNova Cloud',
    siliconflow: 'SiliconFlow',
    zai: 'Z.AI',
    zenmux: 'ZenMux',
  };

  if (knownNames[provider]) {
    return knownNames[provider];
  }

  return provider
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isSoftProbeError(error: unknown): boolean {
  return isAbortError(error) || isSoftProbeStatus(errorStatus(error));
}

function statusProbeRouteLabel(model: ProviderModel): string {
  const category = categorizeModel(model);
  if (category === 'image') return 'image generation route';
  if (category === 'vision') return 'image-to-text route';
  if (category === 'audio') return 'text-to-speech route';
  return 'chat completions route';
}

function errorContains(message: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message));
}

function isHardModelFailureMessage(message: string): boolean {
  return errorContains(message, [
    /\binvalid model(?: id)?\b/i,
    /\bunknown model\b/i,
    /\bmodel\b.*\b(?:not found|not available|not callable|does not exist|deprecated|retired|removed)\b/i,
    /\blisted in the provider catalog but is not callable\b/i,
    /\bprovider has removed\/deprecated\b/i,
    /\bnot available through this gateway\b/i,
    /\bplease use a supported model\b/i,
    /\bdoes not support (?:the )?(?:chat_completions|chat completions|chat completion|image-to-text|text-to-speech|audio\/speech|images\/generations)\b/i,
    /\buse any of:\s*responses\b/i,
  ]);
}

function isQuotaOrBillingMessage(message: string): boolean {
  return errorContains(message, [
    /\brate limit\b/i,
    /\bquota\b/i,
    /\bfree-models-per-day\b/i,
    /\bcredits?\b/i,
    /\bbilling\b/i,
    /\bpaid plan\b/i,
    /\bpayment required\b/i,
    /\btemporarily overloaded\b/i,
    /\btry again later\b/i,
  ]);
}

function isImplementationGapMessage(message: string): boolean {
  return errorContains(message, [
    /\bnot implemented yet\b/i,
    /\brequires voice_id\b/i,
    /\brequires voiceId\b/i,
    /\brequires voice\b/i,
    /\bref_audio\b/i,
  ]);
}

function isEmptyProbeMessage(message: string): boolean {
  return errorContains(message, [
    /\bempty status probe\b/i,
    /\bempty response\b/i,
    /\bwithout visible probe output\b/i,
    /\bdid not contain visible text\b/i,
  ]);
}

function isTimeoutMessage(message: string): boolean {
  return /\btimed out\b/i.test(message);
}

type ClassifiedProbeFailure = {
  error: string;
  outcome: RuntimeModelStatus;
  softFailure: boolean;
};

function classifyProbeFailure(
  model: ProviderModel,
  candidate: Pick<RetryCandidate, 'status' | 'error'>,
  softFailure: boolean
): ClassifiedProbeFailure {
  const status = candidate.status;
  const rawError = normalizedErrorText(candidate.error) || 'Status probe failed.';
  const provider = providerDisplayName(model.provider);
  const route = statusProbeRouteLabel(model);
  const statusSuffix = status ? ` (HTTP ${status})` : '';

  if (status === 402 || status === 429 || isQuotaOrBillingMessage(rawError)) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `${provider} quota, rate limit, or credits blocked the status probe for ${model.name}${statusSuffix}. The model was not marked failing; retry after quota resets or add provider credits.`,
    };
  }

  if (isCredentialProbeStatus(status)) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `${provider} rejected the configured API key or this key cannot access ${model.name}${statusSuffix}. Refresh the provider key, then retest this model.`,
    };
  }

  if (status === 408 || isTimeoutMessage(rawError)) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `${provider} did not return output before the status timeout for ${model.name}. The probe is inconclusive; retry with a longer timeout before marking the model unavailable.`,
    };
  }

  if (status === 501 || isImplementationGapMessage(rawError)) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `OpenProvider cannot confirm ${model.name} yet because the ${route} needs provider-specific support or required parameters. Original probe error: ${rawError}`,
    };
  }

  if (isEmptyProbeMessage(rawError)) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `${provider} returned a response without visible probe output for ${model.name}. Leave this as needs review until a manual prompt confirms the route.`,
    };
  }

  if (isHardModelFailureMessage(rawError)) {
    return {
      outcome: 'failing',
      softFailure: false,
      error: `${provider} reports ${model.name} is not callable through the OpenProvider ${route}${statusSuffix}. ${rawError}`,
    };
  }

  if (status === 404 || status === 410) {
    return {
      outcome: 'failing',
      softFailure: false,
      error: `${provider} reports ${model.name} is removed, unavailable, or not callable through the OpenProvider ${route}${statusSuffix}.`,
    };
  }

  if (softFailure || (status !== undefined && [409, 425, 429, 500, 502, 503, 504].includes(status))) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `${provider} returned a transient status while probing ${model.name}${statusSuffix}. Original probe error: ${rawError}`,
    };
  }

  if (status === 400) {
    return {
      outcome: 'unknown',
      softFailure: true,
      error: `${provider} rejected the status probe payload for ${model.name}${statusSuffix}. This needs route payload review before the model can be called failing. Original probe error: ${rawError}`,
    };
  }

  return {
    outcome: 'unknown',
    softFailure: true,
    error: `${provider} status probe for ${model.name} was inconclusive${statusSuffix}. Original probe error: ${rawError}`,
  };
}

function extractChoiceText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message;
  const delta = choice?.delta;
  const content = message?.content ?? delta?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') {
        return part;
      }

      if (!part || typeof part !== 'object') {
        return '';
      }

      return typeof part.text === 'string'
        ? part.text
        : typeof part.content === 'string'
          ? part.content
          : '';
    }).filter(Boolean).join('\n');
  }

  const candidates = [
    message?.text,
    message?.output_text,
    delta?.text,
    delta?.output_text,
    choice?.text,
    payload?.output_text,
    payload?.text,
  ];

  return candidates.find((value): value is string => typeof value === 'string') ?? '';
}

function extractChoiceReasoning(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message;
  const delta = choice?.delta;
  const reasoning = message?.reasoning_content
    ?? message?.reasoningContent
    ?? message?.reasoning
    ?? message?.thinking
    ?? delta?.reasoning_content
    ?? delta?.reasoningContent
    ?? delta?.reasoning
    ?? delta?.thinking;

  return typeof reasoning === 'string' ? reasoning : '';
}

function hasCompletionChoice(payload: any): boolean {
  return Array.isArray(payload?.choices) && payload.choices.length > 0;
}

function isProviderGeneratedFailure(model: ProviderModel, text: string): boolean {
  if (model.provider !== 'llm7') {
    return false;
  }

  return /^\s*(?:error:\s*)?failed to process request after multiple attempts\.?\s*(?:try again later\.?)?\s*$/i
    .test(text);
}

function checkedAtMs(status?: PersistedModelStatus): number {
  const value = status?.checkedAt?.getTime();
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function persistedStatus(status?: PersistedModelStatus): RuntimeModelStatus {
  const value = status?.status;
  return value === 'working' || value === 'failing' ? value : 'unknown';
}

function statusSortRank(status?: PersistedModelStatus): number {
  const value = persistedStatus(status);
  if (value === 'unknown') return 0;
  if (value === 'failing') return 1;
  return 2;
}

function shouldCheckModel(
  model: ProviderModel,
  status: PersistedModelStatus | undefined,
  options: Required<Pick<ModelStatusCheckOptions, 'force' | 'staleAfterMs'>>
): boolean {
  if (options.force) {
    return true;
  }

  return Date.now() - checkedAtMs(status) >= options.staleAfterMs;
}

function checkableModels(
  models: ProviderModel[],
  config: OpenProviderConfig,
  provider?: ProviderId
): ProviderModel[] {
  return models
    .filter(model => model.enabled && model.free && isModelCategory(categorizeModel(model)))
    .filter(model => !provider || model.provider === provider)
    .filter(model => config.providers[model.provider]?.enabled);
}

function sortByOldestStatus(
  models: ProviderModel[],
  statuses: Map<string, PersistedModelStatus>
): ProviderModel[] {
  return [...models].sort((left, right) => {
    const leftStatus = statuses.get(left.id.toLowerCase());
    const rightStatus = statuses.get(right.id.toLowerCase());

    return (
      statusSortRank(leftStatus) - statusSortRank(rightStatus) ||
      checkedAtMs(leftStatus) - checkedAtMs(rightStatus)
    );
  });
}

function interleaveProvidersByStatusAge(
  models: ProviderModel[],
  statuses: Map<string, PersistedModelStatus>
): ProviderModel[] {
  const groups = new Map<ProviderId, ProviderModel[]>();

  for (const model of models) {
    groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  }

  const orderedGroups = [...groups.entries()]
    .map(([, providerModels]) => ({
      models: sortByOldestStatus(providerModels, statuses),
    }))
    .sort((left, right) => {
      const leftStatus = statuses.get(left.models[0]?.id.toLowerCase() ?? '');
      const rightStatus = statuses.get(right.models[0]?.id.toLowerCase() ?? '');

      return (
        statusSortRank(leftStatus) - statusSortRank(rightStatus) ||
        checkedAtMs(leftStatus) - checkedAtMs(rightStatus)
      );
    });

  const interleaved: ProviderModel[] = [];
  let added = true;

  while (added) {
    added = false;

    for (const group of orderedGroups) {
      const next = group.models.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  return interleaved;
}

function selectModelsForStatusCheck(
  models: ProviderModel[],
  statuses: Map<string, PersistedModelStatus>,
  config: OpenProviderConfig,
  options: Required<Pick<ModelStatusCheckOptions, 'force' | 'staleAfterMs'>> & Pick<ModelStatusCheckOptions, 'excludeModelIds' | 'limit' | 'provider' | 'status'>
) {
  const excludedModelIds = options.excludeModelIds ? [...options.excludeModelIds] : [];
  const excluded = new Set(excludedModelIds.map(modelId => modelId.trim().toLowerCase()).filter(Boolean));
  const checkable = checkableModels(models, config, options.provider)
    .filter(model => !excluded.has(model.id.toLowerCase()))
    .filter(model => !options.status || persistedStatus(statuses.get(model.id.toLowerCase())) === options.status);
  const due = checkable.filter(model => shouldCheckModel(model, statuses.get(model.id.toLowerCase()), options));
  const candidates = interleaveProvidersByStatusAge(due, statuses);
  const selected = typeof options.limit === 'number' && options.limit > 0 ? candidates.slice(0, options.limit) : candidates;

  return {
    checkable,
    due,
    selected,
  };
}

type ProbeModelOptions = {
  attempts?: number;
  recordSoftFailure?: boolean;
  finalizeUnknown: boolean;
  retried?: boolean;
  softFailureThreshold: number;
};

const STATUS_PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function abortError(): Error {
  const error = new Error('Status probe timed out.');
  error.name = 'AbortError';
  return error;
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw abortError();
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

async function probeModelRoute(
  config: OpenProviderConfig,
  model: ProviderModel,
  signal: AbortSignal
): Promise<{ status?: number }> {
  const category = categorizeModel(model);

  if (category === 'image') {
    await abortable(
      generateProviderImage(config, model, {
        prompt: 'A tiny blue square.',
        n: 1,
        size: '256x256',
        steps: 1,
        response_format: 'b64_json',
      }),
      signal
    );

    return {};
  }

  if (category === 'audio') {
    await abortable(
      synthesizeProviderSpeech(config, model, {
        input: 'OK.',
        response_format: 'mp3',
      }),
      signal
    );

    return {};
  }

  if (category === 'vision') {
    await abortable(
      generateProviderImageToText(config, model, {
        image: STATUS_PROBE_IMAGE,
        prompt: 'Reply exactly with OK.',
        max_tokens: 8,
      }),
      signal
    );

    return {};
  }

  const response = await sendProviderChatCompletion(
    config,
    model,
    {
      messages: [
        {
          role: 'user',
          content: 'Say OK.',
        },
      ],
      model: model.modelId,
      temperature: 0,
      max_tokens: 96,
      stream: false,
    },
    { signal }
  );
  const payload = await response.json();
  const text = extractChoiceText(payload).trim();
  const reasoning = extractChoiceReasoning(payload).trim();
  const hasChoice = hasCompletionChoice(payload);

  if (!text && !reasoning && !hasChoice) {
    throw new OpenProviderError(`${model.provider} returned an empty status probe.`, 502);
  }

  if (text && isProviderGeneratedFailure(model, text)) {
    throw new OpenProviderError(`${model.provider} returned an upstream model failure during status probe.`, 502);
  }

  return { status: response.status };
}

async function recordClassifiedProbeFailure(
  model: ProviderModel,
  candidate: Pick<RetryCandidate, 'latencyMs' | 'status' | 'error'>,
  attempts: number,
  retried = false,
  softFailure = false
): Promise<CheckedModelResult> {
  const classification = classifyProbeFailure(model, candidate, softFailure);
  const error = classification.error;

  if (classification.outcome === 'unknown') {
    markModelUnknown(model.id, error, candidate.latencyMs);
    await recordModelStatusUnknown(model, {
      latencyMs: candidate.latencyMs,
      httpStatus: candidate.status,
      error,
      checkedAt: new Date(),
    });

    return {
      modelId: model.id,
      provider: model.provider,
      ok: false,
      outcome: 'unknown',
      latencyMs: candidate.latencyMs,
      status: candidate.status,
      error,
      attempts,
      retried,
      softFailure: classification.softFailure,
    };
  }

  markModelFailing(model.id, error, candidate.latencyMs);
  await recordModelStatus(model, {
    ok: false,
    latencyMs: candidate.latencyMs,
    httpStatus: candidate.status,
    error,
    checkedAt: new Date(),
    softFailure,
    softFailureThreshold: 1,
  });

  return {
    modelId: model.id,
    provider: model.provider,
    ok: false,
    outcome: 'failing',
    latencyMs: candidate.latencyMs,
    status: candidate.status,
    error,
    attempts,
    retried,
    softFailure,
  };
}

async function recordSoftProbeFailure(
  model: ProviderModel,
  candidate: Pick<RetryCandidate, 'latencyMs' | 'status' | 'error'>,
  attempts: number,
  retried = false,
  finalizeUnknown = false
): Promise<CheckedModelResult> {
  if (finalizeUnknown) {
    return recordClassifiedProbeFailure(model, candidate, attempts, retried, true);
  }

  const classification = classifyProbeFailure(model, candidate, true);
  await recordModelStatusUnknown(model, {
    latencyMs: candidate.latencyMs,
    httpStatus: candidate.status,
    error: classification.error,
    checkedAt: new Date(),
  });
  markModelUnknown(model.id, classification.error, candidate.latencyMs);

  return {
    modelId: model.id,
    provider: model.provider,
    ok: false,
    outcome: 'unknown',
    latencyMs: candidate.latencyMs,
    status: candidate.status,
    error: classification.error,
    attempts,
    retried,
    softFailure: true,
  };
}

async function probeModel(
  config: OpenProviderConfig,
  model: ProviderModel,
  timeoutMs: number,
  options: ProbeModelOptions
): Promise<CheckedModelResult | RetryCandidate> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await probeModelRoute(config, model, controller.signal);

    const latencyMs = Date.now() - startedAt;
    markModelWorking(model.id, latencyMs);
    await recordModelStatus(model, {
      ok: true,
      latencyMs,
      httpStatus: response.status,
      checkedAt: new Date(),
    });

    return {
      modelId: model.id,
      provider: model.provider,
      ok: true,
      outcome: 'working',
      latencyMs,
      status: response.status,
      attempts: options.attempts ?? 1,
      retried: options.retried,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = errorMessage(error);
    const status = errorStatus(error);
    const softFailure = isSoftProbeError(error);

    if (isCredentialProbeStatus(status)) {
      return recordClassifiedProbeFailure(
        model,
        { latencyMs, status, error: message },
        options.attempts ?? 1,
        options.retried,
        true
      );
    }

    if (softFailure && !options.recordSoftFailure) {
      return {
        model,
        latencyMs,
        status,
        error: message,
      };
    }

    if (softFailure) {
      return recordSoftProbeFailure(
        model,
        { latencyMs, status, error: message },
        options.attempts ?? 1,
        options.retried,
        options.finalizeUnknown
      );
    }

    return recordClassifiedProbeFailure(
      model,
      { latencyMs, status, error: message },
      options.attempts ?? 1,
      options.retried,
      false
    );
  } finally {
    clearTimeout(timeout);
  }
}

function createProviderPacer(providerDelayMs: number): (provider: ProviderId) => Promise<void> {
  if (providerDelayMs <= 0) {
    return async () => {};
  }

  const nextAllowedAt = new Map<ProviderId, number>();
  const queues = new Map<ProviderId, Promise<void>>();

  return async (provider: ProviderId) => {
    const prior = queues.get(provider) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    queues.set(provider, prior.then(() => current));

    await prior;

    const waitMs = Math.max(0, (nextAllowedAt.get(provider) ?? 0) - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    nextAllowedAt.set(provider, Date.now() + providerDelayMs);
    release();
  };
}

async function probeSelectedModels(
  config: OpenProviderConfig,
  models: ProviderModel[],
  timeoutMs: number,
  providerDelayMs: number,
  concurrency: number,
  shouldStartNextProbe: () => boolean,
  options: ProbeModelOptions
): Promise<ProbeBatchResult> {
  const results: CheckedModelResult[] = [];
  const retryCandidates: RetryCandidate[] = [];
  const waitForProviderSlot = createProviderPacer(providerDelayMs);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < models.length) {
      if (!shouldStartNextProbe()) {
        break;
      }

      const model = models[nextIndex];
      nextIndex += 1;

      await waitForProviderSlot(model.provider);
      if (!shouldStartNextProbe()) {
        break;
      }

      const result = await probeModel(config, model, timeoutMs, options);
      if ('model' in result) {
        retryCandidates.push(result);
      } else {
        results.push(result);
      }
      await sleep(30);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, models.length) }, () => runWorker())
  );

  return { results, retryCandidates };
}

export async function runModelStatusChecks(
  config: OpenProviderConfig,
  models: ProviderModel[],
  options: ModelStatusCheckOptions = {}
): Promise<ModelStatusCheckSummary> {
  const normalizedOptions = {
    concurrency: Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY),
    force: options.force ?? false,
    finalizeUnknown: options.finalizeUnknown ?? false,
    maxRuntimeMs: Math.max(1000, options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS),
    providerDelayMs: Math.max(0, options.providerDelayMs ?? DEFAULT_PROVIDER_DELAY_MS),
    slowRetryConcurrency: Math.max(1, options.slowRetryConcurrency ?? DEFAULT_SLOW_RETRY_CONCURRENCY),
    slowRetryTimeoutMs: Math.max(1000, options.slowRetryTimeoutMs ?? DEFAULT_SLOW_RETRY_TIMEOUT_MS),
    softFailureThreshold: Math.max(1, options.softFailureThreshold ?? DEFAULT_SOFT_FAILURE_THRESHOLD),
    staleAfterMs: options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
    timeoutMs: Math.max(1000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    trigger: options.trigger ?? 'manual',
  };
  const statuses = await hydratePersistedModelStatuses(models.map(model => model.id));
  const selection = selectModelsForStatusCheck(models, statuses, config, {
    force: normalizedOptions.force,
    excludeModelIds: options.excludeModelIds,
    limit: options.limit,
    provider: options.provider,
    staleAfterMs: normalizedOptions.staleAfterMs,
    status: options.status,
  });
  const selectedModels = selection.selected;
  const runId = await startModelStatusRun(normalizedOptions.trigger, options.provider ?? null);
  const deadline = Date.now() + normalizedOptions.maxRuntimeMs;
  const shouldStartNextProbe = () => Date.now() < deadline;

  try {
    const firstPass = await probeSelectedModels(
      config,
      selectedModels,
      normalizedOptions.timeoutMs,
      normalizedOptions.providerDelayMs,
      normalizedOptions.concurrency,
      shouldStartNextProbe,
      {
        attempts: 1,
        finalizeUnknown: normalizedOptions.finalizeUnknown,
        recordSoftFailure: false,
        softFailureThreshold: normalizedOptions.softFailureThreshold,
      }
    );
    const results = [...firstPass.results];
    let retryCount = 0;

    if (firstPass.retryCandidates.length > 0) {
      const retryModels = firstPass.retryCandidates.map(candidate => candidate.model);
      const retryPass = await probeSelectedModels(
        config,
        retryModels,
        normalizedOptions.slowRetryTimeoutMs,
        normalizedOptions.providerDelayMs,
        normalizedOptions.slowRetryConcurrency,
        shouldStartNextProbe,
        {
          attempts: 2,
          finalizeUnknown: normalizedOptions.finalizeUnknown,
          recordSoftFailure: true,
          retried: true,
          softFailureThreshold: normalizedOptions.softFailureThreshold,
        }
      );
      retryCount = retryPass.results.length + retryPass.retryCandidates.length;
      results.push(...retryPass.results);

      if (retryPass.retryCandidates.length > 0) {
        for (const candidate of retryPass.retryCandidates) {
          results.push(await recordSoftProbeFailure(
            candidate.model,
            candidate,
            2,
            true,
            normalizedOptions.finalizeUnknown
          ));
        }
      }

      const retriedIds = new Set([
        ...retryPass.results.map(result => result.modelId.toLowerCase()),
        ...retryPass.retryCandidates.map(candidate => candidate.model.id.toLowerCase()),
      ]);
      const skippedRetryCandidates = firstPass.retryCandidates.filter(candidate => !retriedIds.has(candidate.model.id.toLowerCase()));
      for (const candidate of skippedRetryCandidates) {
        results.push(await recordSoftProbeFailure(
          candidate.model,
          candidate,
          1,
          false,
          normalizedOptions.finalizeUnknown
        ));
      }
    }

    const stoppedByBudget = !shouldStartNextProbe() || results.length < selectedModels.length;
    const summary = {
      checkableCount: selection.checkable.length,
      checkedCount: results.length,
      dueCount: selection.due.length,
      workingCount: results.filter(result => result.outcome === 'working').length,
      failingCount: results.filter(result => result.outcome === 'failing').length,
      unknownCount: results.filter(result => result.outcome === 'unknown').length,
      retryCount,
      softFailureCount: results.filter(result => result.softFailure).length,
      remainingDueCount: Math.max(0, selection.due.length - results.length),
      selectedCount: selectedModels.length,
      skippedCount: Math.max(0, selection.checkable.length - results.length),
      stoppedByBudget,
      results,
    };
    await finishModelStatusRun(runId, 'completed', summary);
    return summary;
  } catch (error) {
    await finishModelStatusRun(runId, 'failed', {
      checkableCount: selection.checkable.length,
      checkedCount: 0,
      dueCount: selection.due.length,
      workingCount: 0,
      failingCount: 0,
      unknownCount: 0,
      retryCount: 0,
      softFailureCount: 0,
      remainingDueCount: selectedModels.length,
      selectedCount: selectedModels.length,
      skippedCount: selectedModels.length,
      stoppedByBudget: false,
      errorMessage: errorMessage(error),
    });
    throw error;
  }
}
