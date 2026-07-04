import { apiFreeLlmProvider } from '../providers/apifreellm';
import { cerbesProvider } from '../providers/cerbes';
import { cloudflareProvider } from '../providers/cloudflare';
import { cohereProvider } from '../providers/cohere';
import { freeModelProvider } from '../providers/freemodel';
import { googleProvider } from '../providers/google';
import { groqProvider } from '../providers/groq';
import { huggingFaceProvider } from '../providers/huggingface';
import { atxpProvider } from '../providers/atxp';
import { llmGatewayProvider } from '../providers/llmgateway';
import { llm7Provider } from '../providers/llm7';
import { mistralProvider } from '../providers/mistral';
import { nvidiaProvider } from '../providers/nvidia';
import { ollamaProvider } from '../providers/ollama';
import { openRouterProvider } from '../providers/openrouter';
import { pollinationsProvider } from '../providers/pollinations';
import { puterProvider } from '../providers/puter';
import { routewayProvider } from '../providers/routeway';
import { sambaNovaProvider } from '../providers/sambanova';
import { shuttleAiProvider } from '../providers/shuttleai';
import { siliconFlowProvider } from '../providers/siliconflow';
import { zaiProvider } from '../providers/zai';
import { zenmuxProvider } from '../providers/zenmux';
import { ModelCategory, ProviderDefinition, ProviderModel, ResolvedModel } from './types';
import { categorizeModel } from './modelCategoryUtils';

const DEFAULT_PROVIDERS: ProviderDefinition[] = [
  nvidiaProvider,
  groqProvider,
  cloudflareProvider,
  sambaNovaProvider,
  siliconFlowProvider,
  cohereProvider,
  mistralProvider,
  googleProvider,
  openRouterProvider,
  freeModelProvider,
  puterProvider,
  shuttleAiProvider,
  routewayProvider,
  llmGatewayProvider,
  atxpProvider,
  apiFreeLlmProvider,
  cerbesProvider,
  zaiProvider,
  zenmuxProvider,
  llm7Provider,
  ollamaProvider,
  huggingFaceProvider,
  pollinationsProvider,
];

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function normalizeAutoModel(autoModel: string): string {
  return autoModel.trim() || 'auto';
}

export class ModelRegistry {
  private readonly modelsById = new Map<string, ProviderModel>();
  private readonly modelsByModelId = new Map<string, ProviderModel>();

  constructor(providers: ProviderDefinition[] = DEFAULT_PROVIDERS) {
    for (const provider of providers) {
      for (const model of provider.models) {
        this.addModel(model);
      }
    }
  }

  list(): ProviderModel[] {
    return [...this.modelsById.values()]
      .filter(model => model.enabled)
      .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
  }

  listByCategory(category: ModelCategory): ProviderModel[] {
    return this.list().filter(model => categorizeModel(model) === category);
  }

  find(modelId: string): ProviderModel | undefined {
    const normalized = normalizeModelId(modelId);
    return this.modelsById.get(normalized) ?? this.modelsByModelId.get(normalized);
  }

  replaceModels(models: ProviderModel[]): ProviderModel[] {
    if (models.length === 0) {
      return this.list();
    }

    this.modelsById.clear();
    this.modelsByModelId.clear();

    for (const model of models) {
      this.addModel(model);
    }

    return this.list();
  }

  resolve(requestedModel: string | undefined, fallbackModel = 'auto', autoModel = 'auto'): ResolvedModel {
    const requested = requestedModel?.trim() || fallbackModel;
    const normalized = normalizeModelId(requested);

    if (normalized === 'auto') {
      return {
        requestedModel: requested,
        apiModelId: normalizeAutoModel(autoModel),
        routingMode: 'auto',
        reason: 'OpenProvider gateway auto route selected. OpenProvider will choose across free backend providers.',
      };
    }

    const knownModel = this.find(requested);
    if (knownModel && knownModel.enabled) {
      return {
        requestedModel: requested,
        apiModelId: knownModel.modelId,
        routingMode: 'provider-model',
        providerModel: knownModel,
        reason: `Known ${knownModel.provider} model selected from registry.`,
      };
    }

    return {
      requestedModel: requested,
      apiModelId: requested,
      routingMode: 'pass-through',
      reason: 'Unknown model id passed through to the OpenProvider gateway.',
    };
  }

  private addModel(model: ProviderModel): void {
    this.modelsById.set(normalizeModelId(model.id), model);
    this.modelsByModelId.set(normalizeModelId(model.modelId), model);
  }
}

export function createDefaultModelRegistry(): ModelRegistry {
  return new ModelRegistry();
}
