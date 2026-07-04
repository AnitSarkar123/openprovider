import { ModelRegistry, createDefaultModelRegistry } from './modelRegistry';
import { ChatRequest, ResolvedModel, ModelCategory, ProviderModel } from './types';
import { categorizeModel } from './modelCategoryUtils';

// Re-export for convenience
export { categorizeModel };

export interface RoutedChatRequest extends ChatRequest {
  model: string;
  resolvedModel: ResolvedModel;
}

export class ModelRouter {
  constructor(
    private readonly registry: ModelRegistry = createDefaultModelRegistry(),
    private readonly defaultModel = 'auto',
    private readonly autoModel = 'auto'
  ) {}

  route(request: ChatRequest): RoutedChatRequest {
    const resolvedModel = this.registry.resolve(request.model, this.defaultModel, this.autoModel);

    return {
      ...request,
      model: resolvedModel.apiModelId,
      resolvedModel,
    };
  }

  listAvailableModels() {
    return this.registry.list().map(model => ({
      ...model,
      category: categorizeModel(model),
    }));
  }

  listModelsByCategory(category: ModelCategory) {
    return this.listAvailableModels().filter(model => model.category === category);
  }

  replaceModels(models: ReturnType<ModelRegistry['list']>) {
    return this.registry.replaceModels(models);
  }
}

export function createModelRouter(defaultModel = 'auto', autoModel = 'auto'): ModelRouter {
  return new ModelRouter(createDefaultModelRegistry(), defaultModel, autoModel);
}
