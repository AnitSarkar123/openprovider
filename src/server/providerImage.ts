import { OpenProviderConfig, ProviderModel } from '../core/types';
import { categorizeModel } from '../core/modelCategoryUtils';
import { OpenProviderError } from '../utils/errors';

type ImageGenerationBody = Record<string, unknown>;

function dataUrlToBase64(value: string): string {
  const commaIndex = value.indexOf(',');
  return commaIndex === -1 ? value : value.slice(commaIndex + 1);
}

function toDataUrl(base64OrDataUrl: string, mimeType = 'image/png'): string {
  if (base64OrDataUrl.startsWith('data:')) {
    return base64OrDataUrl;
  }

  return `data:${inferBase64MimeType(base64OrDataUrl, mimeType)};base64,${base64OrDataUrl}`;
}

function inferBase64MimeType(value: string, fallback: string): string {
  if (value.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (value.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (value.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  return fallback || 'image/png';
}

function inferImageMimeType(bytes: Uint8Array, fallback: string): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg';
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }

  return fallback || 'image/png';
}

function cloudflareRunEndpoint(modelsBaseUrl: string, modelId: string): string {
  return `${modelsBaseUrl.replace(/\/+$/, '')}/run/${modelId}`;
}

function nvidiaRunEndpoint(modelId: string): string {
  const baseUrl = process.env.NVIDIA_IMAGE_BASE_URL?.trim() || 'https://ai.api.nvidia.com/v1/genai';
  const normalizedModelId = modelId.replace(/^nvidia\//i, '');
  return `${baseUrl.replace(/\/+$/, '')}/${normalizedModelId}`;
}

function openAiImageEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/images/generations`;
}

function chatCompletionsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function requiredPrompt(body: ImageGenerationBody): string {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    throw new OpenProviderError('prompt must be a non-empty string.', 400);
  }

  return prompt;
}

function parseSize(value: unknown): { width: number; height: number } | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.trim().match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) {
    return undefined;
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }

  return { width, height };
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function imageResponse(
  model: ProviderModel,
  images: string[],
  raw: unknown,
  prompt: string
): Record<string, unknown> {
  return {
    created: Math.floor(Date.now() / 1000),
    model: model.modelId,
    provider: model.provider,
    data: images.map(image => ({
      url: toDataUrl(image),
      b64_json: dataUrlToBase64(image),
      revised_prompt: prompt,
    })),
    raw,
  };
}

async function readJsonResponse(response: Response, provider: string): Promise<unknown> {
  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new OpenProviderError(
      `${provider} image generation failed with status ${response.status}.`,
      response.status,
      text
    );
  }

  return payload;
}

async function generateCloudflareImage(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageGenerationBody
): Promise<Record<string, unknown>> {
  const provider = config.providers.cloudflare;
  const prompt = requiredPrompt(body);
  const requestBody: Record<string, unknown> = { prompt };
  const seed = optionalInteger(body.seed);
  const steps = optionalInteger(body.steps);

  if (seed !== undefined) {
    requestBody.seed = seed;
  }

  if (steps !== undefined) {
    requestBody.steps = steps;
  }

  const response = await fetch(cloudflareRunEndpoint(provider.modelsBaseUrl, model.modelId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenProviderError(
      `${model.provider} image generation failed with status ${response.status}.`,
      response.status,
      detail
    );
  }

  if (contentType.startsWith('image/')) {
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const mimeType = inferImageMimeType(bytes, contentType);
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return imageResponse(model, [`data:${mimeType};base64,${base64}`], {
      contentType,
      byteLength: bytes.length,
    }, prompt);
  }

  const payload = await readJsonResponse(response, model.provider);
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const result = record.result && typeof record.result === 'object'
    ? record.result as Record<string, unknown>
    : record;
  const image = typeof result.image === 'string' ? result.image : '';

  if (!image) {
    throw new OpenProviderError(`${model.provider} did not return an image.`, 502, JSON.stringify(payload));
  }

  return imageResponse(model, [image], payload, prompt);
}

async function generateOpenRouterImage(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageGenerationBody
): Promise<Record<string, unknown>> {
  const provider = config.providers.openrouter;
  const prompt = requiredPrompt(body);
  const requestBody: Record<string, unknown> = {
    model: model.modelId,
    messages: [{ role: 'user', content: prompt }],
    modalities: ['image', 'text'],
    stream: false,
  };

  if (body.seed !== undefined) {
    requestBody.seed = body.seed;
  }

  if (body.temperature !== undefined) {
    requestBody.temperature = body.temperature;
  }

  if (body.image_config !== undefined) {
    requestBody.image_config = body.image_config;
  }

  const response = await fetch(chatCompletionsEndpoint(provider.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const payload = await readJsonResponse(response, model.provider);
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const images = choices.flatMap(choice => {
    const choiceRecord = choice && typeof choice === 'object' ? choice as Record<string, unknown> : {};
    const message = choiceRecord.message && typeof choiceRecord.message === 'object'
      ? choiceRecord.message as Record<string, unknown>
      : {};
    const messageImages = Array.isArray(message.images) ? message.images : [];

    return messageImages
      .map(item => {
        const imageRecord = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const imageUrl = imageRecord.image_url && typeof imageRecord.image_url === 'object'
          ? imageRecord.image_url as Record<string, unknown>
          : {};

        return typeof imageUrl.url === 'string' ? imageUrl.url : undefined;
      })
      .filter((value): value is string => Boolean(value));
  });

  if (images.length === 0) {
    throw new OpenProviderError(`${model.provider} did not return an image.`, 502, JSON.stringify(payload));
  }

  return imageResponse(model, images, payload, prompt);
}

async function generateNvidiaImage(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageGenerationBody
): Promise<Record<string, unknown>> {
  const provider = config.providers.nvidia;
  const prompt = requiredPrompt(body);
  const size = parseSize(body.size) ?? { width: 1024, height: 1024 };
  const seed = optionalInteger(body.seed);
  const steps = optionalInteger(body.steps);
  const samples = optionalInteger(body.n);
  const requestBody: Record<string, unknown> = {
    prompt,
    width: size.width,
    height: size.height,
    samples: samples ?? 1,
  };

  if (seed !== undefined) {
    requestBody.seed = seed;
  }

  if (steps !== undefined) {
    requestBody.steps = steps;
  }

  if (body.cfg_scale !== undefined) {
    requestBody.cfg_scale = body.cfg_scale;
  }

  if (body.guidance_scale !== undefined) {
    requestBody.guidance_scale = body.guidance_scale;
  }

  const response = await fetch(nvidiaRunEndpoint(model.modelId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const payload = await readJsonResponse(response, model.provider);
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const images = artifacts
    .map(artifact => {
      const item = artifact && typeof artifact === 'object' ? artifact as Record<string, unknown> : {};
      return typeof item.base64 === 'string'
        ? item.base64
        : typeof item.b64_json === 'string'
          ? item.b64_json
          : undefined;
    })
    .filter((value): value is string => Boolean(value));

  if (images.length === 0) {
    throw new OpenProviderError(`${model.provider} did not return an image.`, 502, JSON.stringify(payload));
  }

  return imageResponse(model, images, payload, prompt);
}

async function generateOpenAiCompatibleImage(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageGenerationBody
): Promise<Record<string, unknown>> {
  const provider = config.providers[model.provider];
  const prompt = requiredPrompt(body);
  const response = await fetch(openAiImageEndpoint(provider.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...body,
      prompt,
      model: model.modelId,
      response_format: body.response_format ?? 'b64_json',
    }),
  });
  const payload = await readJsonResponse(response, model.provider);

  return {
    ...payload as Record<string, unknown>,
    provider: model.provider,
  };
}

export async function generateProviderImage(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageGenerationBody
): Promise<Record<string, unknown>> {
  const provider = config.providers[model.provider];

  if (!provider?.enabled || !provider.apiKey.trim()) {
    throw new OpenProviderError(`${model.provider} API key is not configured.`, 503);
  }

  if (categorizeModel(model) !== 'image') {
    throw new OpenProviderError(`Model "${model.id}" does not support image generation.`, 400);
  }

  if (model.provider === 'cloudflare') {
    return generateCloudflareImage(config, model, body);
  }

  if (model.provider === 'nvidia') {
    return generateNvidiaImage(config, model, body);
  }

  if (model.provider === 'openrouter') {
    return generateOpenRouterImage(config, model, body);
  }

  return generateOpenAiCompatibleImage(config, model, body);
}
