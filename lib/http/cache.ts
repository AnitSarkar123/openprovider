type ModelListCacheOptions = {
  refresh?: boolean;
  browserMaxAgeSeconds?: number;
  maxAgeSeconds?: number;
  staleSeconds?: number;
  userSpecific?: boolean;
};

export function modelListCacheHeaders({
  refresh = false,
  browserMaxAgeSeconds = 60,
  maxAgeSeconds = 300,
  staleSeconds = 600,
  userSpecific = false,
}: ModelListCacheOptions = {}): HeadersInit {
  if (refresh) {
    return {
      'Cache-Control': 'no-store',
    };
  }

  if (userSpecific) {
    return {
      'Cache-Control': 'private, no-cache, max-age=0, must-revalidate',
      Vary: 'Cookie, Authorization',
    };
  }

  return {
    'Cache-Control': `public, max-age=${browserMaxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${staleSeconds}`,
    'CDN-Cache-Control': `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleSeconds}`,
    'Surrogate-Control': `max-age=${maxAgeSeconds}, stale-while-revalidate=${staleSeconds}`,
  };
}

type PrivateBrowserCacheOptions = {
  maxAgeSeconds?: number;
  staleSeconds?: number;
};

export function privateBrowserCacheHeaders(_options: PrivateBrowserCacheOptions = {}): HeadersInit {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Vary: 'Cookie, Authorization',
  };
}
