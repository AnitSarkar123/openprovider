import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const SENSITIVE_PATH_PATTERNS = [
  /^\/\.env(?:\.|$)/i,
  /^\/.*(?:^|\/)\.(?:git|svn|hg)(?:\/|$)/i,
  /\.(?:pem|key|crt|p12|pfx|sqlite|db)$/i,
];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-DNS-Prefetch-Control': 'on',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy': [
    'camera=()',
    'microphone=(self)',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'browsing-topics=()',
  ].join(', '),
  'Origin-Agent-Cluster': '?1',
  'X-Permitted-Cross-Domain-Policies': 'none',
};
const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
};

const V1_CORS_ALLOW_HEADERS = 'authorization, content-type';
const V1_CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';

type RateLimitBucket = {
  windowStartedAt: number;
  count: number;
  blockedUntil: number;
};

type RateLimitPolicy = {
  id: string;
  label: string;
  max: number;
  windowMs: number;
  blockMs: number;
};

type RateLimitResult = {
  policy: RateLimitPolicy;
  retryAfterMs: number;
};

type RateLimitState = {
  buckets: Map<string, RateLimitBucket>;
  lastCleanupAt: number;
};

const RATE_LIMIT_STATE_KEY = '__openproviderProxyRateLimitState';
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 1000;

function sharedRateLimitState(): RateLimitState {
  const globalStore = globalThis as typeof globalThis & {
    [RATE_LIMIT_STATE_KEY]?: RateLimitState;
  };

  if (!globalStore[RATE_LIMIT_STATE_KEY]) {
    globalStore[RATE_LIMIT_STATE_KEY] = {
      buckets: new Map(),
      lastCleanupAt: 0,
    };
  }

  return globalStore[RATE_LIMIT_STATE_KEY];
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function rateLimitEnabled(): boolean {
  return process.env.OPENPROVIDER_RATE_LIMIT_ENABLED?.trim().toLowerCase() !== 'false';
}

function rateLimitPolicies(pathname: string): RateLimitPolicy[] {
  if (isHealthRoute(pathname)) {
    return [];
  }

  const apiRoute = isOpenProviderApiRoute(pathname);
  const appApiRoute = pathname.startsWith('/api/');

  if (apiRoute) {
    return [
      {
        id: 'v1-burst',
        label: 'OpenProvider API burst',
        max: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_API_BURST_MAX', 100),
        windowMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_API_BURST_WINDOW_MS', 1000),
        blockMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_BLOCK_MS', 10 * 60 * 1000),
      },
      {
        id: 'v1-sustained',
        label: 'OpenProvider API sustained',
        max: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_API_SUSTAINED_MAX', 600),
        windowMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_API_SUSTAINED_WINDOW_MS', 60 * 1000),
        blockMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_BLOCK_MS', 10 * 60 * 1000),
      },
    ];
  }

  if (appApiRoute) {
    return [
      {
        id: 'app-api-burst',
        label: 'App API burst',
        max: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_APP_API_BURST_MAX', 60),
        windowMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_APP_API_BURST_WINDOW_MS', 1000),
        blockMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_BLOCK_MS', 10 * 60 * 1000),
      },
      {
        id: 'app-api-sustained',
        label: 'App API sustained',
        max: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_APP_API_SUSTAINED_MAX', 300),
        windowMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_APP_API_SUSTAINED_WINDOW_MS', 60 * 1000),
        blockMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_BLOCK_MS', 10 * 60 * 1000),
      },
    ];
  }

  return [
    {
      id: 'page-burst',
      label: 'Page burst',
      max: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_PAGE_BURST_MAX', 80),
      windowMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_PAGE_BURST_WINDOW_MS', 1000),
      blockMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_BLOCK_MS', 10 * 60 * 1000),
    },
    {
      id: 'page-sustained',
      label: 'Page sustained',
      max: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_PAGE_SUSTAINED_MAX', 480),
      windowMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_PAGE_SUSTAINED_WINDOW_MS', 60 * 1000),
      blockMs: readPositiveInteger('OPENPROVIDER_RATE_LIMIT_BLOCK_MS', 10 * 60 * 1000),
    },
  ];
}

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('true-client-ip')?.trim() ||
    forwardedFor ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function bearerTokenFromRequest(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return token || null;
}

async function hashSensitiveValue(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }

  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function rateLimitIdentities(request: NextRequest, pathname: string): Promise<string[]> {
  const ip = clientIp(request);
  const bearerToken = isOpenProviderApiRoute(pathname) ? bearerTokenFromRequest(request) : null;
  if (!bearerToken) {
    return [`ip:${ip}`];
  }

  const tokenHash = await hashSensitiveValue(bearerToken);
  return tokenHash ? [`key:${tokenHash}`, `ip:${ip}`] : [`ip:${ip}`];
}

function cleanupRateLimitState(state: RateLimitState, now: number, policies: RateLimitPolicy[]): void {
  const maxEntries = readPositiveInteger('OPENPROVIDER_RATE_LIMIT_MAX_ENTRIES', 20000);
  if (now - state.lastCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS && state.buckets.size <= maxEntries) {
    return;
  }

  const longestWindowMs = Math.max(...policies.map(policy => policy.windowMs), 60 * 1000);
  const longestBlockMs = Math.max(...policies.map(policy => policy.blockMs), 10 * 60 * 1000);
  const expireBefore = now - Math.max(longestWindowMs, longestBlockMs);

  for (const [key, bucket] of state.buckets) {
    if (bucket.blockedUntil <= now && bucket.windowStartedAt < expireBefore) {
      state.buckets.delete(key);
    }
  }

  state.lastCleanupAt = now;
}

async function enforceRateLimit(request: NextRequest, pathname: string): Promise<RateLimitResult | null> {
  if (!rateLimitEnabled()) {
    return null;
  }

  const policies = rateLimitPolicies(pathname);
  if (policies.length === 0) {
    return null;
  }

  const state = sharedRateLimitState();
  const now = Date.now();
  cleanupRateLimitState(state, now, policies);

  const identities = await rateLimitIdentities(request, pathname);

  for (const policy of policies) {
    for (const identity of identities) {
      const bucketKey = `${policy.id}:${identity}`;
      const existing = state.buckets.get(bucketKey);
      if (existing && existing.blockedUntil > now) {
        return {
          policy,
          retryAfterMs: existing.blockedUntil - now,
        };
      }
    }

    for (const identity of identities) {
      const bucketKey = `${policy.id}:${identity}`;
      const existing = state.buckets.get(bucketKey);
      const bucket = existing && now - existing.windowStartedAt < policy.windowMs
        ? existing
        : { windowStartedAt: now, count: 0, blockedUntil: 0 };

      bucket.count += 1;

      if (bucket.count > policy.max) {
        bucket.blockedUntil = now + policy.blockMs;
        state.buckets.set(bucketKey, bucket);
        return {
          policy,
          retryAfterMs: policy.blockMs,
        };
      }

      state.buckets.set(bucketKey, bucket);
    }
  }

  return null;
}

function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));

  return NextResponse.json(
    {
      error: {
        message: 'Too many requests. Try again later.',
        code: 'rate_limited',
      },
    },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Policy': result.policy.label,
        'X-RateLimit-Limit': String(result.policy.max),
        'X-RateLimit-Window': String(Math.ceil(result.policy.windowMs / 1000)),
      },
    }
  );
}

function isVscodeConnectRoute(pathname: string): boolean {
  return pathname === '/api/vscode/connect';
}

function contentSecurityPolicy(isDev: boolean, pathname: string): string {
  if (isVscodeConnectRoute(pathname)) {
    return [
      "default-src 'none'",
      'form-action http://127.0.0.1:* http://localhost:*',
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join('; ');
  }

  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' https:"
    : "'self' 'unsafe-inline' 'unsafe-eval' https:";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-src 'self' https:",
    "child-src 'self' https: blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function configuredV1CorsOrigins(): Set<string> {
  return new Set(
    (process.env.OPENPROVIDER_V1_CORS_ORIGINS ?? '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin))
  );
}

function allowedV1CorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) {
    return null;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return null;
  }

  if (normalizedOrigin === request.nextUrl.origin) {
    return normalizedOrigin;
  }

  return configuredV1CorsOrigins().has(normalizedOrigin) ? normalizedOrigin : null;
}

function configuredAppOrigins(): Set<string> {
  return new Set(
    [
      process.env.NEXTAUTH_URL,
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.OPENPROVIDER_BASE_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : undefined,
    ]
      .map(origin => origin?.trim())
      .filter((origin): origin is string => Boolean(origin))
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin))
  );
}

function isFirstPartyOrigin(request: NextRequest, origin: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  if (normalizedOrigin === request.nextUrl.origin) {
    return true;
  }

  return configuredAppOrigins().has(normalizedOrigin);
}

function applyV1CorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (!origin) {
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Headers', V1_CORS_ALLOW_HEADERS);
  response.headers.set('Access-Control-Allow-Methods', V1_CORS_ALLOW_METHODS);
  response.headers.set('Vary', 'Origin');
  return response;
}

function authIsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      (process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim())
  );
}

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  response.headers.set(
    'Content-Security-Policy',
    contentSecurityPolicy(process.env.NODE_ENV !== 'production', request.nextUrl.pathname)
  );

  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

function applyNoStoreHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}

function isSensitivePath(pathname: string): boolean {
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return true;
  }

  return SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(decodedPath));
}

function isAuthRoute(pathname: string): boolean {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

function isCronRoute(pathname: string): boolean {
  return pathname === '/api/cron' || pathname.startsWith('/api/cron/');
}

function isHealthRoute(pathname: string): boolean {
  return pathname === '/health' || pathname === '/api/health' || pathname === '/v1/health';
}

function isOpenProviderApiRoute(pathname: string): boolean {
  return pathname === '/v1' || pathname.startsWith('/v1/');
}

function isPublicCatalogApiRoute(pathname: string, method: string): boolean {
  return pathname === '/api/models' && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function isPublicPage(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/models' ||
    pathname.startsWith('/models/') ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/playground' ||
    pathname === '/speech' ||
    pathname === '/vision'
  );
}

function requiresSession(pathname: string): boolean {
  if (isPublicPage(pathname) || isAuthRoute(pathname) || isCronRoute(pathname) || isHealthRoute(pathname) || isOpenProviderApiRoute(pathname)) {
    return false;
  }

  return pathname.startsWith('/api/') || !pathname.includes('.');
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function hasCrossSiteOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    return !isFirstPartyOrigin(request, origin);
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === 'cross-site';
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get('next-auth.session-token')?.value ||
      request.cookies.get('__Secure-next-auth.session-token')?.value
  );
}

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: { message: 'Authentication is required for this route.' } },
        { status: 401 }
      )
    );
  }

  const signInUrl = new URL('/', request.url);
  signInUrl.searchParams.set('auth', 'signin');
  signInUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
  return applyNoStoreHeaders(NextResponse.redirect(signInUrl));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const v1CorsOrigin = isOpenProviderApiRoute(pathname) ? allowedV1CorsOrigin(request) : null;

  const rateLimitResult = await enforceRateLimit(request, pathname);
  if (rateLimitResult) {
    return applySecurityHeaders(
      applyV1CorsHeaders(rateLimitResponse(rateLimitResult), v1CorsOrigin),
      request
    );
  }

  if (isSensitivePath(pathname)) {
    return applySecurityHeaders(new NextResponse(null, { status: 404 }), request);
  }

  if (isOpenProviderApiRoute(pathname)) {
    const requestOrigin = request.headers.get('origin');
    if (requestOrigin && !v1CorsOrigin) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: { message: 'This origin is not allowed to call the OpenProvider API.' } },
          { headers: NO_STORE_HEADERS, status: 403 }
        ),
        request
      );
    }

    if (!v1CorsOrigin && hasCrossSiteOrigin(request)) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: { message: 'Cross-site OpenProvider API requests are not allowed.' } },
          { headers: NO_STORE_HEADERS, status: 403 }
        ),
        request
      );
    }

    if (request.method.toUpperCase() === 'OPTIONS') {
      return applySecurityHeaders(
        applyV1CorsHeaders(new NextResponse(null, { status: 204 }), v1CorsOrigin),
        request
      );
    }
  }

  if (
    pathname.startsWith('/api/') &&
    !isAuthRoute(pathname) &&
    isUnsafeMethod(request.method) &&
    hasCrossSiteOrigin(request)
  ) {
    return applySecurityHeaders(
      NextResponse.json(
        { error: { message: 'Cross-site API requests are not allowed.' } },
        { headers: NO_STORE_HEADERS, status: 403 }
      ),
      request
    );
  }

  if (!isVscodeConnectRoute(pathname) && !isPublicCatalogApiRoute(pathname, request.method) && requiresSession(pathname)) {
    if (!authIsConfigured()) {
      return applySecurityHeaders(unauthorizedResponse(request), request);
    }

    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    });

    if (!token && !hasSessionCookie(request)) {
      return applySecurityHeaders(unauthorizedResponse(request), request);
    }
  }

  return applySecurityHeaders(
    applyV1CorsHeaders(NextResponse.next(), v1CorsOrigin),
    request
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt)$).*)',
  ],
};
