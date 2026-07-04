import { loadOpenProviderConfig } from '../config/env';
import { OpenProviderError } from '../utils/errors';
import { parseOpenAICompatibleStream } from '../utils/stream';
import { parseOpenProviderModelList } from './modelDiscovery';
import { ModelRouter, createModelRouter } from './modelRouter';
import { discoverConfiguredProviderModels } from './providerDiscovery';
import {
  ChatCompletionResponse,
  ChatRequest,
  ChatStreamEvent,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageToTextRequest,
  ImageToTextResponse,
  OpenProviderConfig,
  ProviderId,
  ProviderDiscoveryResult,
  ProviderModel,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from './types';

type RequestBody = Record<string, unknown>;
type RequestMethod = 'GET' | 'POST';

function responseToChatCompletion(payload: unknown, fallbackModel: string): ChatCompletionResponse {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];

  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    object: typeof record.object === 'string' ? record.object : undefined,
    created: typeof record.created === 'number' ? record.created : undefined,
    model: typeof record.model === 'string' ? record.model : fallbackModel,
    choices: choices.map((choice, index) => {
      const choiceRecord = choice && typeof choice === 'object' ? choice as Record<string, unknown> : {};
      const message = choiceRecord.message && typeof choiceRecord.message === 'object'
        ? choiceRecord.message as Record<string, unknown>
        : {};

      return {
        index: typeof choiceRecord.index === 'number' ? choiceRecord.index : index,
        message: {
          role: message.role === 'assistant' || message.role === 'system' || message.role === 'tool'
            ? message.role
            : 'assistant',
          content: typeof message.content === 'string' ? message.content : null,
          tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
        },
        finish_reason: typeof choiceRecord.finish_reason === 'string' ? choiceRecord.finish_reason : null,
      };
    }),
    usage: record.usage && typeof record.usage === 'object'
      ? record.usage as Record<string, unknown>
      : undefined,
    raw: payload,
  };
}

function toOpenAICompatibleBody(request: ChatRequest, model: string, stream: boolean): RequestBody {
  const body: RequestBody = {
    model,
    messages: request.messages,
    stream,
  };

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  if (request.topP !== undefined) {
    body.top_p = request.topP;
  }

  if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }

  if (request.tools !== undefined) {
    body.tools = request.tools;
  }

  if (request.toolChoice !== undefined) {
    body.tool_choice = request.toolChoice;
  }

  if (request.metadata !== undefined) {
    body.metadata = request.metadata;
  }

  return body;
}

function toImageGenerationBody(request: ImageGenerationRequest): RequestBody {
  const body: RequestBody = {
    prompt: request.prompt,
    model: request.model ?? 'auto',
  };

  if (request.n !== undefined) {
    body.n = request.n;
  }

  if (request.size !== undefined) {
    body.size = request.size;
  }

  if (request.responseFormat !== undefined) {
    body.response_format = request.responseFormat;
  }

  if (request.seed !== undefined) {
    body.seed = request.seed;
  }

  if (request.steps !== undefined) {
    body.steps = request.steps;
  }

  if (request.metadata !== undefined) {
    body.metadata = request.metadata;
  }

  return body;
}

function toImageToTextBody(request: ImageToTextRequest): RequestBody {
  const body: RequestBody = {
    model: request.model ?? 'auto',
  };

  if (request.image !== undefined) {
    body.image = request.image;
  }

  if (request.imageUrl !== undefined) {
    body.image_url = request.imageUrl;
  }

  if (request.prompt !== undefined) {
    body.prompt = request.prompt;
  }

  if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  if (request.metadata !== undefined) {
    body.metadata = request.metadata;
  }

  return body;
}

function toTextToSpeechBody(request: TextToSpeechRequest): RequestBody {
  const body: RequestBody = {
    input: request.input,
    model: request.model ?? 'auto',
  };

  if (request.voice !== undefined) {
    body.voice = request.voice;
  }

  if (request.voiceId !== undefined) {
    body.voice_id = request.voiceId;
  }

  if (request.refAudio !== undefined) {
    body.ref_audio = request.refAudio;
  }

  if (request.responseFormat !== undefined) {
    body.response_format = request.responseFormat;
  }

  if (request.speed !== undefined) {
    body.speed = request.speed;
  }

  if (request.language !== undefined) {
    body.language = request.language;
  }

  if (request.metadata !== undefined) {
    body.metadata = request.metadata;
  }

  return body;
}

export class OpenProviderClient {
  constructor(
    private readonly config: OpenProviderConfig,
    private readonly router: ModelRouter = createModelRouter(config.defaultModel, config.autoModel)
  ) {}

  async chat(request: ChatRequest): Promise<ChatCompletionResponse> {
    const routed = this.router.route(request);
    const body = toOpenAICompatibleBody(routed, routed.model, false);
    const payload = await this.postJson('/chat/completions', body, false);
    return responseToChatCompletion(payload, routed.model);
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const routed = this.router.route({ ...request, stream: true });
    const body = toOpenAICompatibleBody(routed, routed.model, true);
    const response = await this.send('/chat/completions', body, true);

    if (!response.body) {
      throw new OpenProviderError('OpenProvider returned an empty stream.', response.status);
    }

    yield* parseOpenAICompatibleStream(response.body);
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const payload = await this.postJson('/images/generations', toImageGenerationBody(request), false);
    return payload as ImageGenerationResponse;
  }

  async imageToText(request: ImageToTextRequest): Promise<ImageToTextResponse> {
    const payload = await this.postJson('/images/analyze', toImageToTextBody(request), false);
    return payload as ImageToTextResponse;
  }

  async speech(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    const response = await this.send('/audio/speech', toTextToSpeechBody(request), false);

    return {
      model: response.headers.get('x-openprovider-model') ?? request.model ?? 'auto',
      provider: (response.headers.get('x-openprovider-provider') ?? 'openprovider') as ProviderId,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      audio: await response.arrayBuffer(),
    };
  }

  async fetchLatestModels(): Promise<ProviderModel[]> {
    const providerResults = await this.fetchProviderModelResults();
    const providerModels = providerResults.flatMap(result => result.models);

    if (providerModels.length > 0) {
      return providerModels;
    }

    if (!this.config.apiKey.trim()) {
      return [];
    }

    const payload = await this.getJson('/models');
    return parseOpenProviderModelList(payload, { freeOnly: this.config.freeModelsOnly });
  }

  async syncModels(): Promise<ProviderModel[]> {
    const models = await this.fetchLatestModels();
    return this.router.replaceModels(models);
  }

  async fetchProviderModelResults(): Promise<ProviderDiscoveryResult[]> {
    return discoverConfiguredProviderModels(this.config);
  }

  listAvailableModels() {
    return this.router.listAvailableModels();
  }

  private endpoint(path: string): string {
    return `${this.config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.sendRequest('GET', path, undefined, false);
    return this.readJsonResponse(response);
  }

  private async postJson(path: string, body: RequestBody, stream: boolean): Promise<unknown> {
    const response = await this.send(path, body, stream);
    return this.readJsonResponse(response);
  }

  private async readJsonResponse(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new OpenProviderError('OpenProvider returned invalid JSON.', response.status, text);
    }
  }

  private async send(path: string, body: RequestBody, stream: boolean): Promise<Response> {
    return this.sendRequest('POST', path, body, stream);
  }

  private async sendRequest(
    method: RequestMethod,
    path: string,
    body: RequestBody | undefined,
    stream: boolean
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const headers: Record<string, string> = {
      Accept: stream ? 'text/event-stream' : 'application/json',
    };

    if (this.config.apiKey.trim()) {
      headers.Authorization = `Bearer ${this.config.apiKey.trim()}`;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(this.endpoint(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new OpenProviderError(
          `OpenProvider request failed with status ${response.status}.`,
          response.status,
          detail
        );
      }

      return response;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new OpenProviderError(`OpenProvider request timed out after ${this.config.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createOpenProviderClient(config = loadOpenProviderConfig()): OpenProviderClient {
  return new OpenProviderClient(config);
}
