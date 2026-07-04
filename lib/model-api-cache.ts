export const MODEL_API_CACHE_VERSION = 'models-2026-05-22-2';

export function withModelApiCacheVersion(params: URLSearchParams): URLSearchParams {
  params.set('cacheVersion', MODEL_API_CACHE_VERSION);
  return params;
}
