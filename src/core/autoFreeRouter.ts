import type { ProviderModel } from './types';
import { isChatRouteModel } from './modelCategoryUtils';
import { getModelStatus, type ModelStatusSnapshot } from './modelStatus';

export const OPENPROVIDER_AUTO_FREE_MODEL_ID = 'openprovider/auto-free';
export const OPENPROVIDER_AUTO_FREE_MODEL_NAME = 'OpenProvider Auto Free';

const AUTO_MODEL_ALIASES = new Set([
  'auto',
  'auto/free',
  'openprovider/auto',
  'openprovider/auto-free',
  'openprovider/auto/free',
  'openprovider-auto-free',
]);

const PROVIDER_RELIABILITY: Record<string, number> = {
  openprovider: 118,
  groq: 102,
  cloudflare: 94,
  sambanova: 92,
  mistral: 90,
  cohere: 86,
  google: 85,
  openrouter: 84,
  freemodel: 74,
  zai: 82,
  nvidia: 78,
  cerbes: 74,
  routeway: 73,
  llmgateway: 73,
  atxp: 73,
  shuttleai: 62,
  zenmux: 72,
  siliconflow: 71,
  llm7: 70,
  ollama: 68,
  huggingface: 66,
  pollinations: 64,
  apifreellm: 58,
};

const FRESH_STATUS_MS = 30 * 60 * 60 * 1000;
const STALE_STATUS_MS = 72 * 60 * 60 * 1000;
const MIN_COMPLETION_BUFFER_TOKENS = 256;
const OPENPROVIDER_TRUST_BONUS = 420;
const LATEST_MODEL_ALIAS_SCORE = 145;
const MAX_MODEL_FRESHNESS_SCORE = 150;

const MODEL_GENERATION_PATTERNS: Array<{ pattern: RegExp; baseScore: number }> = [
  { pattern: /\bgpt[-_\s]?(\d+(?:[.-]\d+){0,2})(?:[a-z])?\b/gi, baseScore: 34 },
  { pattern: /\bgemini[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 44 },
  { pattern: /\bclaude(?:[-_\s]?(?:opus|sonnet|haiku))?[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 42 },
  { pattern: /\bgrok[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 42 },
  { pattern: /\bdeepseek[-_\s]?(?:v|r)?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 38 },
  { pattern: /\bqwen[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 38 },
  { pattern: /\bllama[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 38 },
  { pattern: /\b(?:glm|zai)[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 38 },
  { pattern: /\bnemotron[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 34 },
  { pattern: /\b(?:mistral|mixtral|codestral)[-_\s]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 32 },
  { pattern: /\bflux[.-]?(\d+(?:[.-]\d+){0,2})\b/gi, baseScore: 26 },
];

const MODEL_FRESHNESS_HINTS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\blatest\b/i, score: LATEST_MODEL_ALIAS_SCORE },
  { pattern: /\bgpt[-_\s]?oss\b/i, score: 124 },
  { pattern: /\bgpt[-_\s]?4o\b/i, score: 108 },
  { pattern: /\bo[1345](?:[-_\s]?mini)?\b/i, score: 96 },
  { pattern: /\bdeepseek[-_\s]?r1\b/i, score: 92 },
  { pattern: /\bqwq\b/i, score: 86 },
];

type ModelStrength = 'coding' | 'reasoning' | 'tools' | 'json' | 'creative' | 'vision' | 'long_context' | 'fast';
type ModelWeakness = 'slow' | 'verbose_reasoning' | 'weak_tools' | 'unstable';

type AutoFreeModelHint = {
  ids?: string[];
  patterns?: RegExp[];
  qualityScore: number;
  strengths?: ModelStrength[];
  weaknesses?: ModelWeakness[];
};

const AUTO_FREE_MODEL_HINTS: AutoFreeModelHint[] = [
  {
    ids: [
      'openprovider/deepseek-v4-flash-free',
      'openprovider/deepseek/deepseek-v4-flash-free',
      'openprovider/deepseek/deepseek-v4-flash:free',
    ],
    patterns: [/\bdeepseek[-_/:\s]?v4\b/i],
    qualityScore: 210,
    strengths: ['coding', 'reasoning', 'tools', 'json', 'fast'],
  },
  {
    patterns: [/\bqwen[-_/:\s]?3\b/i, /\bqwq\b/i],
    qualityScore: 190,
    strengths: ['coding', 'reasoning', 'tools', 'json'],
  },
  {
    patterns: [/\bdeepseek[-_/:\s]?v3\.?2\b/i, /\bdeepseek[-_/:\s]?r1\b/i],
    qualityScore: 175,
    strengths: ['coding', 'reasoning', 'json'],
  },
  {
    ids: ['openprovider/baidu/cobuddy-free', 'openprovider/baidu/cobuddy:free'],
    patterns: [/\bcobuddy\b/i],
    qualityScore: 180,
    strengths: ['coding', 'tools', 'json', 'fast'],
  },
  {
    ids: ['openprovider/minimax-m2.5-free'],
    patterns: [/\bminimax[-_/:\s]?m?2\.5\b/i],
    qualityScore: 165,
    strengths: ['reasoning', 'tools', 'json', 'creative', 'long_context'],
  },
  {
    ids: ['openprovider/stepfun/step-3.5-flash:free'],
    patterns: [/\bstep[-_/:\s]?3\.5[-_/:\s]?flash\b/i],
    qualityScore: 158,
    strengths: ['reasoning', 'tools', 'json', 'fast'],
  },
  {
    ids: ['openprovider/poolside/laguna-m.1:free'],
    patterns: [/\blaguna[-_/:\s]?m\.1\b/i],
    qualityScore: 154,
    strengths: ['coding', 'reasoning', 'tools', 'json'],
  },
  {
    ids: ['openprovider/poolside/laguna-xs.2:free'],
    patterns: [/\blaguna[-_/:\s]?xs\.2\b/i],
    qualityScore: 138,
    strengths: ['coding', 'tools', 'json', 'fast'],
  },
  {
    ids: ['openprovider/big-pickle'],
    patterns: [/\bbig[-_\s]?pickle\b/i],
    qualityScore: 132,
    strengths: ['reasoning', 'tools', 'json', 'long_context'],
  },
  {
    patterns: [/\bgemini\b/i],
    qualityScore: 145,
    strengths: ['vision', 'long_context', 'tools', 'fast'],
  },
  {
    patterns: [/\bgpt[-_\s]?oss[-_/:\s]?120b\b/i],
    qualityScore: 140,
    strengths: ['coding', 'reasoning', 'tools', 'json'],
  },
  {
    ids: [
      'openprovider/nemotron-3-super-free',
      'openprovider/nvidia/nemotron-3-super-120b-a12b:free',
    ],
    patterns: [/\bnemotron[-_/:\s]?3[-_/:\s]?super\b/i],
    qualityScore: 118,
    strengths: ['reasoning', 'tools', 'json', 'long_context'],
    weaknesses: ['slow', 'verbose_reasoning'],
  },
  {
    ids: ['openprovider/openrouter/owl-alpha'],
    patterns: [/\bowl[-_\s]?alpha\b/i],
    qualityScore: 96,
    strengths: ['tools', 'json', 'long_context'],
  },
  {
    ids: ['openprovider/x-ai/grok-code-fast-1:optimized:free'],
    patterns: [/\bgrok[-_/:\s]?code[-_/:\s]?fast\b/i],
    qualityScore: 52,
    strengths: ['coding', 'tools', 'fast'],
    weaknesses: ['unstable'],
  },
];

const AUTO_FREE_MODEL_HINTS_BY_ID = new Map<string, AutoFreeModelHint>(
  AUTO_FREE_MODEL_HINTS.flatMap(hint => (hint.ids ?? []).map(id => [id.toLowerCase(), hint]))
);

const AUTO_FREE_EXCLUDED_MODEL_PATTERNS = [
  /\bdeepseek\b/i,
];

type ChatLikeBody = {
  messages?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
  max_tokens?: unknown;
  maxTokens?: unknown;
  response_format?: unknown;
  thinking?: unknown;
  include_reasoning?: unknown;
  reasoning?: unknown;
  reasoning_effort?: unknown;
};

type TaskSignals = {
  code: boolean;
  reasoning: boolean;
  math: boolean;
  creative: boolean;
  data: boolean;
  extraction: boolean;
  multilingual: boolean;
  short: boolean;
  long: boolean;
};

type RequestProfile = {
  text: string;
  promptTokens: number;
  maxTokens: number;
  neededContext: number;
  needsTools: boolean;
  needsReasoning: boolean;
  needsVision: boolean;
  wantsJson: boolean;
  task: TaskSignals;
};

export function isOpenProviderAutoModel(model: unknown): boolean {
  if (typeof model !== 'string') {
    return false;
  }

  return AUTO_MODEL_ALIASES.has(model.trim().toLowerCase());
}

export function requestWantsOpenProviderReasoning(body: ChatLikeBody): boolean {
  if (body.thinking === true || body.include_reasoning === true || typeof body.reasoning_effort === 'string') {
    return true;
  }

  if (body.reasoning === true) {
    return true;
  }

  return Boolean(
    body.reasoning &&
    typeof body.reasoning === 'object' &&
    !Array.isArray(body.reasoning) &&
    (body.reasoning as Record<string, unknown>).exclude !== true
  );
}

function messageText(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return '';
  }

  return messages
    .map(message => {
      if (!message || typeof message !== 'object') {
        return '';
      }

      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string') {
        return content;
      }

      if (Array.isArray(content)) {
        return content
          .map(part => {
            if (typeof part === 'string') {
              return part;
            }

            if (part && typeof part === 'object') {
              const value = (part as Record<string, unknown>).text;
              return typeof value === 'string' ? value : '';
            }

            return '';
          })
          .join('\n');
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function contentHasImage(content: unknown): boolean {
  if (!content) {
    return false;
  }

  if (typeof content === 'object' && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    return (
      record.type === 'image_url' ||
      record.type === 'input_image' ||
      record.type === 'image' ||
      typeof record.image_url === 'string' ||
      typeof record.image === 'string'
    );
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some(part => {
    if (!part || typeof part !== 'object') {
      return false;
    }

    const record = part as Record<string, unknown>;
    return (
      record.type === 'image_url' ||
      record.type === 'input_image' ||
      record.type === 'image' ||
      typeof record.image_url === 'string' ||
      typeof record.image === 'string' ||
      (record.image_url !== null && typeof record.image_url === 'object')
    );
  });
}

function messagesHaveImage(messages: unknown): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some(message => (
    Boolean(message) &&
    typeof message === 'object' &&
    contentHasImage((message as Record<string, unknown>).content)
  ));
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function requestedMaxTokens(body: ChatLikeBody): number {
  const value = numericValue(body.max_tokens) ?? numericValue(body.maxTokens);
  return typeof value === 'number' && value > 0 ? value : 4096;
}

function hasTools(body: ChatLikeBody): boolean {
  return (
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    (body.tool_choice !== undefined && body.tool_choice !== null && body.tool_choice !== 'none')
  );
}

function wantsJson(body: ChatLikeBody, text: string): boolean {
  const responseFormat = body.response_format;
  if (responseFormat && typeof responseFormat === 'object' && !Array.isArray(responseFormat)) {
    const type = (responseFormat as Record<string, unknown>).type;
    if (type === 'json_object' || type === 'json_schema') {
      return true;
    }
  }

  return /\b(json|schema|structured output|valid object)\b/i.test(text);
}

function detectTask(text: string): TaskSignals {
  const normalized = text.toLowerCase();
  const trimmed = normalized.trim();
  const promptTokens = estimateTokens(text);

  return {
    code: /\b(code|coding|debug|bug|error|stack trace|typescript|javascript|python|react|next\.?js|sql|api|component|function|class|refactor|test|lint|compile|repo|repository)\b/.test(normalized),
    reasoning: /\b(reason|reasoning|analyze|analysis|compare|plan|architecture|design|prove|why|explain|strategy|evaluate|tradeoff|step by step)\b/.test(normalized),
    math: /\b(math|calculate|equation|probability|algebra|geometry|logic|proof|derive|solve)\b/.test(normalized),
    creative: /\b(write|story|poem|rewrite|tone|copy|blog|email|caption|creative|brainstorm)\b/.test(normalized),
    data: /\b(csv|table|dataset|extract|classify|summarize|parse|transform|json|schema|yaml|xml)\b/.test(normalized),
    extraction: /\b(extract|parse|convert|summarize|classify|label|entities|fields)\b/.test(normalized),
    multilingual: /\b(translate|translation|language|hindi|spanish|french|german|japanese|korean|chinese|arabic)\b/.test(normalized),
    short: trimmed.length > 0 && trimmed.length < 80 && !trimmed.includes('\n'),
    long: promptTokens > 6000,
  };
}

function buildRequestProfile(body: ChatLikeBody): RequestProfile {
  const text = messageText(body.messages);
  const promptTokens = estimateTokens(text);
  const maxTokens = requestedMaxTokens(body);

  return {
    text,
    promptTokens,
    maxTokens,
    neededContext: promptTokens + Math.min(maxTokens, 8192),
    needsTools: hasTools(body),
    needsReasoning: requestWantsOpenProviderReasoning(body),
    needsVision: messagesHaveImage(body.messages),
    wantsJson: wantsJson(body, text),
    task: detectTask(text),
  };
}

function includesAny(value: string, words: string[]): boolean {
  return words.some(word => value.includes(word));
}

function providerReliability(model: ProviderModel): number {
  return PROVIDER_RELIABILITY[model.provider] ?? 70;
}

function modelText(model: ProviderModel): string {
  return `${model.id} ${model.modelId} ${model.name} ${model.description ?? ''} ${(model.tags ?? []).join(' ')}`.toLowerCase();
}

function isAutoFreeExcludedModel(model: ProviderModel): boolean {
  const text = modelText(model);
  return AUTO_FREE_EXCLUDED_MODEL_PATTERNS.some(pattern => pattern.test(text));
}

function statusAgeMs(status: ModelStatusSnapshot): number | undefined {
  if (!status.checkedAt) {
    return undefined;
  }

  const checkedAt = new Date(status.checkedAt).getTime();
  return Number.isFinite(checkedAt) ? Date.now() - checkedAt : undefined;
}

function runtimeHealthScore(model: ProviderModel): number {
  const status = getModelStatus(model.id);
  const ageMs = statusAgeMs(status);
  const successes = status.successes ?? 0;
  const failures = status.failures ?? 0;
  const latencyMs = status.latencyMs;
  let score = Math.min(successes, 10) * 14 - Math.min(failures, 10) * 20;

  if (status.status === 'working') {
    if (ageMs === undefined || ageMs <= FRESH_STATUS_MS) {
      score += 340;
    } else if (ageMs <= STALE_STATUS_MS) {
      score += 190;
    } else {
      score += 80;
    }

    if (typeof latencyMs === 'number') {
      if (latencyMs <= 1500) score += 62;
      else if (latencyMs <= 3500) score += 42;
      else if (latencyMs <= 7000) score += 18;
      else if (latencyMs >= 15000) score -= 45;
    }
  }

  if (status.status === 'failing') {
    if (ageMs === undefined || ageMs <= FRESH_STATUS_MS) {
      score -= 520;
    } else if (ageMs <= STALE_STATUS_MS) {
      score -= 260;
    } else {
      score -= 100;
    }
  }

  return score;
}

function modelSupportsVision(model: ProviderModel): boolean {
  const modalities = [...(model.inputModalities ?? []), ...(model.outputModalities ?? [])].map(value => value.toLowerCase());
  if (modalities.some(value => ['image', 'vision', 'multimodal'].includes(value))) {
    return true;
  }

  return includesAny(modelText(model), ['vision', 'vl', 'gpt-4o', 'gemini', 'pixtral', 'llava']);
}

function capabilityFitScore(model: ProviderModel, profile: RequestProfile): number {
  let score = 0;

  if (profile.needsTools) {
    score += model.supportsTools ? 160 : -1000;
  } else if (model.supportsTools) {
    score += 8;
  }

  if (profile.needsReasoning) {
    score += model.supportsReasoning ? 150 : -1000;
  } else if (profile.task.reasoning || profile.task.math) {
    score += model.supportsReasoning ? 58 : 0;
  }

  if (profile.needsVision) {
    score += modelSupportsVision(model) ? 180 : -1000;
  }

  if (profile.wantsJson) {
    score += model.supportsTools ? 18 : 0;
  }

  return score;
}

function contextFitScore(model: ProviderModel, profile: RequestProfile): number {
  if (model.maxInputTokens <= 0) {
    return profile.task.long ? -56 : -4;
  }

  if (model.maxInputTokens < profile.promptTokens + MIN_COMPLETION_BUFFER_TOKENS) {
    return -900;
  }

  if (model.maxInputTokens < profile.neededContext) {
    return -150;
  }

  const headroom = model.maxInputTokens / Math.max(profile.neededContext, 1);
  return Math.min(96, Math.log2(headroom + 1) * 34);
}

function outputFitScore(model: ProviderModel, profile: RequestProfile): number {
  if (model.maxOutputTokens <= 0) {
    return 0;
  }

  let score = Math.min(38, Math.log2(model.maxOutputTokens / 1024 + 1) * 12);
  if (model.maxOutputTokens < profile.maxTokens) {
    score -= profile.maxTokens > 2048 ? 48 : 20;
  }

  return score;
}

function versionFreshnessScore(version: string, baseScore: number): number {
  const [major = 0, minor = 0, patch = 0] = version
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10))
    .filter(value => Number.isFinite(value));

  if (major <= 0 || major > 20) {
    return 0;
  }

  return Math.min(
    MAX_MODEL_FRESHNESS_SCORE,
    baseScore + major * 18 + minor * 9 + patch * 3
  );
}

function dateFreshnessScore(value: string): number {
  let best = 0;

  for (const match of value.matchAll(/\b(20(?:2[3-9]|3\d))[-_./\s]?(0[1-9]|1[0-2])?/g)) {
    const year = Number.parseInt(match[1] ?? '', 10);
    const month = Number.parseInt(match[2] ?? '1', 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      continue;
    }

    best = Math.max(best, Math.min(MAX_MODEL_FRESHNESS_SCORE, (year - 2022) * 30 + month * 2));
  }

  return best;
}

function modelFreshnessScore(model: ProviderModel): number {
  const text = modelText(model);
  let score = dateFreshnessScore(text);

  for (const hint of MODEL_FRESHNESS_HINTS) {
    if (hint.pattern.test(text)) {
      score = Math.max(score, hint.score);
    }
  }

  for (const { pattern, baseScore } of MODEL_GENERATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const version = match[1];
      if (version) {
        score = Math.max(score, versionFreshnessScore(version, baseScore));
      }
    }
  }

  return score;
}

function autoFreeModelHint(model: ProviderModel): AutoFreeModelHint | undefined {
  const modelKeys = [model.id, model.modelId].map(value => value.toLowerCase());
  for (const key of modelKeys) {
    const hint = AUTO_FREE_MODEL_HINTS_BY_ID.get(key);
    if (hint) {
      return hint;
    }
  }

  const text = modelText(model);
  return AUTO_FREE_MODEL_HINTS.find(hint => hint.patterns?.some(pattern => pattern.test(text)));
}

function hasStrength(hint: AutoFreeModelHint, strength: ModelStrength): boolean {
  return hint.strengths?.includes(strength) ?? false;
}

function hasWeakness(hint: AutoFreeModelHint, weakness: ModelWeakness): boolean {
  return hint.weaknesses?.includes(weakness) ?? false;
}

function modelHintScore(model: ProviderModel, profile: RequestProfile): number {
  const hint = autoFreeModelHint(model);
  if (!hint) {
    return 0;
  }

  const task = profile.task;
  let score = hint.qualityScore;

  if (task.code && hasStrength(hint, 'coding')) score += 36;
  if ((task.reasoning || task.math) && hasStrength(hint, 'reasoning')) score += 34;
  if ((task.data || task.extraction || profile.wantsJson) && hasStrength(hint, 'json')) score += 28;
  if (task.creative && hasStrength(hint, 'creative')) score += 22;
  if (profile.needsTools && hasStrength(hint, 'tools')) score += 28;
  if (profile.needsVision && hasStrength(hint, 'vision')) score += 36;
  if (task.long && hasStrength(hint, 'long_context')) score += 24;
  if (task.short && hasStrength(hint, 'fast')) score += 24;

  if (task.short && hasWeakness(hint, 'slow')) score -= 70;
  if (!profile.needsReasoning && hasWeakness(hint, 'verbose_reasoning')) score -= 48;
  if (profile.needsTools && hasWeakness(hint, 'weak_tools')) score -= 90;
  if (hasWeakness(hint, 'unstable')) score -= 70;

  return score;
}

function largestBillionParameterCount(value: string): number {
  const matches = [...value.matchAll(/(?:^|[-_/:\s])(\d+(?:\.\d+)?)\s*b(?:$|[-_/:\s])/gi)];
  return matches.reduce((largest, match) => Math.max(largest, Number.parseFloat(match[1] ?? '0')), 0);
}

function modelScaleScore(model: ProviderModel, profile: RequestProfile): number {
  const size = largestBillionParameterCount(modelText(model));
  if (!size) {
    return 0;
  }

  let score = 0;
  if (size >= 100) score += 36;
  else if (size >= 70) score += 31;
  else if (size >= 32) score += 24;
  else if (size >= 13) score += 16;
  else if (size >= 7) score += 8;
  else score += 3;

  if (profile.task.short && size >= 70) {
    score -= 18;
  }

  if ((profile.task.reasoning || profile.task.math || profile.task.code) && size >= 32) {
    score += 8;
  }

  return score;
}

function taskFitScore(model: ProviderModel, profile: RequestProfile): number {
  const text = modelText(model);
  const task = profile.task;
  let score = 0;

  if (task.code) {
    if (includesAny(text, ['coder', 'code', 'codestral', 'starcoder', 'qwen', 'deepseek', 'gpt-oss', 'compound'])) score += 64;
    if (includesAny(text, ['mini', 'flash', 'fast'])) score += task.short ? 16 : 6;
  }

  if (task.reasoning || task.math) {
    if (includesAny(text, ['reason', 'thinking', 'gpt-oss', 'qwen', 'deepseek', 'glm', 'nemotron', 'r1', 'qwq'])) score += 66;
    if (includesAny(text, ['120b', '70b', '49b', '32b', '405b'])) score += 14;
  }

  if (task.creative) {
    if (includesAny(text, ['llama', 'mixtral', 'mistral', 'qwen', 'command', 'aya', 'glm'])) score += 34;
  }

  if (task.data || task.extraction || profile.wantsJson) {
    if (includesAny(text, ['qwen', 'gpt', 'deepseek', 'command', 'glm', 'llama'])) score += 28;
    if (includesAny(text, ['instruct', 'chat'])) score += 10;
  }

  if (task.multilingual) {
    if (includesAny(text, ['aya', 'qwen', 'mistral', 'gemini', 'glm', 'llama'])) score += 30;
  }

  if (task.short) {
    if (includesAny(text, ['flash', 'mini', 'small', 'fast', '8b', '7b', '3b', '1b'])) score += 34;
    if (includesAny(text, ['405b', '120b', 'super'])) score -= 18;
  }

  return score;
}

function modelRiskScore(model: ProviderModel): number {
  const text = modelText(model);
  let score = 0;

  if (includesAny(text, ['deprecated', 'legacy', 'retiring', 'retired'])) score -= 80;
  if (includesAny(text, ['preview', 'experimental', 'beta'])) score -= 18;
  if (includesAny(text, ['free'])) score += 4;

  return score;
}

function trustedProviderScore(model: ProviderModel): number {
  return model.provider === 'openprovider' ? OPENPROVIDER_TRUST_BONUS : 0;
}

function stableTieBreakScore(model: ProviderModel): number {
  let hash = 0;
  for (const char of model.id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return (hash % 100) / 100;
}

function canSatisfyKnownHardRequirements(model: ProviderModel, profile: RequestProfile): boolean {
  if (!model.enabled || !model.free || !isChatRouteModel(model)) {
    return false;
  }

  if (profile.needsTools && !model.supportsTools) {
    return false;
  }

  if (profile.needsReasoning && !model.supportsReasoning) {
    return false;
  }

  if (profile.needsVision && !modelSupportsVision(model)) {
    return false;
  }

  return !(model.maxInputTokens > 0 && model.maxInputTokens < profile.promptTokens + MIN_COMPLETION_BUFFER_TOKENS);
}

function modelIsKnownFailing(model: ProviderModel): boolean {
  return getModelStatus(model.id).status === 'failing';
}

function isOpenProviderOwnedRoute(model: ProviderModel): boolean {
  return (
    model.provider === 'openprovider' ||
    model.id.toLowerCase().startsWith('openprovider/') ||
    model.modelId.toLowerCase().startsWith('openprovider/')
  );
}

function modelFamily(model: ProviderModel): string {
  const text = modelText(model);

  if (includesAny(text, ['deepseek'])) return 'deepseek';
  if (includesAny(text, ['qwen', 'qwq'])) return 'qwen';
  if (includesAny(text, ['llama'])) return 'llama';
  if (includesAny(text, ['mistral', 'mixtral', 'codestral'])) return 'mistral';
  if (includesAny(text, ['gemini'])) return 'gemini';
  if (includesAny(text, ['gpt-oss', 'gpt oss', 'openai', 'gpt-4o'])) return 'openai';
  if (includesAny(text, ['glm', 'zai'])) return 'glm';
  if (includesAny(text, ['nemotron'])) return 'nemotron';
  if (includesAny(text, ['command', 'aya', 'cohere'])) return 'cohere';

  return model.provider;
}

export function scoreOpenProviderChatModel(model: ProviderModel, body: ChatLikeBody): number {
  const profile = buildRequestProfile(body);

  return (
    runtimeHealthScore(model) +
    providerReliability(model) * 1.45 +
    Math.min(model.priority, 60) +
    modelHintScore(model, profile) +
    modelFreshnessScore(model) +
    capabilityFitScore(model, profile) +
    contextFitScore(model, profile) +
    outputFitScore(model, profile) +
    taskFitScore(model, profile) +
    modelScaleScore(model, profile) +
    modelRiskScore(model) +
    trustedProviderScore(model) +
    stableTieBreakScore(model)
  );
}

function diversifyRankedCandidates(ranked: ProviderModel[], limit: number): ProviderModel[] {
  const diversified: ProviderModel[] = [];
  const providerSlots = new Map<string, number>();
  const familySlots = new Map<string, number>();

  function push(model: ProviderModel, providerLimit: number, familyLimit: number): boolean {
    if (diversified.includes(model)) {
      return false;
    }

    const providerCount = providerSlots.get(model.provider) ?? 0;
    const family = modelFamily(model);
    const familyCount = familySlots.get(family) ?? 0;

    if (providerCount >= providerLimit || familyCount >= familyLimit) {
      return false;
    }

    providerSlots.set(model.provider, providerCount + 1);
    familySlots.set(family, familyCount + 1);
    diversified.push(model);

    return diversified.length >= limit;
  }

  for (const model of ranked) {
    if (push(model, 1, 1)) return diversified;
  }

  for (const model of ranked) {
    if (push(model, 2, 2)) return diversified;
  }

  for (const model of ranked) {
    if (push(model, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)) return diversified;
  }

  return diversified;
}

function rankCandidates(models: ProviderModel[], body: ChatLikeBody): ProviderModel[] {
  return models
    .map(model => ({ model, score: scoreOpenProviderChatModel(model, body) }))
    .sort((left, right) => right.score - left.score || left.model.name.localeCompare(right.model.name))
    .map(entry => entry.model);
}

export function rankOpenProviderAutoCandidates(
  models: ProviderModel[],
  body: ChatLikeBody,
  limit = 10
): ProviderModel[] {
  const profile = buildRequestProfile(body);
  const chatModels = models
    .filter(model => model.enabled && model.free && isChatRouteModel(model))
    .filter(model => !isAutoFreeExcludedModel(model));
  const hardRequirementPool = chatModels.filter(model => canSatisfyKnownHardRequirements(model, profile));
  const capablePool = hardRequirementPool.length > 0 ? hardRequirementPool : chatModels;
  const pool = capablePool;
  if (pool.length === 0) {
    return [];
  }
  const openProviderPool = pool.filter(isOpenProviderOwnedRoute);
  const readyOpenProviderPool = openProviderPool.filter(model => !modelIsKnownFailing(model));
  const retryOpenProviderPool = openProviderPool.filter(modelIsKnownFailing);
  const fallbackPool = pool.filter(model => !isOpenProviderOwnedRoute(model));
  const readyFallbackPool = fallbackPool.filter(model => !modelIsKnownFailing(model));
  const retryFallbackPool = fallbackPool.filter(modelIsKnownFailing);
  const rankedOpenProvider = rankCandidates(readyOpenProviderPool, body);
  const rankedFallback = diversifyRankedCandidates(rankCandidates(readyFallbackPool, body), limit);
  const rankedOpenProviderRetry = rankCandidates(retryOpenProviderPool, body);
  const rankedFallbackRetry = diversifyRankedCandidates(rankCandidates(retryFallbackPool, body), limit);

  return [...rankedOpenProvider, ...rankedFallback, ...rankedOpenProviderRetry, ...rankedFallbackRetry];
}
