import type { ProviderId as RegistryProviderId } from './providerRegistry';

export type ProviderId = RegistryProviderId;

export type RoutingMode = 'auto' | 'provider-model' | 'pass-through';
export type ModelCategory = 'text' | 'image' | 'vision' | 'audio' | 'auto';

// Legacy category names for backward compatibility
export type LegacyModelCategory = 'chat' | 'image-to-text' | 'text-to-speech';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string | { url: string } }
  | Record<string, unknown>;

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatMessageContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: unknown[];
  toolChoice?: unknown;
  metadata?: Record<string, unknown>;
}

export interface OpenProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  autoModel: string;
  timeoutMs: number;
  modelSyncTtlMs: number;
  freeModelsOnly: boolean;
  providers: Record<ProviderId, ProviderRuntimeConfig>;
}

export interface ProviderRuntimeConfig {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  modelsBaseUrl: string;
  modelSources?: ProviderModelSource[];
  enabled: boolean;
  missingConfigReason?: string;
}

export type ProviderModelSourceFormat = 'openai-compatible' | 'models-dev-provider' | 'atxp-chat-models';
export type ProviderRouteFormat = 'openai-compatible' | 'anthropic-messages';

export interface ProviderModelSource {
  category: ModelCategory;
  catalogUrl: string;
  format?: ProviderModelSourceFormat;
  routeBaseUrl?: string;
  routeFormat?: ProviderRouteFormat;
  sourceCatalogUrl?: string;
  usesProviderAuth?: boolean;
}

export interface ProviderModel {
  id: string;
  modelId: string;
  name: string;
  description?: string;
  provider: ProviderId;
  routeBaseUrl?: string;
  routeFormat?: ProviderRouteFormat;
  routeUsesProviderAuth?: boolean;
  category?: ModelCategory;
  inputModalities?: string[];
  outputModalities?: string[];
  priority: number;
  enabled: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsReasoning?: boolean;
  free: boolean;
  freeReason: string;
  tags: string[];
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  models: ProviderModel[];
}

export interface ProviderDiscoveryResult {
  provider: ProviderId;
  ok: boolean;
  skipped: boolean;
  modelCount: number;
  discoveredModelCount: number;
  filteredModelCount: number;
  models: ProviderModel[];
  error?: string;
  status?: number;
}

export interface ResolvedModel {
  requestedModel: string;
  apiModelId: string;
  routingMode: RoutingMode;
  providerModel?: ProviderModel;
  reason: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason?: string | null;
}

export interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Record<string, unknown>;
  raw: unknown;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  responseFormat?: 'url' | 'b64_json';
  seed?: number;
  steps?: number;
  metadata?: Record<string, unknown>;
}

export interface ImageGenerationResponse {
  created: number;
  model: string;
  provider: ProviderId;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  raw: unknown;
}

export interface ImageToTextRequest {
  image?: string;
  imageUrl?: string;
  model?: string;
  prompt?: string;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface ImageToTextResponse {
  created: number;
  model: string;
  provider: ProviderId;
  object: 'image_to_text';
  data: Array<{
    text: string;
  }>;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason?: string | null;
  }>;
  raw: unknown;
}

export interface TextToSpeechRequest {
  input: string;
  model?: string;
  voice?: string;
  voiceId?: string;
  refAudio?: string;
  responseFormat?: string;
  speed?: number;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface TextToSpeechResponse {
  model: string;
  provider: ProviderId;
  contentType: string;
  audio: ArrayBuffer;
}

export type ChatStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool'; toolCall: unknown }
  | { type: 'raw'; chunk: unknown }
  | { type: 'done' };
