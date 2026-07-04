import { OpenProviderConfig, ProviderModel } from '../core/types';
import { categorizeModel } from '../core/modelCategoryUtils';
import { OpenProviderError } from '../utils/errors';

type SpeechBody = Record<string, unknown>;

export type ProviderSpeechResponse = {
  bytes: Uint8Array;
  contentType: string;
  model: string;
  provider: string;
  raw?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredInput(body: SpeechBody): string {
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) {
    throw new OpenProviderError('input must be a non-empty string.', 400);
  }

  return input;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function cloudflareRunEndpoint(modelsBaseUrl: string, modelId: string): string {
  return `${modelsBaseUrl.replace(/\/+$/, '')}/run/${modelId}`;
}

function speechEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/audio/speech`;
}

function normalizeResponseFormat(value: unknown, fallback: string): string {
  const format = optionalString(value)?.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return format || fallback;
}

function contentTypeForFormat(format: string): string {
  if (format === 'wav') {
    return 'audio/wav';
  }

  if (format === 'pcm') {
    return 'audio/pcm';
  }

  if (format === 'opus') {
    return 'audio/opus';
  }

  if (format === 'flac') {
    return 'audio/flac';
  }

  if (format === 'aac') {
    return 'audio/aac';
  }

  return 'audio/mpeg';
}

function groqResponseFormat(value: unknown): string {
  const format = normalizeResponseFormat(value, 'wav');
  return format === 'wav' ? format : 'wav';
}

function cloudflareAudioEncoding(format: string): string | undefined {
  if (format === 'wav' || format === 'pcm') {
    return 'linear16';
  }

  if (['mp3', 'flac', 'opus', 'aac'].includes(format)) {
    return format;
  }

  return undefined;
}

function cloudflareAudioContainer(format: string): string | undefined {
  if (format === 'wav') {
    return 'wav';
  }

  if (format === 'opus') {
    return 'ogg';
  }

  if (format === 'pcm') {
    return 'none';
  }

  return undefined;
}

function base64AudioBytes(audio: string): Buffer {
  const dataUrlMatch = audio.match(/^data:([^;,]+)?;base64,(.+)$/i);
  const base64 = dataUrlMatch ? dataUrlMatch[2] : audio;
  return Buffer.from(base64, 'base64');
}

function extractBase64Audio(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  const record = asRecord(payload);
  const result = Object.keys(asRecord(record.result)).length > 0 ? asRecord(record.result) : record;

  return [
    result.audio_data,
    result.audio,
    result.data,
    result.output,
    result.result,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function parseJsonAudioPayload(text: string, provider: string, fallbackContentType: string, model: ProviderModel): ProviderSpeechResponse | undefined {
  let payload: unknown = text;
  try {
    payload = text.trim() ? JSON.parse(text) : {};
  } catch {
    // Some providers return base64 audio as text/plain.
  }

  const audio = extractBase64Audio(payload);
  if (!audio) {
    return undefined;
  }

  const bytes = base64AudioBytes(audio);
  if (bytes.byteLength <= 0) {
    return undefined;
  }

  return {
    bytes,
    contentType: fallbackContentType,
    model: model.modelId,
    provider: model.provider,
    raw: payload,
  };
}

function looksLikeJson(bytes: Buffer): boolean {
  const first = bytes.find(byte => ![9, 10, 13, 32].includes(byte));
  return first === 123 || first === 91;
}

async function readAudioResponse(
  response: Response,
  provider: string,
  fallbackContentType: string,
  model: ProviderModel
): Promise<ProviderSpeechResponse> {
  const contentType = response.headers.get('content-type')?.split(';')[0] || fallbackContentType;

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenProviderError(
      `${provider} text-to-speech failed with status ${response.status}.`,
      response.status,
      detail
    );
  }

  if (
    contentType.startsWith('audio/') ||
    contentType === 'application/octet-stream' ||
    contentType === 'binary/octet-stream'
  ) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (looksLikeJson(bytes)) {
      const decoded = parseJsonAudioPayload(bytes.toString('utf8'), provider, fallbackContentType, model);
      if (decoded) {
        return decoded;
      }
    }

    if (bytes.byteLength <= 0) {
      throw new OpenProviderError(`${provider} returned empty audio output.`, 502);
    }

    return {
      bytes,
      contentType: contentType.startsWith('audio/') ? contentType : fallbackContentType,
      model: model.modelId,
      provider: model.provider,
    };
  }

  const text = await response.text();
  const decoded = parseJsonAudioPayload(text, provider, fallbackContentType, model);
  if (!decoded) {
    throw new OpenProviderError(`${provider} did not return audio output.`, 502, text);
  }

  return decoded;
}

function groqDefaultVoice(modelId: string): string {
  return modelId.includes('arabic') ? 'fahad' : 'troy';
}

function cloudflareSpeechBody(model: ProviderModel, body: SpeechBody): Record<string, unknown> {
  const input = requiredInput(body);

  if (model.modelId.includes('melotts')) {
    return {
      prompt: input,
      lang: optionalString(body.lang) ?? optionalString(body.language) ?? 'en',
    };
  }

  const requestBody: Record<string, unknown> = {
    text: input,
  };
  const voice = optionalString(body.voice);
  const format = optionalString(body.response_format ?? body.responseFormat);
  const encoding = format ? cloudflareAudioEncoding(normalizeResponseFormat(format, 'mp3')) : undefined;
  const container = format ? cloudflareAudioContainer(normalizeResponseFormat(format, 'mp3')) : undefined;
  const sampleRate = optionalNumber(body.sample_rate ?? body.sampleRate);
  const bitRate = optionalNumber(body.bit_rate ?? body.bitRate);

  if (voice) {
    requestBody.speaker = voice;
  }

  if (encoding) {
    requestBody.encoding = encoding;
  }

  if (container) {
    requestBody.container = container;
  }

  if (sampleRate !== undefined) {
    requestBody.sample_rate = sampleRate;
  }

  if (bitRate !== undefined) {
    requestBody.bit_rate = bitRate;
  }

  return requestBody;
}

async function synthesizeCloudflareSpeech(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: SpeechBody
): Promise<ProviderSpeechResponse> {
  const provider = config.providers.cloudflare;
  const format = normalizeResponseFormat(body.response_format ?? body.responseFormat, 'mp3');
  const response = await fetch(cloudflareRunEndpoint(provider.modelsBaseUrl, model.modelId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: contentTypeForFormat(format),
    },
    body: JSON.stringify(cloudflareSpeechBody(model, body)),
  });

  return readAudioResponse(response, model.provider, contentTypeForFormat(format), model);
}

async function synthesizeOpenAiCompatibleSpeech(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: SpeechBody
): Promise<ProviderSpeechResponse> {
  const provider = config.providers[model.provider];
  const requestedFormat = body.response_format ?? body.responseFormat;
  const format = model.provider === 'groq'
    ? groqResponseFormat(requestedFormat)
    : normalizeResponseFormat(requestedFormat, 'mp3');
  const voice = optionalString(body.voice)
    ?? (model.provider === 'groq' ? groqDefaultVoice(model.modelId) : 'alloy');
  const requestBody: Record<string, unknown> = {
    model: model.modelId,
    input: requiredInput(body),
    voice,
    response_format: format,
  };
  const speed = optionalNumber(body.speed);

  if (speed !== undefined) {
    requestBody.speed = speed;
  }

  if (body.provider !== undefined) {
    requestBody.provider = body.provider;
  }

  const response = await fetch(speechEndpoint(provider.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: contentTypeForFormat(format),
    },
    body: JSON.stringify(requestBody),
  });

  return readAudioResponse(response, model.provider, contentTypeForFormat(format), model);
}

async function synthesizeMistralSpeech(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: SpeechBody
): Promise<ProviderSpeechResponse> {
  const provider = config.providers.mistral;
  const format = normalizeResponseFormat(body.response_format ?? body.responseFormat, 'mp3');
  const requestBody: Record<string, unknown> = {
    model: model.modelId,
    input: requiredInput(body),
    response_format: format,
  };
  const voiceId = optionalString(body.voice_id ?? body.voiceId ?? body.voice);
  const refAudio = optionalString(body.ref_audio ?? body.refAudio);

  if (!voiceId && !refAudio) {
    throw new OpenProviderError('Mistral text-to-speech requires voice_id, voiceId, voice, ref_audio, or refAudio.', 400);
  }

  if (voiceId) {
    requestBody.voice_id = voiceId;
  }

  if (refAudio) {
    requestBody.ref_audio = refAudio;
  }

  if (body.stream !== undefined) {
    requestBody.stream = body.stream;
  }

  const response = await fetch(speechEndpoint(provider.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  return readAudioResponse(response, model.provider, contentTypeForFormat(format), model);
}

export async function synthesizeProviderSpeech(
  config: OpenProviderConfig,
  model: ProviderModel,
  body: SpeechBody
): Promise<ProviderSpeechResponse> {
  const provider = config.providers[model.provider];

  if (!provider?.enabled || !provider.apiKey.trim()) {
    throw new OpenProviderError(`${model.provider} API key is not configured.`, 503);
  }

  if (categorizeModel(model) !== 'audio') {
    throw new OpenProviderError(`Model "${model.id}" does not support text-to-speech.`, 400);
  }

  if (model.provider === 'cloudflare') {
    return synthesizeCloudflareSpeech(config, model, body);
  }

  if (model.provider === 'groq' || model.provider === 'openrouter') {
    return synthesizeOpenAiCompatibleSpeech(config, model, body);
  }

  if (model.provider === 'mistral') {
    return synthesizeMistralSpeech(config, model, body);
  }

  throw new OpenProviderError(`${model.provider} text-to-speech is not implemented yet.`, 501);
}
