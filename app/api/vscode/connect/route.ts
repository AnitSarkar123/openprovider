import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authIsConfigured, authOptions } from '@/lib/auth';
import {
  buildVscodeDirectCredentialBundle,
  encodeVscodeDirectCredentialBundle,
} from '@/lib/openprovider/vscode-direct-credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlResponse(html: string, status = 200): NextResponse {
  return new NextResponse(html, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; form-action http://127.0.0.1:* http://localhost:*; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

function errorPage(title: string, detail: string, status = 400): NextResponse {
  return htmlResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { align-items: center; background: #07080d; color: #f8fafc; display: flex; font: 15px system-ui, sans-serif; justify-content: center; min-height: 100vh; margin: 0; }
      main { border: 1px solid rgba(255,255,255,.12); border-radius: 12px; max-width: 32rem; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { color: rgba(248,250,252,.68); line-height: 1.6; margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
    </main>
  </body>
</html>`,
    status
  );
}

function readLoopbackRedirect(raw: string | null): URL | null {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:') return null;
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
    if (!url.port) return null;

    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;

    return url;
  } catch {
    return null;
  }
}

function callbackPage(params: {
  directCredentials: string;
  redirectUri: URL;
  state: string;
}): NextResponse {
  return htmlResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenProvider VS Code connection</title>
    <style>
      body { align-items: center; background: #07080d; color: #f8fafc; display: flex; font: 15px system-ui, sans-serif; justify-content: center; min-height: 100vh; margin: 0; }
      main { border: 1px solid rgba(255,255,255,.12); border-radius: 12px; max-width: 32rem; padding: 24px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { color: rgba(248,250,252,.68); line-height: 1.6; margin: 0 0 18px; }
      form { margin: 0; }
      .connection-action { align-items: center; background: #f8fafc; border: 0; border-radius: 999px; color: #07080d; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; gap: 8px; min-height: 42px; padding: 0 16px; transition: background .28s ease, box-shadow .28s ease, color .28s ease, transform .28s ease; }
      .connection-action:disabled { cursor: default; opacity: 1; }
      .connection-action.is-connecting { animation: connectPulse 1s ease-in-out infinite; background: rgba(34,197,94,.16); box-shadow: 0 0 0 1px rgba(34,197,94,.38), 0 12px 32px rgba(34,197,94,.12); color: #86efac; }
      .connection-action.is-disconnect { animation: disconnectPop .38s ease-out; background: rgba(239,68,68,.16); box-shadow: 0 0 0 1px rgba(239,68,68,.42), 0 12px 32px rgba(239,68,68,.12); color: #fca5a5; }
      .status-dot { background: currentColor; border-radius: 999px; height: 8px; width: 8px; }
      @keyframes connectPulse { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
      @keyframes disconnectPop { 0% { transform: scale(.96); } 70% { transform: scale(1.04); } 100% { transform: scale(1); } }
    </style>
  </head>
  <body>
    <main>
      <h1>Connecting OpenProvider to VS Code...</h1>
      <p>This page will close after VS Code receives your provider credentials.</p>
      <form method="post" action="${escapeHtml(params.redirectUri.toString())}">
        <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
        <input type="hidden" name="direct_credentials" value="${escapeHtml(params.directCredentials)}" />
        <button class="connection-action" id="connectButton" type="submit">
          <span class="status-dot"></span>
          <span id="connectionLabel">Connect</span>
        </button>
      </form>
      <script>
        const form = document.forms[0];
        const button = document.getElementById('connectButton');
        const label = document.getElementById('connectionLabel');
        let started = false;

        function startConnection(event) {
          event?.preventDefault();
          if (started) return;
          started = true;
          button?.classList.add('is-connecting');
          if (button) button.disabled = true;
          if (label) label.textContent = 'Connecting...';

          window.setTimeout(() => {
            button?.classList.remove('is-connecting');
            button?.classList.add('is-disconnect');
            if (label) label.textContent = 'Disconnect';
          }, 650);

          window.setTimeout(() => form.submit(), 1000);
        }

        form.addEventListener('submit', startConnection);
        window.setTimeout(startConnection, 120);
      </script>
    </main>
  </body>
</html>`
  );
}

export async function GET(request: NextRequest) {
  if (!authIsConfigured()) {
    return errorPage(
      'Google sign-in is not configured',
      'OpenProvider needs Google OAuth before VS Code can request provider credentials.',
      503
    );
  }

  const redirectUri = readLoopbackRedirect(request.nextUrl.searchParams.get('redirect_uri'));
  const state = request.nextUrl.searchParams.get('state')?.trim() ?? '';
  if (!redirectUri || state.length < 24) {
    return errorPage(
      'Invalid VS Code login request',
      'The callback URL must be a local loopback URL and include a secure state value.'
    );
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) {
    const signInUrl = new URL('/api/auth/signin/google', request.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', request.nextUrl.toString());
    return NextResponse.redirect(signInUrl);
  }

  try {
    const directCredentials = encodeVscodeDirectCredentialBundle(
      await buildVscodeDirectCredentialBundle(userId)
    );
    if (!directCredentials) {
      return errorPage(
        'No provider credentials found',
        'Save at least one working provider API key in Account -> Provider setup, then sign in from VS Code again.',
        409
      );
    }

    return callbackPage({
      directCredentials,
      redirectUri,
      state,
    });
  } catch (error) {
    return errorPage(
      'Unable to prepare VS Code provider credentials',
      error instanceof Error ? error.message : 'Try again from VS Code.',
      503
    );
  }
}
