export type ProviderCredentialNames = {
  apiKey: readonly string[];
  baseUrl: readonly string[];
  modelsBaseUrl?: readonly string[];
};

export type ProviderRegistryModelCategory = 'text' | 'image' | 'vision' | 'audio' | 'auto';
export type ProviderRegistryModelSourceFormat = 'openai-compatible' | 'models-dev-provider' | 'atxp-chat-models';

export type ProviderDiscoveryTarget = {
  category: ProviderRegistryModelCategory;
  path: string;
  modelsBaseUrl?: string;
  routeBaseUrl?: string;
  routeFormat?: 'openai-compatible' | 'anthropic-messages';
  format?: ProviderRegistryModelSourceFormat;
  usesProviderAuth?: boolean;
};

export type ProviderRegistryEntry = {
  id: string;
  name: string;
  description: string;
  getKeyUrl: string;
  docsUrl: string;
  requiredEnv: readonly string[];
  requiredEnvAliases?: Record<string, readonly string[]>;
  optionalEnv: readonly string[];
  aliases?: readonly string[];
  capabilities: readonly string[];
  note: string;
  keyNames: ProviderCredentialNames;
  defaultBaseUrl: string;
  defaultModelsBaseUrl?: string;
  discoveryTargets: readonly ProviderDiscoveryTarget[];
  apiKeyRequired: boolean;
};

const CLOUDFLARE_ACCOUNT_PLACEHOLDER = '{account_id}';
export const CLOUDFLARE_API_ROOT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_PLACEHOLDER}/ai`;

export const PROVIDER_REGISTRY = [
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'NVIDIA-hosted NIM endpoints for chat, image, vision, and speech catalog discovery.',
    getKeyUrl: 'https://build.nvidia.com/settings/api-keys',
    docsUrl: 'https://build.nvidia.com/',
    requiredEnv: ['NVIDIA_API_KEY'],
    optionalEnv: ['NVIDIA_BASE_URL', 'NVIDIA_IMAGE_BASE_URL'],
    capabilities: ['chat', 'image', 'vision', 'catalog'],
    note: 'Use the key from build.nvidia.com for hosted NIM APIs.',
    keyNames: {
      apiKey: ['NVIDIA_API_KEY'],
      baseUrl: ['NVIDIA_BASE_URL'],
    },
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'image', path: '/models' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast OpenAI-compatible chat and text-to-speech routes.',
    getKeyUrl: 'https://console.groq.com/keys/',
    docsUrl: 'https://console.groq.com/docs/api-reference',
    requiredEnv: ['GROQ_API_KEY'],
    optionalEnv: ['GROQ_BASE_URL'],
    capabilities: ['chat', 'speech'],
    note: 'Use GroqCloud API keys. Free availability depends on Groq account limits.',
    keyNames: {
      apiKey: ['GROQ_API_KEY'],
      baseUrl: ['GROQ_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'audio', path: '/models' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    description: 'Workers AI REST API with account-scoped free allocation and model catalog sync.',
    getKeyUrl: 'https://developers.cloudflare.com/workers-ai/get-started/rest-api/',
    docsUrl: 'https://developers.cloudflare.com/workers-ai/',
    requiredEnv: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    requiredEnvAliases: {
      CLOUDFLARE_API_TOKEN: ['CLOUDFLARE_AUTH_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDWORKER_API_KEY', 'CF_API_TOKEN'],
    },
    optionalEnv: ['CLOUDFLARE_BASE_URL', 'CLOUDFLARE_MODELS_BASE_URL'],
    aliases: ['CLOUDFLARE_AUTH_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDWORKER_API_KEY', 'CF_API_TOKEN'],
    capabilities: ['chat', 'image', 'vision', 'speech'],
    note: 'Token needs Workers AI read/edit access. Account ID is required to build the REST URL.',
    keyNames: {
      apiKey: [
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_AUTH_TOKEN',
        'CLOUDFLARE_API_KEY',
        'CLOUDWORKER_API_KEY',
        'CF_API_TOKEN',
      ],
      baseUrl: ['CLOUDFLARE_BASE_URL'],
      modelsBaseUrl: ['CLOUDFLARE_MODELS_BASE_URL'],
    },
    defaultBaseUrl: `${CLOUDFLARE_API_ROOT}/v1`,
    defaultModelsBaseUrl: CLOUDFLARE_API_ROOT,
    discoveryTargets: [
      { category: 'text', path: '/models/search?task=Text%20Generation&hide_experimental=true&per_page=100' },
      { category: 'image', path: '/models/search?task=Text-to-Image&hide_experimental=true&per_page=100' },
      { category: 'vision', path: '/models/search?task=Image-to-Text&hide_experimental=true&per_page=100' },
      { category: 'audio', path: '/models/search?task=Text-to-Speech&hide_experimental=true&per_page=100' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'sambanova',
    name: 'SambaNova Cloud',
    description: 'SambaCloud OpenAI-compatible chat API with free-tier model access and dynamic model metadata.',
    getKeyUrl: 'https://cloud.sambanova.ai/apis',
    docsUrl: 'https://docs.sambanova.ai/docs/en/get-started/api-keys-urls',
    requiredEnv: ['SAMBANOVA_API_KEY'],
    requiredEnvAliases: {
      SAMBANOVA_API_KEY: ['SAMBACLOUD_API_KEY'],
    },
    optionalEnv: ['SAMBANOVA_BASE_URL', 'SAMBANOVA_MODELS_BASE_URL'],
    aliases: ['SAMBACLOUD_API_KEY', 'SAMBACLOUD_BASE_URL', 'SAMBACLOUD_MODELS_BASE_URL'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'Default SambaCloud base URL is https://api.sambanova.ai/v1. Free-tier models are constrained by SambaNova account rate limits.',
    keyNames: {
      apiKey: ['SAMBANOVA_API_KEY', 'SAMBACLOUD_API_KEY'],
      baseUrl: ['SAMBANOVA_BASE_URL', 'SAMBACLOUD_BASE_URL'],
      modelsBaseUrl: ['SAMBANOVA_MODELS_BASE_URL', 'SAMBACLOUD_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.sambanova.ai/v1',
    discoveryTargets: [{ category: 'text', path: '/models' }],
    apiKeyRequired: true,
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    description: 'SiliconCloud OpenAI-compatible model API with key-based access, dynamic catalog discovery, and zero-priced model support.',
    getKeyUrl: 'https://cloud.siliconflow.com/account/ak',
    docsUrl: 'https://docs.siliconflow.com/en/userguide/quickstart',
    requiredEnv: ['SILICONFLOW_API_KEY'],
    requiredEnvAliases: {
      SILICONFLOW_API_KEY: ['SILICONCLOUD_API_KEY'],
    },
    optionalEnv: ['SILICONFLOW_BASE_URL', 'SILICONFLOW_MODELS_BASE_URL'],
    aliases: ['SILICONCLOUD_API_KEY', 'SILICONCLOUD_BASE_URL', 'SILICONCLOUD_MODELS_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'Default SiliconFlow base URL is https://api.siliconflow.com/v1. OpenProvider includes known zero-priced models and dynamically discovered free or zero-priced models.',
    keyNames: {
      apiKey: ['SILICONFLOW_API_KEY', 'SILICONCLOUD_API_KEY'],
      baseUrl: ['SILICONFLOW_BASE_URL', 'SILICONCLOUD_BASE_URL'],
      modelsBaseUrl: ['SILICONFLOW_MODELS_BASE_URL', 'SILICONCLOUD_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.siliconflow.com/v1',
    discoveryTargets: [{ category: 'text', path: '/models?type=text&sub_type=chat' }],
    apiKeyRequired: true,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Cohere command, Aya, and compatible chat/vision models when available.',
    getKeyUrl: 'https://dashboard.cohere.com/api-keys',
    docsUrl: 'https://docs.cohere.com/',
    requiredEnv: ['COHERE_API_KEY'],
    optionalEnv: ['COHERE_BASE_URL', 'COHERE_CHAT_BASE_URL', 'COHERE_MODELS_BASE_URL'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'Cohere has separate compatibility and model-list base URLs.',
    keyNames: {
      apiKey: ['COHERE_API_KEY'],
      baseUrl: ['COHERE_BASE_URL', 'COHERE_CHAT_BASE_URL'],
      modelsBaseUrl: ['COHERE_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.cohere.ai/compatibility/v1',
    defaultModelsBaseUrl: 'https://api.cohere.ai/v1',
    discoveryTargets: [
      { category: 'text', path: '/models?endpoint=chat&page_size=1000' },
      { category: 'vision', path: '/models?endpoint=chat&page_size=1000' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral free-tier chat routes and Voxtral speech routes where available.',
    getKeyUrl: 'https://console.mistral.ai/api-keys/',
    docsUrl: 'https://docs.mistral.ai/admin/security-access/api-keys/',
    requiredEnv: ['MISTRAL_API_KEY'],
    optionalEnv: ['MISTRAL_BASE_URL'],
    capabilities: ['chat', 'speech'],
    note: 'Keys are workspace-scoped. Use the free Experiment tier where available.',
    keyNames: {
      apiKey: ['MISTRAL_API_KEY'],
      baseUrl: ['MISTRAL_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'vision', path: '/models' },
      { category: 'audio', path: '/models' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenAI-compatible model routing with explicit free model filtering.',
    getKeyUrl: 'https://openrouter.ai/settings/keys',
    docsUrl: 'https://openrouter.ai/docs/api-keys',
    requiredEnv: ['OPENROUTER_API_KEY'],
    optionalEnv: ['OPENROUTER_BASE_URL'],
    capabilities: ['chat', 'image', 'vision', 'speech'],
    note: 'OpenProvider only exposes OpenRouter models marked free or zero-priced.',
    keyNames: {
      apiKey: ['OPENROUTER_API_KEY'],
      baseUrl: ['OPENROUTER_BASE_URL'],
    },
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'image', path: '/models?output_modalities=image' },
      { category: 'vision', path: '/models?output_modalities=text' },
      { category: 'audio', path: '/models?output_modalities=speech' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'freemodel',
    name: 'FreeModel',
    description: 'FreeModel OpenAI-compatible API plus Claude/Anthropic Messages access with signup credits.',
    getKeyUrl: 'https://freemodel.dev/dashboard',
    docsUrl: 'https://freemodel.dev/',
    requiredEnv: ['FREEMODEL_API_KEY'],
    requiredEnvAliases: {
      FREEMODEL_API_KEY: ['FREE_MODEL_API_KEY'],
    },
    optionalEnv: ['FREEMODEL_BASE_URL', 'FREEMODEL_MODELS_BASE_URL'],
    aliases: ['FREE_MODEL_API_KEY', 'FREE_MODEL_BASE_URL', 'FREE_MODEL_MODELS_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'Default FreeModel base URL is https://api.freemodel.dev/v1. Claude models are discovered from the Anthropic Messages route at https://cc.freemodel.dev/v1.',
    keyNames: {
      apiKey: ['FREEMODEL_API_KEY', 'FREE_MODEL_API_KEY'],
      baseUrl: ['FREEMODEL_BASE_URL', 'FREE_MODEL_BASE_URL'],
      modelsBaseUrl: ['FREEMODEL_MODELS_BASE_URL', 'FREE_MODEL_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.freemodel.dev/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      {
        category: 'text',
        path: '/models',
        modelsBaseUrl: 'https://cc.freemodel.dev/v1',
        routeBaseUrl: 'https://cc.freemodel.dev/v1',
        routeFormat: 'anthropic-messages',
      },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'puter',
    name: 'Puter',
    description: 'Puter OpenAI-compatible chat gateway with broad latest-model access through user-account auth tokens.',
    getKeyUrl: 'https://puter.com/dashboard',
    docsUrl: 'https://developer.puter.com/tutorials/use-openai-sdk-with-puter/',
    requiredEnv: ['PUTER_AUTH_TOKEN'],
    requiredEnvAliases: {
      PUTER_AUTH_TOKEN: ['PUTER_API_KEY'],
    },
    optionalEnv: ['PUTER_BASE_URL', 'PUTER_MODELS_BASE_URL'],
    aliases: ['PUTER_API_KEY'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'Use the auth token from the Puter dashboard. Puter provides account-backed free access to the latest model catalog, so OpenProvider exposes the supported Puter chat and vision models.',
    keyNames: {
      apiKey: ['PUTER_AUTH_TOKEN', 'PUTER_API_KEY'],
      baseUrl: ['PUTER_BASE_URL'],
      modelsBaseUrl: ['PUTER_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.puter.com/puterai/openai/v1',
    defaultModelsBaseUrl: 'https://api.puter.com/puterai/chat',
    discoveryTargets: [
      { category: 'text', path: '/models/details' },
      { category: 'vision', path: '/models/details' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'openprovider',
    name: 'OpenProvider',
    description: 'OpenProvider free-route catalog sources and auto-router metadata.',
    getKeyUrl: 'https://open-provider.vercel.app/models',
    docsUrl: 'https://open-provider.vercel.app/docs',
    requiredEnv: [],
    optionalEnv: ['OPENPROVIDER_FREE_API_KEY', 'OPENPROVIDER_FREE_BASE_URL', 'OPENPROVIDER_FREE_MODELS_BASE_URL'],
    aliases: ['OPENPROVIDER_FREE_MODELS_API_KEY', 'OPENPROVIDER_FREE_MODELS_API_BASE_URL', 'OPENPROVIDER_FREE_CATALOG_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'Configured free model sources can feed the OpenProvider Auto Free route.',
    keyNames: {
      apiKey: ['OPENPROVIDER_FREE_API_KEY', 'OPENPROVIDER_FREE_MODELS_API_KEY'],
      baseUrl: ['OPENPROVIDER_FREE_BASE_URL', 'OPENPROVIDER_FREE_MODELS_API_BASE_URL'],
      modelsBaseUrl: ['OPENPROVIDER_FREE_MODELS_BASE_URL', 'OPENPROVIDER_FREE_CATALOG_BASE_URL'],
    },
    defaultBaseUrl: '',
    discoveryTargets: [{ category: 'text', path: '/models' }],
    apiKeyRequired: false,
  },
  {
    id: 'shuttleai',
    name: 'ShuttleAI',
    description: 'ShuttleAI OpenAI-compatible chat API with explicit free-plan model discovery.',
    getKeyUrl: 'https://shuttleai.com/',
    docsUrl: 'https://docs.shuttleai.com/models/overview',
    requiredEnv: ['SHUTTLEAI_API_KEY'],
    optionalEnv: ['SHUTTLEAI_BASE_URL', 'SHUTTLEAI_MODELS_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'OpenProvider reads ShuttleAI /models/verbose and exposes only models whose plan is free. Free accounts are rate-limited by ShuttleAI.',
    keyNames: {
      apiKey: ['SHUTTLEAI_API_KEY'],
      baseUrl: ['SHUTTLEAI_BASE_URL'],
      modelsBaseUrl: ['SHUTTLEAI_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.shuttleai.com/v1',
    discoveryTargets: [{ category: 'text', path: '/models/verbose' }],
    apiKeyRequired: true,
  },
  {
    id: 'routeway',
    name: 'Routeway',
    description: 'OpenAI-compatible unified API with dynamic discovery for models marked free.',
    getKeyUrl: 'https://routeway.ai/dashboard',
    docsUrl: 'https://docs.routeway.ai/getting-started/models',
    requiredEnv: ['ROUTEWAY_API_KEY'],
    requiredEnvAliases: {
      ROUTEWAY_API_KEY: ['Routeway_API_KEY'],
    },
    optionalEnv: ['ROUTEWAY_BASE_URL', 'ROUTEWAY_MODELS_BASE_URL'],
    aliases: ['Routeway_API_KEY'],
    capabilities: ['chat', 'catalog'],
    note: 'OpenProvider reads Routeway /models and exposes only models with the :free marker or zero pricing.',
    keyNames: {
      apiKey: ['ROUTEWAY_API_KEY', 'Routeway_API_KEY'],
      baseUrl: ['ROUTEWAY_BASE_URL'],
      modelsBaseUrl: ['ROUTEWAY_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.routeway.ai/v1',
    discoveryTargets: [{ category: 'text', path: '/models' }],
    apiKeyRequired: true,
  },
  {
    id: 'llmgateway',
    name: 'LLMGateway',
    description: 'OpenAI-compatible LLM gateway with catalog discovery and explicit free model metadata.',
    getKeyUrl: 'https://llmgateway.io/dashboard',
    docsUrl: 'https://docs.llmgateway.io/v1_models',
    requiredEnv: ['LLM_GATEWAY_API_KEY'],
    requiredEnvAliases: {
      LLM_GATEWAY_API_KEY: ['LLMGATEWAY_API_KEY'],
    },
    optionalEnv: ['LLM_GATEWAY_BASE_URL', 'LLM_GATEWAY_MODELS_BASE_URL'],
    aliases: ['LLMGATEWAY_API_KEY', 'LLMGATEWAY_BASE_URL', 'LLMGATEWAY_MODELS_BASE_URL'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'OpenProvider reads LLMGateway /models and honors the explicit free flag before considering pricing.',
    keyNames: {
      apiKey: ['LLM_GATEWAY_API_KEY', 'LLMGATEWAY_API_KEY'],
      baseUrl: ['LLM_GATEWAY_BASE_URL', 'LLMGATEWAY_BASE_URL'],
      modelsBaseUrl: ['LLM_GATEWAY_MODELS_BASE_URL', 'LLMGATEWAY_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.llmgateway.io/v1',
    discoveryTargets: [{ category: 'text', path: '/models?exclude_deprecated=true' }],
    apiKeyRequired: true,
  },
  {
    id: 'atxp',
    name: 'ATXP LLM Gateway',
    description: 'ATXP OpenAI-compatible LLM Gateway with dynamic catalog discovery across GPT, Claude, Gemini, Grok, DeepSeek, and other chat models.',
    getKeyUrl: 'https://accounts.atxp.ai',
    docsUrl: 'https://docs.atxp.ai/agents/llm-gateway',
    requiredEnv: ['ATXP_CONNECTION'],
    requiredEnvAliases: {
      ATXP_CONNECTION: ['ATXP_CONNECTION_STRING', 'ATXP_API_KEY'],
    },
    optionalEnv: ['ATXP_BASE_URL', 'ATXP_MODELS_BASE_URL'],
    aliases: ['ATXP_CONNECTION_STRING', 'ATXP_API_KEY', 'ATXP_LLM_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'Paste the ATXP connection string from the ATXP account dashboard or CLI. Chat/app URLs such as https://chat.atxp.ai/c/new are normalized to the LLM API root.',
    keyNames: {
      apiKey: ['ATXP_CONNECTION', 'ATXP_CONNECTION_STRING', 'ATXP_API_KEY'],
      baseUrl: ['ATXP_BASE_URL', 'ATXP_LLM_BASE_URL'],
      modelsBaseUrl: ['ATXP_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://llm.atxp.ai/v1',
    defaultModelsBaseUrl: 'https://chat.atxp.ai/api',
    discoveryTargets: [
      {
        category: 'text',
        path: '/models',
        modelsBaseUrl: 'https://chat.atxp.ai/api',
        routeBaseUrl: 'https://llm.atxp.ai/v1',
        format: 'atxp-chat-models',
      },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'apifreellm',
    name: 'ApiFreeLLM',
    description: 'Free chat API with a custom non-OpenAI-compatible endpoint.',
    getKeyUrl: 'https://apifreellm.com/en/api-access',
    docsUrl: 'https://apifreellm.com/en/api-access',
    requiredEnv: ['APIFREELLM_API_KEY'],
    requiredEnvAliases: {
      APIFREELLM_API_KEY: ['API_FREE_LLM_API_KEY'],
    },
    optionalEnv: ['APIFREELLM_BASE_URL'],
    aliases: ['API_FREE_LLM_API_KEY', 'API_FREE_LLM_BASE_URL'],
    capabilities: ['chat'],
    note: 'Free tier uses POST /api/v1/chat, is rate-limited to one request every 40 seconds, and is adapted into OpenProvider chat responses.',
    keyNames: {
      apiKey: ['APIFREELLM_API_KEY', 'API_FREE_LLM_API_KEY'],
      baseUrl: ['APIFREELLM_BASE_URL', 'API_FREE_LLM_BASE_URL'],
      modelsBaseUrl: ['APIFREELLM_MODELS_BASE_URL', 'API_FREE_LLM_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://apifreellm.com/api/v1',
    discoveryTargets: [],
    apiKeyRequired: true,
  },
  {
    id: 'cerbes',
    name: 'Cerebras',
    description: 'Cerebras inference API for free-tier chat models.',
    getKeyUrl: 'https://cloud.cerebras.ai/',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    requiredEnv: ['CERBES_API_KEY'],
    requiredEnvAliases: {
      CERBES_API_KEY: ['CEREBRAS_API_KEY'],
    },
    optionalEnv: ['CERBES_BASE_URL'],
    aliases: ['CEREBRAS_API_KEY', 'CEREBRAS_BASE_URL'],
    capabilities: ['chat'],
    note: 'The code accepts both CERBES_* and CEREBRAS_* env names.',
    keyNames: {
      apiKey: ['CERBES_API_KEY', 'CEREBRAS_API_KEY'],
      baseUrl: ['CERBES_BASE_URL', 'CEREBRAS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    discoveryTargets: [{ category: 'text', path: '/models' }],
    apiKeyRequired: true,
  },
  {
    id: 'zai',
    name: 'Z.AI / GLM',
    description: 'GLM Flash and vision-capable models through the Z.AI Open Platform.',
    getKeyUrl: 'https://docs.z.ai/guides/overview/quick-start',
    docsUrl: 'https://docs.z.ai/',
    requiredEnv: ['ZAI_API_KEY'],
    requiredEnvAliases: {
      ZAI_API_KEY: ['GLM_API_KEY'],
    },
    optionalEnv: ['ZAI_BASE_URL'],
    aliases: ['GLM_API_KEY', 'GLM_BASE_URL'],
    capabilities: ['chat', 'vision'],
    note: 'The code also supports GLM_* env names for compatibility.',
    keyNames: {
      apiKey: ['ZAI_API_KEY', 'GLM_API_KEY'],
      baseUrl: ['ZAI_BASE_URL', 'GLM_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'vision', path: '/models' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    description: 'Gemini API through Google AI Studio using the OpenAI-compatible chat, vision, tools, streaming, and model-list endpoints.',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    requiredEnv: ['GEMINI_API_KEY'],
    requiredEnvAliases: {
      GEMINI_API_KEY: ['GOOGLE_AI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY'],
    },
    optionalEnv: ['GEMINI_BASE_URL', 'GEMINI_MODELS_BASE_URL'],
    aliases: ['GOOGLE_AI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'GOOGLE_AI_BASE_URL', 'GOOGLE_AI_STUDIO_BASE_URL'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'Free-tier Gemini API quotas are rate-limited per project and daily request quotas reset at midnight Pacific time.',
    keyNames: {
      apiKey: ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY'],
      baseUrl: ['GEMINI_BASE_URL', 'GOOGLE_AI_BASE_URL', 'GOOGLE_AI_STUDIO_BASE_URL'],
      modelsBaseUrl: ['GEMINI_MODELS_BASE_URL', 'GOOGLE_AI_MODELS_BASE_URL', 'GOOGLE_AI_STUDIO_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'vision', path: '/models' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'zenmux',
    name: 'ZenMux',
    description: 'OpenAI-compatible model aggregation with dynamic free-model discovery.',
    getKeyUrl: 'https://zenmux.ai/settings/keys',
    docsUrl: 'https://docs.zenmux.ai/api/openai/openai-list-models.html',
    requiredEnv: ['ZENMUX_API_KEY'],
    optionalEnv: ['ZENMUX_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'OpenProvider reads ZenMux /models and exposes only models marked free or zero-priced.',
    keyNames: {
      apiKey: ['ZENMUX_API_KEY'],
      baseUrl: ['ZENMUX_BASE_URL'],
    },
    defaultBaseUrl: 'https://zenmux.ai/api/v1',
    discoveryTargets: [{ category: 'text', path: '/models' }],
    apiKeyRequired: true,
  },
  {
    id: 'llm7',
    name: 'LLM7.io',
    description: 'Zero-friction OpenAI-compatible text and vision gateway with public basic access.',
    getKeyUrl: 'https://token.llm7.io/',
    docsUrl: 'https://docs.llm7.io/guides/models',
    requiredEnv: [],
    optionalEnv: ['LLM7_API_KEY', 'LLM7_BASE_URL', 'LLM7_MODELS_BASE_URL'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'Basic access works without a token; save an LLM7 token for higher rate limits.',
    keyNames: {
      apiKey: ['LLM7_API_KEY'],
      baseUrl: ['LLM7_BASE_URL'],
      modelsBaseUrl: ['LLM7_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://api.llm7.io/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'vision', path: '/models' },
    ],
    apiKeyRequired: false,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Ollama Cloud API-key chat models with dynamic cloud catalog discovery.',
    getKeyUrl: 'https://ollama.com/settings/keys',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    requiredEnv: ['OLLAMA_API_KEY'],
    optionalEnv: ['OLLAMA_BASE_URL', 'OLLAMA_MODELS_BASE_URL'],
    capabilities: ['chat', 'catalog'],
    note: 'Only Ollama Cloud API-key models are listed; local-download models are filtered out.',
    keyNames: {
      apiKey: ['OLLAMA_API_KEY'],
      baseUrl: ['OLLAMA_BASE_URL'],
      modelsBaseUrl: ['OLLAMA_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://ollama.com/v1',
    defaultModelsBaseUrl: 'https://ollama.com/api',
    discoveryTargets: [{ category: 'text', path: '/tags' }],
    apiKeyRequired: true,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Hugging Face Inference Providers through the OpenAI-compatible router.',
    getKeyUrl: 'https://huggingface.co/settings/tokens',
    docsUrl: 'https://huggingface.co/docs/api-inference/index',
    requiredEnv: ['HF_TOKEN'],
    requiredEnvAliases: {
      HF_TOKEN: ['HUGGINGFACE_API_KEY', 'HUGGINGFACE_HUB_TOKEN'],
    },
    optionalEnv: ['HF_BASE_URL', 'HF_MODELS_BASE_URL'],
    aliases: ['HUGGINGFACE_API_KEY', 'HUGGINGFACE_HUB_TOKEN', 'HUGGINGFACE_BASE_URL', 'HUGGINGFACE_MODELS_BASE_URL'],
    capabilities: ['chat', 'vision', 'catalog'],
    note: 'Create a fine-grained token with Make calls to Inference Providers permission. Catalog models use Hugging Face account free-tier credits.',
    keyNames: {
      apiKey: ['HF_TOKEN', 'HUGGINGFACE_API_KEY', 'HUGGINGFACE_HUB_TOKEN'],
      baseUrl: ['HF_BASE_URL', 'HUGGINGFACE_BASE_URL'],
      modelsBaseUrl: ['HF_MODELS_BASE_URL', 'HUGGINGFACE_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    discoveryTargets: [
      { category: 'text', path: '/models' },
      { category: 'vision', path: '/models' },
    ],
    apiKeyRequired: true,
  },
  {
    id: 'pollinations',
    name: 'Pollinations.ai',
    description: 'OpenAI-compatible text generation through Pollinations text API.',
    getKeyUrl: 'https://enter.pollinations.ai/',
    docsUrl: 'https://pollinations-ai.com/api',
    requiredEnv: [],
    optionalEnv: ['POLLINATIONS_API_KEY', 'POLLINATIONS_BASE_URL', 'POLLINATIONS_MODELS_BASE_URL'],
    aliases: ['POLLINATIONS_TOKEN'],
    capabilities: ['chat', 'catalog'],
    note: 'OpenProvider exposes models marked anonymous/free. Anonymous Pollinations calls are heavily rate limited; add a Pollinations key for steadier chat.',
    keyNames: {
      apiKey: ['POLLINATIONS_API_KEY', 'POLLINATIONS_TOKEN'],
      baseUrl: ['POLLINATIONS_BASE_URL'],
      modelsBaseUrl: ['POLLINATIONS_MODELS_BASE_URL'],
    },
    defaultBaseUrl: 'https://text.pollinations.ai/openai',
    defaultModelsBaseUrl: 'https://text.pollinations.ai',
    discoveryTargets: [{ category: 'text', path: '/models' }],
    apiKeyRequired: false,
  },
] as const satisfies readonly ProviderRegistryEntry[];

export type ProviderId = typeof PROVIDER_REGISTRY[number]['id'];

export const PROVIDER_IDS = PROVIDER_REGISTRY.map(provider => provider.id) as ProviderId[];

export const PROVIDER_ENTRIES: readonly ProviderRegistryEntry[] = PROVIDER_REGISTRY;

export const PROVIDER_METADATA_BY_ID = Object.fromEntries(
  PROVIDER_ENTRIES.map(provider => [provider.id, provider])
) as unknown as Record<ProviderId, ProviderRegistryEntry>;

export const PROVIDER_KEY_NAMES = Object.fromEntries(
  PROVIDER_ENTRIES.map(provider => [provider.id, provider.keyNames])
) as unknown as Record<ProviderId, ProviderCredentialNames>;

export const PROVIDER_DEFAULT_BASE_URLS = Object.fromEntries(
  PROVIDER_ENTRIES.map(provider => [provider.id, provider.defaultBaseUrl])
) as unknown as Record<ProviderId, string>;

export const PROVIDER_DEFAULT_MODELS_BASE_URLS = Object.fromEntries(
  PROVIDER_ENTRIES.map(provider => [provider.id, provider.defaultModelsBaseUrl ?? provider.defaultBaseUrl])
) as unknown as Record<ProviderId, string>;

export const PROVIDER_DISCOVERY_TARGETS = Object.fromEntries(
  PROVIDER_ENTRIES.map(provider => [provider.id, provider.discoveryTargets])
) as unknown as Record<ProviderId, readonly ProviderDiscoveryTarget[]>;

export const PROVIDER_API_KEY_REQUIRED = Object.fromEntries(
  PROVIDER_ENTRIES.map(provider => [provider.id, provider.apiKeyRequired])
) as unknown as Record<ProviderId, boolean>;

export function getProviderMetadata(providerId: string): ProviderRegistryEntry | undefined {
  return PROVIDER_METADATA_BY_ID[providerId as ProviderId];
}
