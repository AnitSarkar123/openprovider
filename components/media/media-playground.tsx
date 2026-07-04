'use client';

import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Palette,
  UploadCloud,
  Volume2,
  Wand2,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { UiModel } from '../models/model-explorer';
import { withModelApiCacheVersion } from '@/lib/model-api-cache';
import { providerName } from '@/lib/provider-meta';

type PlaygroundMode = 'all' | 'image' | 'speech' | 'vision';
type MediaToolMode = Exclude<PlaygroundMode, 'all'>;

type ModelsPayload = {
  data?: UiModel[];
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type ImageOutput = {
  src: string;
  prompt?: string;
};

function modelOptionLabel(model: UiModel): string {
  return `${providerName(model.provider)}: ${model.name}`;
}

function normalizeToolMode(value: string | null): MediaToolMode | null {
  if (value === 'image' || value === 'speech' || value === 'vision') {
    return value;
  }

  return null;
}

function extractImageOutputs(payload: unknown): ImageOutput[] {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const data = Array.isArray(record.data) ? record.data : [];

  return data.flatMap(item => {
    const image = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const url = typeof image.url === 'string' ? image.url : '';
    const b64Json = typeof image.b64_json === 'string' ? image.b64_json : '';
    const prompt = typeof image.revised_prompt === 'string' ? image.revised_prompt : undefined;

    if (url) {
      return [{ src: url, prompt }];
    }

    if (b64Json) {
      return [{
        src: b64Json.startsWith('data:') ? b64Json : `data:image/png;base64,${b64Json}`,
        prompt,
      }];
    }

    return [];
  });
}

function extractAnalysisText(payload: unknown): string {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const data = Array.isArray(record.data) ? record.data : [];
  const firstData = data[0] && typeof data[0] === 'object' ? data[0] as Record<string, unknown> : {};
  if (typeof firstData.text === 'string' && firstData.text.trim()) {
    return firstData.text.trim();
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
  const message = firstChoice.message && typeof firstChoice.message === 'object'
    ? firstChoice.message as Record<string, unknown>
    : {};

  return typeof message.content === 'string' ? message.content.trim() : '';
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as ApiErrorPayload;
    return payload.error?.message || fallback;
  } catch {
    return fallback;
  }
}

function selectedModelCopy(model: UiModel | undefined, fallback: string): string {
  return model ? modelOptionLabel(model) : fallback;
}

function normalizedModelKey(value: string): string {
  return value.trim().toLowerCase();
}

function modelMatchesId(model: UiModel, modelId: string): boolean {
  const target = normalizedModelKey(modelId);
  if (!target) {
    return false;
  }

  return [
    model.id,
    model.modelId,
    `${model.provider}/${model.modelId}`,
  ].some(value => normalizedModelKey(value) === target);
}

function findModelById(models: UiModel[], modelId: string): UiModel | undefined {
  return models.find(model => modelMatchesId(model, modelId));
}

function mergeUniqueModels(...groups: UiModel[][]): UiModel[] {
  const merged = new Map<string, UiModel>();

  for (const group of groups) {
    for (const model of group) {
      const key = normalizedModelKey(model.id);
      if (!key) {
        continue;
      }

      merged.set(key, model);
    }
  }

  return Array.from(merged.values());
}

async function fetchModelGroup(category: UiModel['category'], requestedModel: string, signal: AbortSignal): Promise<UiModel[]> {
  const baseParams = new URLSearchParams({
    category,
    facets: 'false',
    providerResults: 'false',
    limit: '100',
    public: 'true',
  });
  const exactParams = new URLSearchParams({
    category,
    facets: 'false',
    providerResults: 'false',
    limit: '20',
    public: 'true',
  });

  if (requestedModel) {
    exactParams.set('q', requestedModel);
  }
  withModelApiCacheVersion(baseParams);
  withModelApiCacheVersion(exactParams);

  const requests = [
    fetch(`/api/models?${baseParams.toString()}`, { cache: 'default', signal }),
    requestedModel ? fetch(`/api/models?${exactParams.toString()}`, { cache: 'default', signal }) : null,
  ].filter((request): request is Promise<Response> => Boolean(request));
  const responses = await Promise.allSettled(requests);
  const groups = await Promise.all(responses.map(async response => {
    if (response.status !== 'fulfilled' || !response.value.ok) {
      return [];
    }

    const payload = await response.value.json() as ModelsPayload;
    return Array.isArray(payload.data) ? payload.data : [];
  }));

  return mergeUniqueModels(...groups);
}

export function MediaPlayground({ mode = 'all' }: { mode?: PlaygroundMode }) {
  const searchParams = useSearchParams();
  const requestedMode = normalizeToolMode(searchParams.get('mode'));
  const requestedModel = searchParams.get('model')?.trim() ?? '';
  const [selectedMode, setSelectedMode] = useState<Exclude<MediaToolMode, 'vision'>>(requestedMode === 'speech' ? 'speech' : 'image');
  const effectiveMode: MediaToolMode = mode === 'image' || mode === 'speech' || mode === 'vision'
    ? mode
    : requestedMode ?? selectedMode;
  const showModeSelector = mode === 'all' && effectiveMode !== 'vision';
  const showImage = effectiveMode === 'image';
  const showSpeech = effectiveMode === 'speech';
  const showAnalysis = effectiveMode === 'vision';

  const [imageModels, setImageModels] = useState<UiModel[]>([]);
  const [speechModels, setSpeechModels] = useState<UiModel[]>([]);
  const [analysisModels, setAnalysisModels] = useState<UiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  const [imageModel, setImageModel] = useState('auto');
  const [imagePrompt, setImagePrompt] = useState('A polished product screenshot of an AI model playground UI on a clean desk, realistic lighting.');
  const [imageSize, setImageSize] = useState('1024x1024');
  const [imageCount, setImageCount] = useState('1');
  const [imageSeed, setImageSeed] = useState('');
  const [imageSteps, setImageSteps] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageOutputs, setImageOutputs] = useState<ImageOutput[]>([]);
  const [imageMeta, setImageMeta] = useState('');

  const [speechModel, setSpeechModel] = useState('auto');
  const [speechInput, setSpeechInput] = useState('Hello from OpenProvider. This speech was generated from the playground.');
  const [voice, setVoice] = useState('');
  const [responseFormat, setResponseFormat] = useState('mp3');
  const [speed, setSpeed] = useState('1');
  const [referenceAudio, setReferenceAudio] = useState<File | null>(null);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const audioUrlRef = useRef('');
  const [speechMeta, setSpeechMeta] = useState('');

  const [analysisModel, setAnalysisModel] = useState('auto');
  const [analysisPrompt, setAnalysisPrompt] = useState('Describe this image and extract any visible text.');
  const [analysisImageUrl, setAnalysisImageUrl] = useState('');
  const [analysisImageFile, setAnalysisImageFile] = useState<File | null>(null);
  const [analysisPreviewUrl, setAnalysisPreviewUrl] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');

  useEffect(() => {
    if (mode === 'all' && requestedMode && requestedMode !== 'vision') {
      setSelectedMode(requestedMode);
    }
  }, [mode, requestedMode]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadModels() {
      try {
        const shouldLoadAnalysis = mode === 'vision' || requestedMode === 'vision';
        const [nextImageModels, nextSpeechModels, nextAnalysisModels] = await Promise.all([
          fetchModelGroup('image', requestedModel, controller.signal),
          fetchModelGroup('audio', requestedModel, controller.signal),
          shouldLoadAnalysis ? fetchModelGroup('vision', requestedModel, controller.signal) : Promise.resolve([]),
        ]);

        if (!controller.signal.aborted) {
          setImageModels(nextImageModels);
          setSpeechModels(nextSpeechModels);
          setAnalysisModels(nextAnalysisModels);
        }
      } catch {
        if (!controller.signal.aborted) {
          setImageModels([]);
          setSpeechModels([]);
          setAnalysisModels([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setModelsLoading(false);
        }
      }
    }

    void loadModels();
    return () => controller.abort();
  }, [mode, requestedMode, requestedModel]);

  useEffect(() => {
    if (!requestedModel) {
      return;
    }

    const imageMatch = findModelById(imageModels, requestedModel);
    const speechMatch = findModelById(speechModels, requestedModel);
    const analysisMatch = findModelById(analysisModels, requestedModel);

    if (imageMatch) {
      setImageModel(imageMatch.id);
    }

    if (speechMatch) {
      setSpeechModel(speechMatch.id);
    }

    if (analysisMatch) {
      setAnalysisModel(analysisMatch.id);
    }

    if (mode === 'all' && !requestedMode) {
      if (speechMatch) {
        setSelectedMode('speech');
      } else {
        setSelectedMode('image');
      }
    }
  }, [analysisModels, imageModels, mode, requestedMode, requestedModel, speechModels]);

  useEffect(() => {
    if (!analysisImageFile) {
      setAnalysisPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(analysisImageFile);
    setAnalysisPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [analysisImageFile]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = '';
      }
    };
  }, []);

  const selectedImageModel = useMemo(
    () => findModelById(imageModels, imageModel),
    [imageModel, imageModels]
  );
  const selectedSpeechModel = useMemo(
    () => findModelById(speechModels, speechModel),
    [speechModel, speechModels]
  );
  const selectedAnalysisModel = useMemo(
    () => findModelById(analysisModels, analysisModel),
    [analysisModel, analysisModels]
  );
  const canRunImage = Boolean(imagePrompt.trim()) && !imageLoading;
  const canRunSpeech = Boolean(speechInput.trim()) && !speechLoading;
  const canRunAnalysis = Boolean(analysisImageFile || analysisImageUrl.trim()) && !analysisLoading;
  const currentTitle = showSpeech
    ? 'Speech playground'
    : showAnalysis
      ? 'Image analysis'
      : 'Image playground';
  const currentRoute = showSpeech
    ? '/api/media/speech'
    : showAnalysis
      ? '/api/media/vision'
      : '/api/media/image';
  const currentModelLine = showSpeech
    ? selectedModelCopy(selectedSpeechModel, 'Auto speech route')
    : showAnalysis
      ? selectedModelCopy(selectedAnalysisModel, 'Auto image analysis route')
      : selectedModelCopy(selectedImageModel, 'Auto image route');

  function clearAudioUrl() {
    const currentUrl = audioUrlRef.current;
    audioUrlRef.current = '';
    setAudioUrl('');

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
  }

  function setAudioBlob(blob: Blob) {
    const nextUrl = URL.createObjectURL(blob);
    const currentUrl = audioUrlRef.current;
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
  }

  function handleReferenceAudio(event: ChangeEvent<HTMLInputElement>) {
    setReferenceAudio(event.target.files?.[0] ?? null);
  }

  function handleAnalysisImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAnalysisImageFile(file);
    if (file) {
      setAnalysisImageUrl('');
    }
  }

  async function submitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRunImage) {
      return;
    }

    setImageLoading(true);
    setImageError('');
    setImageOutputs([]);
    setImageMeta('');

    try {
      const body: Record<string, unknown> = {
        model: imageModel,
        prompt: imagePrompt.trim(),
        size: imageSize,
        n: Number.parseInt(imageCount, 10),
        response_format: 'b64_json',
      };

      if (imageSeed.trim()) {
        body.seed = Number.parseInt(imageSeed, 10);
      }

      if (imageSteps.trim()) {
        body.steps = Number.parseInt(imageSteps, 10);
      }

      const response = await fetch('/api/media/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Image generation failed.'));
      }

      const payload = await response.json();
      const outputs = extractImageOutputs(payload);
      setImageOutputs(outputs);
      const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const provider = typeof record.provider === 'string' ? providerName(record.provider) : '';
      const model = typeof record.model === 'string' ? record.model : '';
      setImageMeta([provider, model].filter(Boolean).join(' / '));

      if (outputs.length === 0) {
        setImageError('The provider returned no image output.');
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Image generation failed.');
    } finally {
      setImageLoading(false);
    }
  }

  async function submitSpeech(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRunSpeech) {
      return;
    }

    setSpeechLoading(true);
    setSpeechError('');
    setSpeechMeta('');
    clearAudioUrl();

    try {
      const form = new FormData();
      form.set('model', speechModel);
      form.set('input', speechInput.trim());
      form.set('response_format', responseFormat);
      if (voice.trim()) {
        form.set('voice', voice.trim());
      }
      if (speed.trim()) {
        form.set('speed', speed.trim());
      }
      if (referenceAudio) {
        form.set('ref_audio', referenceAudio);
      }

      const response = await fetch('/api/media/speech', {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Speech generation failed.'));
      }

      const blob = await response.blob();
      setAudioBlob(blob);
      const provider = response.headers.get('X-OpenProvider-Provider');
      const model = response.headers.get('X-OpenProvider-Model');
      setSpeechMeta([provider ? providerName(provider) : '', model].filter(Boolean).join(' / '));
    } catch (error) {
      setSpeechError(error instanceof Error ? error.message : 'Speech generation failed.');
    } finally {
      setSpeechLoading(false);
    }
  }

  async function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRunAnalysis) {
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError('');
    setAnalysisResult('');

    try {
      const form = new FormData();
      form.set('model', analysisModel);
      form.set('prompt', analysisPrompt.trim() || 'Describe this image.');
      if (analysisImageFile) {
        form.set('image', analysisImageFile);
      } else {
        form.set('image_url', analysisImageUrl.trim());
      }

      const response = await fetch('/api/media/vision', {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Image analysis failed.'));
      }

      const payload = await response.json();
      setAnalysisResult(extractAnalysisText(payload) || 'The provider returned no text output.');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Image analysis failed.');
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <div className="media-playground-page">
      <section className="media-toolbar">
        <div className="media-tool-title">
          <span className="hero-kicker">
            <AudioLines size={16} />
            {currentTitle}
          </span>
          <h1>{currentTitle}</h1>
          <p>{currentModelLine}</p>
        </div>

        <div className="media-toolbar-actions">
          {showModeSelector && (
            <div className="media-mode-switch" role="group" aria-label="Choose playground mode">
              <button
                aria-pressed={showImage}
                className={showImage ? 'active' : ''}
                onClick={() => setSelectedMode('image')}
                type="button"
              >
                <ImageIcon size={18} />
                <span>
                  <strong>Image</strong>
                  <small>Text to image</small>
                </span>
              </button>
              <button
                aria-pressed={showSpeech}
                className={showSpeech ? 'active' : ''}
                onClick={() => setSelectedMode('speech')}
                type="button"
              >
                <Volume2 size={18} />
                <span>
                  <strong>Speech</strong>
                  <small>Text to audio</small>
                </span>
              </button>
            </div>
          )}

          <div className="media-route-chip">
            <span>{currentRoute}</span>
          </div>
        </div>
      </section>

      <section className="media-playground-grid single">
        {showImage && (
          <form className="media-card image-card" onSubmit={submitImage}>
            <div className="media-workspace">
              <div className="media-input-pane">
                <div className="media-pane-title">Image setup</div>

                <label className="media-field">
                  <span>Model</span>
                  <select value={imageModel} onChange={event => setImageModel(event.target.value)}>
                    <option value="auto">Auto route</option>
                    {imageModels.map(model => (
                      <option key={model.id} value={model.id}>{modelOptionLabel(model)}</option>
                    ))}
                  </select>
                </label>

                <label className="media-field">
                  <span>Prompt</span>
                  <textarea onChange={event => setImagePrompt(event.target.value)} rows={5} value={imagePrompt} />
                </label>

                <div className="media-field-row media-field-row-3">
                  <label className="media-field">
                    <span>Size</span>
                    <select value={imageSize} onChange={event => setImageSize(event.target.value)}>
                      <option value="1024x1024">1024 x 1024</option>
                      <option value="1024x768">1024 x 768</option>
                      <option value="768x1024">768 x 1024</option>
                      <option value="512x512">512 x 512</option>
                    </select>
                  </label>

                  <label className="media-field">
                    <span>Images</span>
                    <select value={imageCount} onChange={event => setImageCount(event.target.value)}>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="4">4</option>
                    </select>
                  </label>

                  <label className="media-field">
                    <span>Steps</span>
                    <input inputMode="numeric" onChange={event => setImageSteps(event.target.value)} placeholder="Auto" value={imageSteps} />
                  </label>
                </div>

                <label className="media-field">
                  <span>Seed</span>
                  <input inputMode="numeric" onChange={event => setImageSeed(event.target.value)} placeholder="Optional deterministic seed" value={imageSeed} />
                </label>

                <button className="button-link media-run-button" disabled={!canRunImage} type="submit">
                  {imageLoading ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
                  Generate image
                </button>

                <p className="media-route-note">
                  {selectedImageModel
                    ? `Routing through ${modelOptionLabel(selectedImageModel)}`
                    : modelsLoading
                      ? 'Loading image models...'
                      : 'Auto selects the first configured free image model.'}
                </p>
              </div>

              <div className="media-output-pane media-image-output">
                <div className="media-pane-title">Output</div>
                {imageError && (
                  <div className="media-error"><AlertCircle size={16} /> {imageError}</div>
                )}
                {imageOutputs.length > 0 ? (
                  <div className="media-image-grid">
                    {imageOutputs.map((image, index) => (
                      <figure className="media-generated-image" key={`${image.src}-${index}`}>
                        <img alt={image.prompt || `Generated image ${index + 1}`} src={image.src} />
                        <figcaption>
                          <span>{imageMeta || `Generated image ${index + 1}`}</span>
                          <a className="icon-button" download={`openprovider-image-${index + 1}.png`} href={image.src} title="Download image">
                            <Download size={15} />
                          </a>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="media-empty-output">
                    <Palette size={26} />
                    <strong>Generated images appear here</strong>
                    <small>{imageModels.length > 0 || modelsLoading ? 'Ready for image generation.' : 'No configured image models found.'}</small>
                  </div>
                )}
              </div>
            </div>
          </form>
        )}

        {showSpeech && (
          <form className="media-card speech-card" onSubmit={submitSpeech}>
            <div className="media-workspace">
              <div className="media-input-pane">
                <div className="media-pane-title">Speech setup</div>

                <label className="media-field">
                  <span>Model</span>
                  <select value={speechModel} onChange={event => setSpeechModel(event.target.value)}>
                    <option value="auto">Auto route</option>
                    {speechModels.map(model => (
                      <option key={model.id} value={model.id}>{modelOptionLabel(model)}</option>
                    ))}
                  </select>
                </label>

                <label className="media-field">
                  <span>Text</span>
                  <textarea onChange={event => setSpeechInput(event.target.value)} rows={6} value={speechInput} />
                </label>

                <div className="media-field-row media-field-row-3">
                  <label className="media-field">
                    <span>Voice</span>
                    <input onChange={event => setVoice(event.target.value)} placeholder="Auto" value={voice} />
                  </label>

                  <label className="media-field">
                    <span>Format</span>
                    <select value={responseFormat} onChange={event => setResponseFormat(event.target.value)}>
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                      <option value="flac">FLAC</option>
                      <option value="opus">OPUS</option>
                      <option value="aac">AAC</option>
                    </select>
                  </label>

                  <label className="media-field">
                    <span>Speed</span>
                    <input inputMode="decimal" onChange={event => setSpeed(event.target.value)} placeholder="1" value={speed} />
                  </label>
                </div>

                <label className="media-upload-zone compact">
                  <input accept="audio/*" onChange={handleReferenceAudio} type="file" />
                  <span className="media-upload-empty">
                    <Mic2 size={22} />
                    <strong>{referenceAudio ? referenceAudio.name : 'Optional reference audio'}</strong>
                    <small>Used as `ref_audio` for compatible speech models.</small>
                  </span>
                </label>

                <button className="button-link media-run-button" disabled={!canRunSpeech} type="submit">
                  {speechLoading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  Generate speech
                </button>

                <p className="media-route-note">
                  {selectedSpeechModel
                    ? `Routing through ${modelOptionLabel(selectedSpeechModel)}`
                    : modelsLoading
                      ? 'Loading speech models...'
                      : 'Auto selects the first configured free speech model.'}
                </p>
              </div>

              <div className="media-output-pane">
                <div className="media-pane-title">Output</div>
                {speechError && (
                  <div className="media-error"><AlertCircle size={16} /> {speechError}</div>
                )}
                {audioUrl ? (
                  <div className="media-result audio-result">
                    <span>{speechMeta || 'Generated speech'}</span>
                    <audio controls src={audioUrl} />
                    <a className="button-link secondary media-download-link" download={`openprovider-speech.${responseFormat}`} href={audioUrl}>
                      <Download size={15} />
                      Download audio
                    </a>
                  </div>
                ) : (
                  <div className="media-empty-output">
                    <Volume2 size={26} />
                    <strong>Speech appears here</strong>
                    <small>{speechModels.length > 0 || modelsLoading ? 'Ready for speech synthesis.' : 'No configured speech models found.'}</small>
                  </div>
                )}
              </div>
            </div>
          </form>
        )}

        {showAnalysis && (
          <form className="media-card analysis-card" onSubmit={submitAnalysis}>
            <div className="media-workspace">
              <div className="media-input-pane">
                <div className="media-pane-title">Image analysis setup</div>

                <label className="media-field">
                  <span>Model</span>
                  <select value={analysisModel} onChange={event => setAnalysisModel(event.target.value)}>
                    <option value="auto">Auto route</option>
                    {analysisModels.map(model => (
                      <option key={model.id} value={model.id}>{modelOptionLabel(model)}</option>
                    ))}
                  </select>
                </label>

                <label className={`media-upload-zone${analysisPreviewUrl ? ' has-preview' : ''}`}>
                  <input accept="image/*" onChange={handleAnalysisImageFile} type="file" />
                  {analysisPreviewUrl ? (
                    <img alt="Selected image preview" src={analysisPreviewUrl} />
                  ) : (
                    <span className="media-upload-empty">
                      <UploadCloud size={24} />
                      <strong>Upload image</strong>
                      <small>PNG, JPEG, GIF, or WebP up to 20 MB</small>
                    </span>
                  )}
                </label>

                <label className="media-field">
                  <span>Or image URL</span>
                  <input
                    disabled={Boolean(analysisImageFile)}
                    onChange={event => setAnalysisImageUrl(event.target.value)}
                    placeholder="https://example.com/image.png"
                    type="url"
                    value={analysisImageUrl}
                  />
                </label>

                <label className="media-field">
                  <span>Prompt</span>
                  <textarea onChange={event => setAnalysisPrompt(event.target.value)} rows={4} value={analysisPrompt} />
                </label>

                <button className="button-link media-run-button" disabled={!canRunAnalysis} type="submit">
                  {analysisLoading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  Analyze image
                </button>
              </div>

              <div className="media-output-pane">
                <div className="media-pane-title">Output</div>
                {analysisError && (
                  <div className="media-error"><AlertCircle size={16} /> {analysisError}</div>
                )}
                {analysisResult ? (
                  <div className="media-result">
                    <span>{selectedModelCopy(selectedAnalysisModel, 'Image analysis result')}</span>
                    <p>{analysisResult}</p>
                  </div>
                ) : (
                  <div className="media-empty-output">
                    <ImageIcon size={26} />
                    <strong>Analysis appears here</strong>
                    <small>{analysisModels.length > 0 || modelsLoading ? 'Ready for image analysis.' : 'No configured image analysis models found.'}</small>
                  </div>
                )}
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
