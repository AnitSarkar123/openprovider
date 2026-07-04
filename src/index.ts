import { createOpenProviderClient } from './core/openProvider';

export { loadDotEnv, loadOpenProviderConfig, parseDotEnv } from './config/env';
export { ModelRegistry, createDefaultModelRegistry } from './core/modelRegistry';
export { ModelRouter, createModelRouter } from './core/modelRouter';
export { OPENPROVIDER_AUTO_FREE_MODEL_ID, OPENPROVIDER_AUTO_FREE_MODEL_NAME } from './core/autoFreeRouter';
export { OpenProviderClient, createOpenProviderClient } from './core/openProvider';
export { discoverConfiguredProviderModels, discoverProviderModels } from './core/providerDiscovery';
export { createOpenProviderApiServer, startOpenProviderApiServer } from './server/apiServer';
export type {
  ChatCompletionResponse,
  ChatMessage,
  ChatRequest,
  ChatRole,
  ChatStreamEvent,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageToTextRequest,
  ImageToTextResponse,
  ModelCategory,
  OpenProviderConfig,
  ProviderDefinition,
  ProviderDiscoveryResult,
  ProviderId,
  ProviderModel,
  ProviderRuntimeConfig,
  ResolvedModel,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from './core/types';
export { OpenProviderConfigError, OpenProviderError } from './utils/errors';

async function main(): Promise<void> {
  const client = createOpenProviderClient();
  const models = client.listAvailableModels();

  console.log('OpenProvider architecture is ready.');
  console.log('Gateway: OpenProvider');
  console.log('API endpoints: GET /health, GET /v1/models, GET /v1/providers/status, POST /v1/chat/completions, POST /v1/images/generations, POST /v1/images/analyze, POST /v1/audio/speech');
  console.log('Default gateway route: openprovider/auto-free');
  console.log('Dynamic model sync: await client.syncModels()');
  console.log(`Fallback free-provider models: ${models.map(model => model.id).join(', ')}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
