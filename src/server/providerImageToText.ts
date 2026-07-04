import { OpenProviderConfig, ProviderModel } from '../core/types';
import { categorizeModel } from '../core/modelCategoryUtils';
import { OpenProviderError } from '../utils/errors';
import { assertSafeRemoteImageUrl, fetchSafeRemoteImageBytes } from './safeRemoteImage';

type ImageToTextBody = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function dataUrlToBase64(value: string): string {
  const commaIndex = value.indexOf(',');
  return commaIndex === -1 ? value : value.slice(commaIndex + 1);
}

function inferBase64MimeType(value: string, fallback = 'image/png'): string {
  if (value.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (value.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (value.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  if (value.startsWith('AAAAIGZ0eXBhdmlm')) {
    return 'image/avif';
  }

  return fallback;
}

async function toImageUrl(value: string): Promise<string> {
  if (value.startsWith('data:')) {
    return value;
  }

  if (isHttpUrl(value)) {
    return assertSafeRemoteImageUrl(value);
  }

  return `data:${inferBase64MimeType(value)};base64,${value}`;
}

function readImageInput(body: ImageToTextBody): string {
  const candidates = [body.image, body.image_url, body.imageUrl, body.url];
  const image = candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (!image) {
    throw new OpenProviderError('image, image_url, imageUrl, or url must be a non-empty string.', 400);
  }

  return image.trim();
}

function readPrompt(body: ImageToTextBody): string {
  const prompt = typeof body.prompt === 'string' && body.prompt.trim()
    ? body.prompt.trim()
    : 'Describe this image and extract any visible text.';

  return prompt;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function chatCompletionsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function cloudflareRunEndpoint(modelsBaseUrl: string, modelId: string): string {
  return `${modelsBaseUrl.replace(/\/+$/, '')}/run/${modelId}`;
}

function mistralOcrEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/ocr`;
}

async function readJsonResponse(response: Response, provider: string, action = 'image-to-text'): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new OpenProviderError(
      `${provider} ${action} failed with status ${response.status}.`,
      response.status,
      text
    );
  }

  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new OpenProviderError(`${provider} returned invalid JSON for ${action}.`, response.status, text);
  }
}

async function imageToByteArray(image: string): Promise<number[]> {
  if (isHttpUrl(image)) {
    return Array.from(await fetchSafeRemoteImageBytes(image));
  }

  return Array.from(Buffer.from(dataUrlToBase64(image), 'base64'));
}

function textResponse(model: ProviderModel, text: string, raw: unknown): Record<string, unknown> {
  return {
    object: 'image_to_text',
    created: Math.floor(Date.now() / 1000),
    model: model.modelId,
    provider: model.provider,
    data: [{ text }],
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text,
      },
      finish_reason: null,
    }],
    raw,
  };
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(item => {
      const record = asRecord(item);
      return typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractChoiceText(payload: unknown): string {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice.message);

  return extractTextFromContent(message.content);
}

function throwProviderPayloadError(payload: unknown, provider: string, action: string): void {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  const message = typeof error.message === 'string' && error.message.trim()
    ? error.message.trim()
    : '';

  if (!message) {
    return;
  }

  const status = typeof error.code === 'number' && error.code >= 400 ? error.code : 502;
  throw new OpenProviderError(`${provider} ${action} failed: ${message}`, status, JSON.stringify(payload));
}

function extractCloudflareText(payload: unknown): string {
  const record = asRecord(payload);
  const result = Object.keys(asRecord(record.result)).length > 0 ? asRecord(record.result) : record;

  return [
    result.description,
    result.response,
    result.text,
    result.output,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

function extractMistralOcrText(payload: unknown): string {
  const record = asRecord(payload);
  const pages = Array.isArray(record.pages) ? record.pages : [];
  const pageText = pages
    .map(page => {
      const pageRecord = asRecord(page);
      return typeof pageRecord.markdown === 'string'
        ? pageRecord.markdown
        : typeof pageRecord.text === 'string'
          ? pageRecord.text
          : '';
    })
    .filter(Boolean)
    .join('\n\n');

  if (pageText.trim()) {
    return pageText.trim();
  }

  return [
    record.markdown,
    record.text,
    record.output,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

async function generateCloudflareImageToText(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageToTextBody
): Promise<Record<string, unknown>> {
  const provider = config.providers.cloudflare;
  const image = readImageInput(body);
  const requestBody: Record<string, unknown> = {
    image: await imageToByteArray(image),
    prompt: readPrompt(body),
    max_tokens: readPositiveInteger(body.max_tokens ?? body.maxTokens, 512),
  };

  for (const key of ['temperature', 'top_p', 'top_k', 'seed', 'raw']) {
    if (body[key] !== undefined) {
      requestBody[key] = body[key];
    }
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
  const payload = await readJsonResponse(response, model.provider);
  const text = extractCloudflareText(payload);

  if (!text) {
    throw new OpenProviderError(`${model.provider} did not return image-to-text output.`, 502, JSON.stringify(payload));
  }

  return textResponse(model, text, payload);
}

async function generateChatCompletionsImageToText(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageToTextBody
): Promise<Record<string, unknown>> {
  const provider = config.providers[model.provider];
  const image = readImageInput(body);
  const imageUrl = await toImageUrl(image);
  const requestBody: Record<string, unknown> = {
    model: model.modelId,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: readPrompt(body) },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    }],
    stream: false,
  };

  if (body.max_tokens !== undefined || body.maxTokens !== undefined) {
    requestBody.max_tokens = readPositiveInteger(body.max_tokens ?? body.maxTokens, 512);
  }

  if (body.temperature !== undefined) {
    requestBody.temperature = body.temperature;
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
  throwProviderPayloadError(payload, model.provider, 'image-to-text');
  const text = extractChoiceText(payload);

  if (!text) {
    throw new OpenProviderError(`${model.provider} did not return image-to-text output.`, 502, JSON.stringify(payload));
  }

  return textResponse(model, text, payload);
}

async function generateMistralImageToText(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageToTextBody
): Promise<Record<string, unknown>> {
  const provider = config.providers.mistral;
  const image = readImageInput(body);
  const imageUrl = await toImageUrl(image);
  const response = await fetch(mistralOcrEndpoint(provider.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: model.modelId,
      document: {
        type: 'image_url',
        image_url: imageUrl,
      },
      include_image_base64: body.include_image_base64 === true,
    }),
  });
  const payload = await readJsonResponse(response, model.provider, 'OCR');
  const text = extractMistralOcrText(payload);

  if (!text) {
    throw new OpenProviderError(`${model.provider} did not return OCR output.`, 502, JSON.stringify(payload));
  }

  return textResponse(model, text, payload);
}

export async function generateProviderImageToText(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: ImageToTextBody
): Promise<Record<string, unknown>> {
  const provider = config.providers[model.provider];

  if (!provider?.enabled || !provider.apiKey.trim()) {
    throw new OpenProviderError(`${model.provider} API key is not configured.`, 503);
  }

  if (categorizeModel(model) !== 'vision') {
    throw new OpenProviderError(`Model "${model.id}" does not support image-to-text.`, 400);
  }

  if (model.provider === 'cloudflare') {
    return generateCloudflareImageToText(config, model, body);
  }

  if (
    model.provider === 'openrouter' ||
    model.provider === 'cohere' ||
    model.provider === 'zai' ||
    model.provider === 'puter'
  ) {
    return generateChatCompletionsImageToText(config, model, body);
  }

  if (model.provider === 'mistral') {
    return generateMistralImageToText(config, model, body);
  }

  throw new OpenProviderError(`${model.provider} image-to-text is not implemented yet.`, 501);
}
