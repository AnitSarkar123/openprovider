import { ModelCategory, ProviderId, ProviderModel, ProviderRouteFormat } from './types';

type JsonMap = Record<string, unknown>;

type FreeModelFilterOptions = {
  freeOnly?: boolean;
  category?: ModelCategory;
  routeBaseUrl?: string;
  routeFormat?: ProviderRouteFormat;
  routeUsesProviderAuth?: boolean;
  sourceApiUrl?: string;
  sourceCatalogUrl?: string;
  sourceFormat?: 'openai-compatible' | 'models-dev-provider' | 'atxp-chat-models';
};

const PROVIDER_PRIORITIES: Record<ProviderId, number> = {
  nvidia: 80,
  groq: 79,
  cloudflare: 78,
  sambanova: 77,
  siliconflow: 43,
  cohere: 76,
  mistral: 75,
  zai: 74,
  google: 73,
  openprovider: 90,
  openrouter: 65,
  freemodel: 44,
  puter: 43,
  shuttleai: 43,
  cerbes: 45,
  routeway: 44,
  llmgateway: 44,
  atxp: 44,
  zenmux: 43,
  llm7: 42,
  ollama: 41,
  huggingface: 40,
  pollinations: 39,
  apifreellm: 38,
};

const MODEL_COLLECTION_KEYS = [
  'data',
  'result',
  'models',
  'items',
  'results',
  'entries',
];

const PROVIDER_FREE_TIER_MODEL_POOLS = new Set<ProviderId>([
  'nvidia',
  'groq',
  'cloudflare',
  'siliconflow',
  'cohere',
  'mistral',
  'cerbes',
  'huggingface',
  'puter',
]);

const NVIDIA_HOSTED_CHAT_MODEL_IDS = new Set([
  'abacusai/dracarys-llama-3.1-70b-instruct',
  'bytedance/seed-oss-36b-instruct',
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'google/codegemma-7b',
  'google/gemma-2-2b-it',
  'google/gemma-7b',
  'meta/llama2-70b',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.2-1b-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.3-70b-instruct',
  'microsoft/phi-4-mini-instruct',
  'microsoft/phi-4-mini-flash-reasoning',
  'minimaxai/minimax-m2.5',
  'minimaxai/minimax-m2.7',
  'mistralai/magistral-small-2506',
  'mistralai/mistral-7b-instruct-v0.3',
  'mistralai/mistral-nemotron',
  'mistralai/mixtral-8x7b-instruct',
  'mistralai/mixtral-8x22b-instruct',
  'moonshotai/kimi-k2-instruct',
  'moonshotai/kimi-k2-thinking',
  'nvidia/llama-3.1-nemoguard-8b-content-safety',
  'nvidia/llama-3.1-nemoguard-8b-topic-control',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-content-safety-reasoning-4b',
  'nvidia/nemotron-mini-4b-instruct',
  'nvidia/nvidia-nemotron-nano-9b-v2',
  'nvidia/riva-translate-4b-instruct-v1_1',
  'nvidia/usdcode',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen2.5-coder-32b-instruct',
  'qwen/qwen3-5-122b-a10b',
  'qwen/qwen3-coder-480b-a35b-instruct',
  'qwen/qwen3-next-80b-a3b-instruct',
  'qwen/qwen3-next-80b-a3b-thinking',
  'qwen/qwq-32b',
  'sarvamai/sarvam-m',
  'stepfun-ai/step-3-5-flash',
  'stockmark/stockmark-2-100b-instruct',
  'upstage/solar-10.7b-instruct',
  'z-ai/glm4.7',
  'z-ai/glm5.1',
]);

const NON_CHAT_HINTS = [
  'audio',
  'asr',
  'bge-',
  'clip',
  'diffusion',
  'embed',
  'embedding',
  'image',
  'moderation',
  'rank',
  'rerank',
  'speech',
  'stable-diffusion',
  'transcribe',
  'tts',
  'vision-only',
];

const STRICT_NON_CHAT_HINTS = [
  'embed',
  'embedding',
  'rerank',
  'moderation',
  'llama-guard',
  'ocr',
  'tts',
  'asr',
  'transcribe',
];

const CHAT_HINTS = [
  'assistant',
  'chat',
  'code',
  'coder',
  'command',
  'deepseek',
  'gemini',
  'gemma',
  'gpt',
  'granite',
  'instruct',
  'llama',
  'mistral',
  'mixtral',
  'nemotron',
  'phi',
  'qwen',
];

function asRecord(value: unknown): JsonMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonMap;
}

function readPath(root: JsonMap, path: string[]): unknown {
  let cursor: unknown = root;

  for (const segment of path) {
    const record = asRecord(cursor);
    if (!record || !(segment in record)) {
      return undefined;
    }

    cursor = record[segment];
  }

  return cursor;
}

function readFirstString(root: JsonMap, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(root, path);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function readFirstPositiveNumber(root: JsonMap, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = readPath(root, path);

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return undefined;
}

function readBoolean(root: JsonMap, paths: string[][]): boolean | undefined {
  for (const path of paths) {
    const value = readPath(root, path);

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function extractModelId(raw: JsonMap): string | undefined {
  return readFirstString(raw, [
    ['id'],
    ['model'],
    ['model_id'],
    ['modelId'],
    ['name'],
  ]);
}

function looksLikeModelObject(raw: JsonMap): boolean {
  if (!extractModelId(raw)) {
    return false;
  }

  return (
    raw.object === 'model' ||
    'owned_by' in raw ||
    'ownedBy' in raw ||
    'provider' in raw ||
    'capabilities' in raw ||
    'description' in raw ||
    'displayName' in raw ||
    'display_name' in raw ||
    'supportedGenerationMethods' in raw ||
    'supported_generation_methods' in raw ||
    'architecture' in raw ||
    'pricing' in raw ||
    'plan' in raw ||
    'permission' in raw ||
    'context_length' in raw ||
    'max_context_length' in raw ||
    'endpoints' in raw ||
    'default_endpoints' in raw ||
    'features' in raw ||
    'task' in raw ||
    'tasks' in raw ||
    'details' in raw ||
    'digest' in raw ||
    'modified_at' in raw ||
    'size' in raw
  );
}

function extractModelObjects(payload: unknown): JsonMap[] {
  const queue: unknown[] = [payload];
  const result: JsonMap[] = [];
  let processed = 0;

  while (queue.length > 0 && processed < 5000) {
    const node = queue.shift();
    processed += 1;

    if (Array.isArray(node)) {
      for (const item of node) {
        queue.push(item);
      }
      continue;
    }

    const record = asRecord(node);
    if (!record) {
      continue;
    }

    if (looksLikeModelObject(record)) {
      result.push(record);
    }

    for (const key of MODEL_COLLECTION_KEYS) {
      if (key in record) {
        queue.push(record[key]);
      }
    }
  }

  return result;
}

function readStringCandidates(root: JsonMap, paths: string[][]): string[] {
  return paths
    .map(path => readPath(root, path))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());
}

function extractProviderModelId(raw: JsonMap, forcedProvider?: ProviderId): string | undefined {
  if (forcedProvider === 'google') {
    return extractModelId(raw)?.replace(/^models\//, '');
  }

  if (forcedProvider === 'atxp') {
    return stripAtxpCompanyPrefix(extractModelId(raw));
  }

  if (forcedProvider !== 'cloudflare') {
    return extractModelId(raw);
  }

  const candidates = readStringCandidates(raw, [
    ['model'],
    ['model_id'],
    ['modelId'],
    ['name'],
    ['id'],
    ['slug'],
  ]);
  const cloudflareModelId = candidates
    .map(value => {
      const markerIndex = value.indexOf('@cf/');
      if (markerIndex === -1) {
        return undefined;
      }

      return value.slice(markerIndex).split(/[\s"'?#]/)[0].replace(/[),.]+$/g, '');
    })
    .find((value): value is string => Boolean(value));

  return cloudflareModelId ?? extractModelId(raw);
}

function stripAtxpCompanyPrefix(modelId: string | undefined): string | undefined {
  const normalized = modelId?.trim();
  if (!normalized) {
    return undefined;
  }

  const [company, ...rest] = normalized.split('/');
  const unprefixed = !company || rest.length === 0 ? normalized : rest.join('/');

  return normalizeAtxpChatModelId(unprefixed);
}

function normalizeAtxpChatModelId(modelId: string): string {
  const normalized = modelId.trim().replace(/^~?anthropic\//i, '');

  if (/^claude-opus-(?:latest|4)$/i.test(normalized)) {
    return 'claude-opus-4-7';
  }

  if (/^claude-(?:opus|sonnet|haiku)-\d+\.\d+/i.test(normalized)) {
    return normalized.replace(/(\d+)\.(\d+)/, '$1-$2');
  }

  return normalized;
}

function prettyNameFromModelId(modelId: string): string {
  const claudeMatch = modelId.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-(\d{8}))?$/i);
  if (claudeMatch) {
    const [, family, major, minor, date] = claudeMatch;
    const familyName = family.charAt(0).toUpperCase() + family.slice(1).toLowerCase();
    return [
      'Claude',
      familyName,
      `${major}.${minor}`,
      date,
    ].filter(Boolean).join(' ');
  }

  return modelId
    .split(/[\/:_-]+/g)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function atxpPickerModelIds(payload: unknown): string[] {
  const direct = Array.isArray(payload) ? payload : undefined;
  const record = asRecord(payload);
  const nestedData = record ? asRecord(record.data) : undefined;
  const candidates = [
    direct,
    record?.ATXP,
    record?.atxp,
    record?.models,
    record?.data,
    nestedData?.ATXP,
    nestedData?.atxp,
  ];
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    for (const item of candidate) {
      if (typeof item !== 'string') {
        continue;
      }

      const modelId = item.trim().replace(/^models\//i, '');
      const key = modelId.toLowerCase();
      if (!modelId || seen.has(key)) {
        continue;
      }

      seen.add(key);
      ids.push(modelId);
    }
  }

  return ids;
}

function prettyAtxpModelName(modelId: string): string {
  const [, ...rest] = modelId.split('/');
  const displayId = rest.length > 0 ? rest.join('/') : modelId;

  return prettyNameFromModelId(normalizeAtxpChatModelId(displayId))
    .replace(/\bGpt\b/g, 'GPT')
    .replace(/\bO(\d+)\b/g, 'o$1')
    .replace(/\bAi\b/g, 'AI');
}

function parseAtxpChatPickerModelList(
  payload: unknown,
  provider: ProviderId,
  options: FreeModelFilterOptions = {}
): ProviderModel[] {
  if (provider !== 'atxp') {
    return [];
  }

  return atxpPickerModelIds(payload).map((modelId, index) => ({
    id: registryId(provider, modelId),
    modelId,
    name: prettyAtxpModelName(modelId),
    provider,
    routeBaseUrl: options.routeBaseUrl,
    routeFormat: options.routeFormat,
    routeUsesProviderAuth: options.routeUsesProviderAuth,
    category: 'text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    priority: PROVIDER_PRIORITIES[provider] - index / 100,
    enabled: true,
    maxInputTokens: 128000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsReasoning: false,
    free: true,
    freeReason: 'ATXP account starter/free credits',
    tags: ['atxp', 'text', 'dynamic', 'free'],
  }));
}

function inferProvider(raw: JsonMap, modelId: string): ProviderId | undefined {
  const providerText = [
    modelId,
    readFirstString(raw, [['provider']]),
    readFirstString(raw, [['owned_by']]),
    readFirstString(raw, [['ownedBy']]),
    readFirstString(raw, [['source']]),
    readFirstString(raw, [['metadata', 'provider']]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (providerText.includes('nvidia') || providerText.includes('nim') || providerText.includes('nemotron')) {
    return 'nvidia';
  }

  if (providerText.includes('cloudflare') || providerText.includes('@cf/')) {
    return 'cloudflare';
  }

  if (providerText.includes('groq')) {
    return 'groq';
  }

  if (providerText.includes('sambanova') || providerText.includes('samba nova') || providerText.includes('sambacloud') || providerText.includes('samba cloud')) {
    return 'sambanova';
  }

  if (providerText.includes('siliconflow') || providerText.includes('silicon flow') || providerText.includes('siliconcloud') || providerText.includes('silicon cloud')) {
    return 'siliconflow';
  }

  if (providerText.includes('cohere') || providerText.includes('command-r') || providerText.includes('command-a')) {
    return 'cohere';
  }

  if (providerText.includes('mistral') || providerText.includes('mixtral')) {
    return 'mistral';
  }

  if (providerText.includes('openrouter')) {
    return 'openrouter';
  }

  if (providerText.includes('freemodel') || providerText.includes('free model')) {
    return 'freemodel';
  }

  if (providerText.includes('puter')) {
    return 'puter';
  }

  if (providerText.includes('routeway')) {
    return 'routeway';
  }

  if (providerText.includes('shuttleai') || providerText.includes('shuttle ai')) {
    return 'shuttleai';
  }

  if (providerText.includes('llmgateway') || providerText.includes('llm gateway')) {
    return 'llmgateway';
  }

  if (providerText.includes('atxp')) {
    return 'atxp';
  }

  if (providerText.includes('apifreellm') || providerText.includes('api free llm')) {
    return 'apifreellm';
  }

  if (providerText.includes('z.ai') || providerText.includes('zai') || providerText.includes('zhipu') || providerText.includes('glm')) {
    return 'zai';
  }

  if (providerText.includes('cerbes')) {
    return 'cerbes';
  }

  if (providerText.includes('zenmux')) {
    return 'zenmux';
  }

  if (providerText.includes('llm7')) {
    return 'llm7';
  }

  if (providerText.includes('ollama')) {
    return 'ollama';
  }

  if (providerText.includes('huggingface') || providerText.includes('hugging face')) {
    return 'huggingface';
  }

  if (providerText.includes('pollinations')) {
    return 'pollinations';
  }

  return undefined;
}

function isLikelyNonChatModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  if (STRICT_NON_CHAT_HINTS.some(hint => normalized.includes(hint))) {
    return true;
  }

  const hasNonChatHint = NON_CHAT_HINTS.some(hint => normalized.includes(hint));
  const hasChatHint = CHAT_HINTS.some(hint => normalized.includes(hint));
  return hasNonChatHint && !hasChatHint;
}

function isNvidiaImageGenerationModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes('black-forest-labs/flux') ||
    normalized.includes('/flux.') ||
    normalized.includes('/flux-') ||
    normalized.includes('stable-diffusion') ||
    normalized.includes('stabilityai/') ||
    normalized.includes('sdxl') ||
    normalized.includes('text-to-image') ||
    normalized.includes('image-generation')
  );
}

function isOpenProviderRouterModel(raw: JsonMap, modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  const tokenizer = readFirstString(raw, [
    ['architecture', 'tokenizer'],
  ])?.toLowerCase();

  return normalized.endsWith('-auto/free') || normalized === 'openrouter/free' || tokenizer === 'router';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => typeof item === 'string' ? item.toLowerCase() : '')
    .filter(Boolean);
}

function modalityArray(raw: JsonMap, kind: 'input' | 'output'): string[] {
  const snake = `${kind}_modalities`;
  const camel = `${kind}Modalities`;
  return [
    ...stringArray(readPath(raw, [snake])),
    ...stringArray(readPath(raw, [camel])),
    ...stringArray(readPath(raw, ['architecture', snake])),
    ...stringArray(readPath(raw, ['architecture', camel])),
    ...stringArray(readPath(raw, ['modalities', kind])),
    ...stringArray(readPath(raw, ['modalities', kind, kind])),
  ];
}

function collectTaskHints(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim().toLowerCase()];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectTaskHints);
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return readStringCandidates(record, [
    ['name'],
    ['title'],
    ['label'],
    ['id'],
    ['slug'],
  ]).map(task => task.toLowerCase());
}

function isCloudflareNonChatTask(raw: JsonMap): boolean {
  const taskHints = [
    ...collectTaskHints(readPath(raw, ['task'])),
    ...collectTaskHints(readPath(raw, ['tasks'])),
    ...collectTaskHints(readPath(raw, ['task_name'])),
    ...collectTaskHints(readPath(raw, ['taskName'])),
  ];

  if (taskHints.length === 0) {
    return false;
  }

  return !taskHints.some(task => (
    task.includes('text generation') ||
    task.includes('text-generation') ||
    task.includes('chat')
  ));
}

function googleSupportsTextGeneration(raw: JsonMap): boolean {
  const methods = [
    ...stringArray(readPath(raw, ['supportedGenerationMethods'])),
    ...stringArray(readPath(raw, ['supported_generation_methods'])),
  ].map(method => method.toLowerCase());

  return methods.length === 0 || methods.includes('generatecontent');
}

function isImageGenerationTask(raw: JsonMap): boolean {
  const taskHints = [
    ...collectTaskHints(readPath(raw, ['task'])),
    ...collectTaskHints(readPath(raw, ['tasks'])),
    ...collectTaskHints(readPath(raw, ['task_name'])),
    ...collectTaskHints(readPath(raw, ['taskName'])),
  ];
  const outputModalities = modalityArray(raw, 'output');

  return (
    outputModalities.includes('image') ||
    taskHints.some(task => (
      task.includes('text-to-image') ||
      task.includes('text to image') ||
      task.includes('image generation') ||
      task.includes('generate image')
    ))
  );
}

function isTextToSpeechTask(raw: JsonMap, modelId: string): boolean {
  const taskHints = [
    ...collectTaskHints(readPath(raw, ['task'])),
    ...collectTaskHints(readPath(raw, ['tasks'])),
    ...collectTaskHints(readPath(raw, ['task_name'])),
    ...collectTaskHints(readPath(raw, ['taskName'])),
  ];
  const inputModalities = modalityArray(raw, 'input');
  const outputModalities = modalityArray(raw, 'output');
  const normalizedModelId = modelId.toLowerCase();
  const hasSpeechOutput = outputModalities.some(modality => (
    modality === 'speech' ||
    modality === 'audio' ||
    modality === 'wav' ||
    modality === 'mp3'
  ));
  const hasAudioInput = inputModalities.includes('audio') || inputModalities.includes('speech');

  return (
    (
      (hasSpeechOutput && !hasAudioInput) ||
      normalizedModelId.includes('tts') ||
      normalizedModelId.includes('text-to-speech') ||
      normalizedModelId.includes('melotts') ||
      normalizedModelId.includes('orpheus') ||
      normalizedModelId.includes('aura-') ||
      taskHints.some(task => (
        task.includes('text-to-speech') ||
        task.includes('text to speech') ||
        task.includes('speech synthesis') ||
        task.includes('tts')
      ))
    ) &&
    !isImageGenerationTask(raw)
  );
}

function isExplicitlyNonChatEndpointModel(raw: JsonMap): boolean {
  const endpointCollections = [
    stringArray(readPath(raw, ['endpoints'])),
    stringArray(readPath(raw, ['default_endpoints'])),
  ].filter(collection => collection.length > 0);

  if (endpointCollections.length === 0) {
    return false;
  }

  return endpointCollections.every(collection => !collection.some(endpoint => endpoint.includes('chat')));
}

function isImageToTextTask(raw: JsonMap, modelId: string): boolean {
  const taskHints = [
    ...collectTaskHints(readPath(raw, ['task'])),
    ...collectTaskHints(readPath(raw, ['tasks'])),
    ...collectTaskHints(readPath(raw, ['task_name'])),
    ...collectTaskHints(readPath(raw, ['taskName'])),
  ];
  const inputModalities = modalityArray(raw, 'input');
  const outputModalities = modalityArray(raw, 'output');
  const normalizedModelId = modelId.toLowerCase();
  const hasVisionHint = /(?:^|[\/:_-])vision(?:$|[\/:_-])/.test(normalizedModelId);
  const hasZaiVisionHint = /^glm-[a-z0-9.-]*v(?:[-.]|$)/.test(normalizedModelId);
  const hasTextOnlyOutput = (
    outputModalities.length === 0 ||
    (outputModalities.includes('text') && !outputModalities.includes('image') && !outputModalities.includes('audio'))
  );

  return (
    (
      (inputModalities.includes('image') && hasTextOnlyOutput) ||
      hasVisionHint ||
      hasZaiVisionHint ||
      normalizedModelId.includes('ocr') ||
      taskHints.some(task => (
        task.includes('image-to-text') ||
        task.includes('image to text') ||
        task.includes('optical character recognition') ||
        task.includes('ocr')
      ))
    ) &&
    !isImageGenerationTask(raw)
  );
}

function isChatModelForCategory(raw: JsonMap, modelId: string): boolean {
  if (isLikelyNonChatModel(modelId) || isExplicitlyNonChatEndpointModel(raw)) {
    return false;
  }

  const outputModalities = modalityArray(raw, 'output');
  if (outputModalities.some(modality => modality !== 'text')) {
    return false;
  }

  return !isImageGenerationTask(raw) && !isImageToTextTask(raw, modelId) && !isTextToSpeechTask(raw, modelId);
}

function containsFreeMarker(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes(':free') ||
    normalized.includes('(free)') ||
    normalized.includes('[free]') ||
    normalized.includes('/free') ||
    /\bfree\b/.test(normalized)
  );
}

function hasFreeMarker(raw: JsonMap, modelId: string): boolean {
  const candidates = [
    modelId,
    readFirstString(raw, [['name']]),
    readFirstString(raw, [['display_name']]),
    readFirstString(raw, [['displayName']]),
    readFirstString(raw, [['title']]),
    readFirstString(raw, [['canonical_slug']]),
  ];

  if (candidates.some(containsFreeMarker)) {
    return true;
  }

  const tags = readPath(raw, ['tags']);
  return Array.isArray(tags) && tags.some(containsFreeMarker);
}

function readPricingValues(raw: JsonMap): number[] | undefined {
  const pricing = asRecord(readPath(raw, ['pricing']));
  const pricings = asRecord(readPath(raw, ['pricings']));
  const cost = asRecord(readPath(raw, ['cost']));
  const costs = asRecord(readPath(raw, ['costs']));
  const pricingRoot = pricing ?? pricings ?? cost ?? costs;
  if (!pricingRoot) {
    return undefined;
  }

  const values: number[] = [];
  const queue = Object.values(pricingRoot);

  while (queue.length > 0) {
    const value = queue.shift();
    const number = readNumber(value);

    if (number !== undefined) {
      values.push(number);
      continue;
    }

    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }

    const record = asRecord(value);
    if (!record) {
      continue;
    }

    if ('value' in record) {
      const nestedValue = readNumber(record.value);
      if (nestedValue !== undefined) {
        values.push(nestedValue);
      }
      continue;
    }

    queue.push(...Object.values(record));
  }

  return values.length > 0 ? values : undefined;
}

function providerRecords(raw: JsonMap): JsonMap[] {
  const providers = readPath(raw, ['providers']);
  if (!Array.isArray(providers)) {
    return [];
  }

  return providers.map(asRecord).filter((provider): provider is JsonMap => Boolean(provider));
}

function liveProviderRecords(raw: JsonMap): JsonMap[] {
  const providers = providerRecords(raw);
  if (providers.length === 0) {
    return [];
  }

  const live = providers.filter(provider => {
    const status = readFirstString(provider, [['status']])?.toLowerCase();
    return !status || status === 'live' || status === 'available';
  });

  return live.length > 0 ? live : providers;
}

function providerPricingValues(raw: JsonMap): number[] {
  return liveProviderRecords(raw).flatMap(provider => {
    const pricing = readPricingValues(provider);
    return pricing ?? [];
  });
}

function isKnownFreeZaiModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return /^glm-[a-z0-9.-]*flash$/.test(normalized);
}

function normalizeGoogleModelId(modelId: string): string {
  return modelId.toLowerCase().replace(/^models\//, '');
}

function isKnownFreeGoogleModel(modelId: string): boolean {
  return normalizeGoogleModelId(modelId) === 'gemini-flash-latest';
}

function isKnownFreeSambanovaModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return new Set([
    'deepseek-v3.1',
    'meta-llama-3.3-70b-instruct',
    'gpt-oss-120b',
    'deepseek-v3.2',
    'llama-4-maverick-17b-128e-instruct',
  ]).has(normalized);
}

function isKnownFreeSiliconFlowModel(modelId: string): boolean {
  return modelId.toLowerCase() === 'tencent/hunyuan-mt-7b';
}

function isKnownNvidiaHostedChatModel(modelId: string): boolean {
  return NVIDIA_HOSTED_CHAT_MODEL_IDS.has(modelId.trim().toLowerCase());
}

function readTier(raw: JsonMap): string | undefined {
  return readFirstString(raw, [
    ['tier'],
    ['plan'],
    ['access'],
    ['metadata', 'tier'],
  ])?.toLowerCase();
}

function isOllamaCloudModel(raw: JsonMap, modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (normalized.endsWith(':cloud')) {
    return true;
  }

  const explicitCloud = readBoolean(raw, [
    ['cloud'],
    ['is_cloud'],
    ['isCloud'],
    ['metadata', 'cloud'],
    ['details', 'cloud'],
  ]);
  if (explicitCloud !== undefined) {
    return explicitCloud;
  }

  const tier = readTier(raw);
  return tier === 'cloud' || tier === 'free-cloud';
}

function isOllamaCloudCatalog(options: FreeModelFilterOptions): boolean {
  const source = options.sourceCatalogUrl ?? options.sourceApiUrl ?? options.routeBaseUrl;
  if (!source) {
    return false;
  }

  try {
    const url = new URL(source);
    return url.hostname === 'ollama.com' && url.pathname.startsWith('/api');
  } catch {
    return false;
  }
}

function normalizeOllamaCloudModelId(
  raw: JsonMap,
  modelId: string,
  options: FreeModelFilterOptions
): string | undefined {
  const normalized = modelId.trim();
  if (isOllamaCloudModel(raw, normalized)) {
    return normalized;
  }

  if (isOllamaCloudCatalog(options)) {
    return `${normalized}:cloud`;
  }

  return undefined;
}

function resolveFreeStatus(
  raw: JsonMap,
  provider: ProviderId,
  modelId: string
): { free: boolean; reason: string } {
  if (provider === 'openprovider') {
    const explicitFree = readBoolean(raw, [
      ['free'],
      ['is_free'],
      ['isFree'],
    ]);

    if (explicitFree !== undefined) {
      return {
        free: explicitFree,
        reason: explicitFree ? 'OpenProvider free route' : 'paid gateway model',
      };
    }
  }

  if (provider === 'llmgateway') {
    const explicitFree = readBoolean(raw, [
      ['free'],
      ['is_free'],
      ['isFree'],
    ]);

    if (explicitFree !== undefined) {
      return {
        free: explicitFree,
        reason: explicitFree ? 'LLMGateway free model' : 'LLMGateway paid or router model',
      };
    }
  }

  if (provider === 'shuttleai') {
    const tier = readTier(raw);
    const free = tier === 'free';

    return {
      free,
      reason: free ? 'ShuttleAI free plan model' : 'ShuttleAI paid plan model',
    };
  }

  if (hasFreeMarker(raw, modelId)) {
    return {
      free: true,
      reason: 'explicit free marker',
    };
  }

  if (provider === 'cloudflare') {
    return {
      free: true,
      reason: 'provider daily free allocation',
    };
  }

  if (provider === 'zai' && isKnownFreeZaiModel(modelId)) {
    return {
      free: true,
      reason: 'official free GLM Flash model',
    };
  }

  if (provider === 'google' && isKnownFreeGoogleModel(modelId)) {
    return {
      free: true,
      reason: 'tested Google AI Studio free API-key alias',
    };
  }

  if (provider === 'sambanova' && isKnownFreeSambanovaModel(modelId)) {
    return {
      free: true,
      reason: 'SambaNova Cloud free tier',
    };
  }

  if (provider === 'siliconflow' && modelId.toLowerCase().startsWith('pro/')) {
    return {
      free: false,
      reason: 'SiliconFlow Pro paid model',
    };
  }

  if (provider === 'siliconflow' && isKnownFreeSiliconFlowModel(modelId)) {
    return {
      free: true,
      reason: 'SiliconFlow zero-priced model',
    };
  }

  if (provider === 'llm7') {
    const tier = readTier(raw);
    const paidTier = tier && ['pro', 'paid', 'premium'].some(marker => tier.includes(marker));

    return {
      free: !paidTier,
      reason: paidTier ? 'LLM7 paid tier model' : 'LLM7 basic access model',
    };
  }

  if (provider === 'ollama') {
    return {
      free: true,
      reason: 'Ollama cloud API-key model',
    };
  }

  if (provider === 'pollinations') {
    const tier = readTier(raw);
    const normalizedModelId = modelId.toLowerCase();
    const anonymousFree = tier === 'anonymous' || tier === 'free' || normalizedModelId === 'openai-fast';

    return {
      free: anonymousFree,
      reason: anonymousFree ? 'Pollinations anonymous free tier' : 'requires Pollinations key or pollen credits',
    };
  }

  if (provider === 'atxp') {
    return {
      free: true,
      reason: 'ATXP account starter/free credits',
    };
  }

  if (provider === 'freemodel') {
    return {
      free: true,
      reason: 'FreeModel signup/free credits',
    };
  }

  if (provider === 'puter') {
    return {
      free: true,
      reason: 'Puter account-backed free access',
    };
  }

  const pricingValues = readPricingValues(raw);
  if (pricingValues) {
    const isFree = pricingValues.every(value => value === 0);
    return {
      free: isFree,
      reason: isFree ? 'zero provider pricing' : 'non-zero provider pricing',
    };
  }

  const nestedPricingValues = providerPricingValues(raw);
  if (nestedPricingValues.length > 0) {
    const isFree = nestedPricingValues.every(value => value === 0);
    return {
      free: isFree,
      reason: isFree ? 'zero provider pricing' : 'non-zero provider pricing',
    };
  }

  if (PROVIDER_FREE_TIER_MODEL_POOLS.has(provider)) {
    return {
      free: true,
      reason: 'provider free-tier pool',
    };
  }

  return {
    free: false,
    reason: 'no free signal',
  };
}

function resolveMaxInputTokens(raw: JsonMap): number {
  const directValue = readFirstPositiveNumber(raw, [
    ['max_input_tokens'],
    ['maxInputTokens'],
    ['context_length'],
    ['contextLength'],
    ['max_context_length'],
    ['maxContextLength'],
    ['context'],
    ['context_window', 'tokens'],
    ['contextWindow', 'tokens'],
    ['permission', 'context_length'],
    ['permission', 'contextLength'],
    ['permission', 'max_input_tokens'],
    ['permission', 'maxInputTokens'],
    ['context_window'],
    ['contextWindow'],
    ['properties', 'context_window'],
    ['properties', 'contextWindow'],
    ['properties', 'max_context_length'],
    ['properties', 'maxContextLength'],
    ['limit', 'context'],
    ['limit', 'input'],
    ['input_token_limit'],
    ['inputTokenLimit'],
    ['top_provider', 'context_length'],
    ['token_limits', 'input'],
    ['tokenLimits', 'input'],
    ['limits', 'input'],
  ]);
  const providerValue = Math.max(0, ...liveProviderRecords(raw).map(provider => readFirstPositiveNumber(provider, [
    ['context_length'],
    ['contextLength'],
    ['max_context_length'],
    ['maxContextLength'],
  ]) ?? 0));

  return directValue ?? (providerValue || 128000);
}

function resolveMaxOutputTokens(raw: JsonMap, maxInputTokens: number): number {
  return readFirstPositiveNumber(raw, [
    ['max_output_tokens'],
    ['maxOutputTokens'],
    ['max_tokens'],
    ['permission', 'max_output'],
    ['permission', 'maxOutput'],
    ['permission', 'max_output_tokens'],
    ['permission', 'maxOutputTokens'],
    ['limit', 'output'],
    ['output_token_limit'],
    ['outputTokenLimit'],
    ['token_limits', 'output'],
    ['tokenLimits', 'output'],
    ['limits', 'output'],
  ]) ?? Math.min(8192, Math.max(1024, Math.floor(maxInputTokens / 8)));
}

function resolveSupportsTools(raw: JsonMap, modelId: string): boolean {
  const explicit = readBoolean(raw, [
    ['supports_tool_calling'],
    ['supportsToolCalling'],
    ['tool_call'],
    ['toolCall'],
    ['tools_calling'],
    ['toolCalling'],
    ['capabilities', 'tool_calling'],
    ['capabilities', 'supports_tool_calling'],
    ['capabilities', 'function_calling'],
    ['capabilities', 'tools'],
    ['permission', 'tool_calling'],
    ['permission', 'toolCalling'],
    ['permission', 'supports_tool_calling'],
    ['permission', 'supportsToolCalling'],
    ['permission', 'function_calling'],
    ['permission', 'tools'],
  ]);

  if (explicit !== undefined) {
    return explicit;
  }

  const providerToolSupport = liveProviderRecords(raw)
    .map(provider => readBoolean(provider, [
      ['supports_tools'],
      ['supportsTools'],
      ['supports_tool_calling'],
      ['supportsToolCalling'],
    ]))
    .find((value): value is boolean => value !== undefined);

  if (providerToolSupport !== undefined) {
    return providerToolSupport;
  }

  return !isLikelyNonChatModel(modelId);
}

function stringArrayFromPaths(root: JsonMap, paths: string[][]): string[] {
  return paths.flatMap(path => stringArray(readPath(root, path)));
}

function resolveSupportsReasoning(raw: JsonMap, provider: ProviderId, modelId: string): boolean {
  const explicit = readBoolean(raw, [
    ['supports_reasoning'],
    ['supportsReasoning'],
    ['reasoning'],
    ['supports_thinking'],
    ['supportsThinking'],
    ['capabilities', 'reasoning'],
    ['capabilities', 'thinking'],
    ['capabilities', 'reasoning_tokens'],
    ['capabilities', 'reasoningTokens'],
  ]);

  if (explicit !== undefined) {
    return explicit;
  }

  const supportedParameters = stringArrayFromPaths(raw, [
    ['supported_parameters'],
    ['supportedParameters'],
    ['parameters'],
    ['capabilities', 'parameters'],
  ]);

  if (supportedParameters.some(parameter => (
    parameter === 'reasoning' ||
    parameter === 'reasoning_effort' ||
    parameter === 'reasoning_format' ||
    parameter === 'include_reasoning' ||
    parameter === 'thinking'
  ))) {
    return true;
  }

  const text = [
    modelId,
    readFirstString(raw, [['name']]),
    readFirstString(raw, [['display_name']]),
    readFirstString(raw, [['description']]),
    ...stringArray(readPath(raw, ['tags'])),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (provider === 'zai' && /^glm-[a-z0-9.-]*(?:4\.[5-9]|[5-9])/.test(modelId.toLowerCase())) {
    return true;
  }

  if (provider === 'groq' && (text.includes('gpt-oss') || text.includes('qwen3') || text.includes('deepseek-r1'))) {
    return true;
  }

  if (provider === 'nvidia' && (
    text.includes('gpt-oss') ||
    text.includes('qwen3') ||
    text.includes('qwen 3') ||
    text.includes('deepseek-r1') ||
    text.includes('reasoning')
  )) {
    return true;
  }

  if (provider === 'sambanova' && (
    text.includes('gpt-oss') ||
    text.includes('deepseek') ||
    text.includes('reasoning')
  )) {
    return true;
  }

  if (provider === 'siliconflow' && (
    text.includes('deepseek') ||
    text.includes('qwen3') ||
    text.includes('qwq') ||
    text.includes('reasoning') ||
    text.includes('thinking')
  )) {
    return true;
  }

  if (provider === 'openrouter' || provider === 'openprovider') {
    return (
      text.includes('reasoning') ||
      text.includes('thinking') ||
      text.includes('deepseek-r1') ||
      text.includes('qwen3') ||
      text.includes('gpt-oss') ||
      /\bo[134]\b/.test(text) ||
      text.includes('glm-4.5') ||
      text.includes('glm-4.6') ||
      text.includes('glm-4.7')
    );
  }

  if (provider === 'llm7') {
    return (
      text.includes('reasoning') ||
      text.includes('thinking') ||
      text.includes('deepseek-r1') ||
      text.includes('gpt-oss') ||
      /\br1\b/.test(text)
    );
  }

  if (provider === 'ollama') {
    return (
      text.includes('reasoning') ||
      text.includes('thinking') ||
      text.includes('deepseek-r1') ||
      text.includes('gpt-oss') ||
      text.includes('qwen3') ||
      text.includes('qwen 3') ||
      /\br1\b/.test(text)
    );
  }

  return text.includes('reasoning') || text.includes('thinking');
}

function resolveDisplayName(raw: JsonMap, modelId: string): string {
  return readFirstString(raw, [
    ['display_name'],
    ['displayName'],
    ['label'],
    ['name'],
    ['title'],
  ]) ?? prettyNameFromModelId(modelId);
}

function cleanDescription(value: string): string | undefined {
  const cleaned = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 12) {
    return undefined;
  }

  return cleaned;
}

function resolveDescription(raw: JsonMap): string | undefined {
  const description = readFirstString(raw, [
    ['description'],
    ['model_description'],
    ['modelDescription'],
    ['summary'],
    ['subtitle'],
    ['details', 'description'],
    ['metadata', 'description'],
    ['info', 'description'],
    ['card', 'description'],
    ['modelCard', 'description'],
    ['docs', 'description'],
    ['task', 'description'],
  ]);

  return description ? cleanDescription(description) : undefined;
}

function registryId(provider: ProviderId, modelId: string): string {
  const normalized = modelId.trim();
  const prefix = `${provider}/`;

  if (normalized.toLowerCase().startsWith(prefix)) {
    return normalized;
  }

  return `${provider}/${normalized}`;
}

function inferCategory(raw: JsonMap, modelId: string): ModelCategory {
  if (isImageGenerationTask(raw)) {
    return 'image';
  }

  if (isImageToTextTask(raw, modelId)) {
    return 'vision';
  }

  if (isTextToSpeechTask(raw, modelId)) {
    return 'audio';
  }

  return 'text';
}

function defaultInputModalities(category: ModelCategory): string[] {
  if (category === 'image') {
    return ['text'];
  }

  if (category === 'vision') {
    return ['image', 'text'];
  }

  return ['text'];
}

function defaultOutputModalities(category: ModelCategory): string[] {
  if (category === 'image') {
    return ['image'];
  }

  if (category === 'audio') {
    return ['audio'];
  }

  return ['text'];
}

function modelAliases(raw: JsonMap): string[] {
  const aliases = readPath(raw, ['aliases']);
  if (!Array.isArray(aliases)) {
    return [];
  }

  return aliases
    .filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
    .map(alias => alias.trim());
}

function aliasModel(model: ProviderModel, alias: string): ProviderModel | undefined {
  if (model.provider !== 'pollinations' || alias.toLowerCase() === model.modelId.toLowerCase()) {
    return undefined;
  }

  return {
    ...model,
    id: registryId(model.provider, alias),
    modelId: alias,
    name: prettyNameFromModelId(alias),
    description: `Pollinations alias for ${model.name}.`,
    tags: [...model.tags, 'alias'],
  };
}

function normalizeUrlForCompare(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function modelsDevProviderRecords(payload: unknown): JsonMap[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  return Object.values(root)
    .map(asRecord)
    .filter((provider): provider is JsonMap => {
      if (!provider) {
        return false;
      }

      return Boolean(asRecord(readPath(provider, ['models']))) && Boolean(readFirstString(provider, [['api']]));
    });
}

function selectModelsDevProvider(payload: unknown, apiUrl: string | undefined): JsonMap | undefined {
  const expected = normalizeUrlForCompare(apiUrl);
  if (!expected) {
    return undefined;
  }

  return modelsDevProviderRecords(payload)
    .find(provider => normalizeUrlForCompare(readFirstString(provider, [['api']])) === expected);
}

function isDeprecatedModelsDevModel(raw: JsonMap): boolean {
  return readFirstString(raw, [['status']])?.toLowerCase() === 'deprecated';
}

function isZeroPricedModel(raw: JsonMap): boolean {
  const pricingValues = readPricingValues(raw);
  return pricingValues !== undefined && pricingValues.length > 0 && pricingValues.every(value => value === 0);
}

function parseModelsDevProviderModelList(
  payload: unknown,
  provider: ProviderId,
  options: FreeModelFilterOptions = {}
): ProviderModel[] {
  const selectedProvider = selectModelsDevProvider(payload, options.sourceApiUrl ?? options.routeBaseUrl);
  const providerModels = asRecord(selectedProvider ? readPath(selectedProvider, ['models']) : undefined);
  if (!selectedProvider || !providerModels) {
    return [];
  }

  const routeBaseUrl = options.routeBaseUrl ?? readFirstString(selectedProvider, [['api']]);
  const modelOptions: FreeModelFilterOptions = {
    ...options,
    routeBaseUrl,
    routeUsesProviderAuth: options.routeUsesProviderAuth ?? false,
  };
  const seen = new Set<string>();
  const models: ProviderModel[] = [];

  for (const [modelId, rawValue] of Object.entries(providerModels)) {
    const raw = asRecord(rawValue);
    if (!raw || isDeprecatedModelsDevModel(raw)) {
      continue;
    }

    const withFreeSignal: JsonMap = {
      ...raw,
      id: readFirstString(raw, [['id']]) ?? modelId,
      free: isZeroPricedModel(raw),
    };
    const model = toProviderModel(withFreeSignal, provider, modelOptions);
    if (!model) {
      continue;
    }

    const normalizedId = model.id.toLowerCase();
    if (seen.has(normalizedId)) {
      continue;
    }

    seen.add(normalizedId);
    models.push(model);
  }

  return models.sort((left, right) => (
    right.priority - left.priority ||
    left.provider.localeCompare(right.provider) ||
    left.name.localeCompare(right.name)
  ));
}

function toProviderModel(
  raw: JsonMap,
  forcedProvider?: ProviderId,
  options: FreeModelFilterOptions = {}
): ProviderModel | undefined {
  let modelId = extractProviderModelId(raw, forcedProvider);

  if (!modelId) {
    return undefined;
  }

  const category = options.category ?? inferCategory(raw, modelId);
  const provider = forcedProvider ?? inferProvider(raw, modelId);
  if (!provider) {
    return undefined;
  }

  if (provider === 'ollama') {
    const cloudModelId = normalizeOllamaCloudModelId(raw, modelId, options);
    if (!cloudModelId) {
      return undefined;
    }
    modelId = cloudModelId;
  }

  if (provider === 'openprovider' && isOpenProviderRouterModel(raw, modelId)) {
    return undefined;
  }

  if (category === 'text' && provider === 'nvidia' && isNvidiaImageGenerationModel(modelId)) {
    return undefined;
  }

  if (category === 'text' && provider === 'nvidia' && !isKnownNvidiaHostedChatModel(modelId)) {
    return undefined;
  }

  if (category === 'text' && !isChatModelForCategory(raw, modelId)) {
    return undefined;
  }

  if (category === 'image' && !isImageGenerationTask(raw) && !(provider === 'nvidia' && isNvidiaImageGenerationModel(modelId))) {
    return undefined;
  }

  if (category === 'vision' && !isImageToTextTask(raw, modelId)) {
    return undefined;
  }

  if (category === 'audio' && !isTextToSpeechTask(raw, modelId)) {
    return undefined;
  }

  if (provider === 'cloudflare' && !modelId.startsWith('@cf/')) {
    return undefined;
  }

  if (provider === 'google' && !googleSupportsTextGeneration(raw)) {
    return undefined;
  }

  if (provider === 'google' && !isKnownFreeGoogleModel(modelId)) {
    return undefined;
  }

  if (provider === 'cloudflare' && category === 'text' && isCloudflareNonChatTask(raw)) {
    return undefined;
  }

  const freeStatus = resolveFreeStatus(raw, provider, modelId);
  if (options.freeOnly && !freeStatus.free) {
    return undefined;
  }

  const maxInputTokens = resolveMaxInputTokens(raw);

  return {
    id: registryId(provider, modelId),
    modelId,
    name: resolveDisplayName(raw, modelId),
    description: resolveDescription(raw),
    provider,
    routeBaseUrl: options.routeBaseUrl,
    routeFormat: options.routeFormat,
    routeUsesProviderAuth: options.routeUsesProviderAuth,
    category,
    inputModalities: modalityArray(raw, 'input').length > 0 ? modalityArray(raw, 'input') : defaultInputModalities(category),
    outputModalities: modalityArray(raw, 'output').length > 0 ? modalityArray(raw, 'output') : defaultOutputModalities(category),
    priority: PROVIDER_PRIORITIES[provider],
    enabled: true,
    maxInputTokens,
    maxOutputTokens: resolveMaxOutputTokens(raw, maxInputTokens),
    supportsTools: category === 'text'
      && options.routeFormat !== 'anthropic-messages'
      && provider !== 'llm7'
      && !(provider === 'siliconflow' && isKnownFreeSiliconFlowModel(modelId))
      && resolveSupportsTools(raw, modelId),
    supportsReasoning: category === 'text'
      && options.routeFormat !== 'anthropic-messages'
      && resolveSupportsReasoning(raw, provider, modelId),
    free: freeStatus.free,
    freeReason: freeStatus.reason,
    tags: [
      provider,
      category,
      ...(options.routeFormat === 'anthropic-messages' ? ['anthropic', 'messages'] : []),
      'dynamic',
      freeStatus.free ? 'free' : 'paid',
      ...(category === 'text' && resolveSupportsReasoning(raw, provider, modelId) ? ['reasoning'] : []),
    ],
  };
}

export function parseProviderModelList(
  payload: unknown,
  provider: ProviderId,
  options: FreeModelFilterOptions = {}
): ProviderModel[] {
  if (options.sourceFormat === 'atxp-chat-models') {
    return parseAtxpChatPickerModelList(payload, provider, options);
  }

  if (options.sourceFormat === 'models-dev-provider') {
    return parseModelsDevProviderModelList(payload, provider, options);
  }

  const rawModels = extractModelObjects(payload);
  const seen = new Set<string>();
  const models: ProviderModel[] = [];

  for (const raw of rawModels) {
    const model = toProviderModel(raw, provider, options);
    if (!model) {
      continue;
    }

    const normalizedId = model.id.toLowerCase();
    if (seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);

    models.push(model);

    for (const alias of modelAliases(raw)) {
      const aliasEntry = aliasModel(model, alias);
      if (!aliasEntry) {
        continue;
      }

      const normalizedAliasId = aliasEntry.id.toLowerCase();
      if (seen.has(normalizedAliasId)) {
        continue;
      }

      seen.add(normalizedAliasId);
      models.push(aliasEntry);
    }
  }

  return models.sort((left, right) => (
    right.priority - left.priority ||
    left.provider.localeCompare(right.provider) ||
    left.name.localeCompare(right.name)
  ));
}

export function countProviderModelList(
  payload: unknown,
  provider: ProviderId,
  options: Omit<FreeModelFilterOptions, 'freeOnly'> = {}
): number {
  return parseProviderModelList(payload, provider, { ...options, freeOnly: false }).length;
}

export function parseOpenProviderModelList(
  payload: unknown,
  options: FreeModelFilterOptions = {}
): ProviderModel[] {
  const rawModels = extractModelObjects(payload);
  const seen = new Set<string>();
  const models: ProviderModel[] = [];

  for (const raw of rawModels) {
    const model = toProviderModel(raw, undefined, options);
    if (!model) {
      continue;
    }

    const normalizedId = model.id.toLowerCase();
    if (seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);

    models.push(model);
  }

  return models.sort((left, right) => (
    right.priority - left.priority ||
    left.provider.localeCompare(right.provider) ||
    left.name.localeCompare(right.name)
  ));
}
