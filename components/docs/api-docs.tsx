'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Bookmark,
  BookOpen,
  Bot,
  Check,
  Code2,
  Copy,
  Database,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  ListChecks,
  Loader2,
  MessageSquareText,
  Play,
  PlugZap,
  Route,
  Search,
  ShieldCheck,
  Terminal,
  Volume2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type EndpointId = 'chat' | 'image' | 'vision' | 'speech';
type Language = 'curl' | 'javascript';
type RoutingMode = 'auto' | 'exact';
type SdkLanguage = 'javascript' | 'python';

type EndpointDoc = {
  id: EndpointId;
  label: string;
  description: string;
  method: 'POST';
  path: string;
  icon: LucideIcon;
  category: string;
  autoModel: string;
  exactModel: string;
  responseLabel: string;
  binary?: boolean;
};

type RunState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  statusCode?: number;
  body?: string;
  audioUrl?: string;
};

const endpointDocs: EndpointDoc[] = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'OpenAI-compatible chat completions with OpenProvider auto fallback.',
    method: 'POST',
    path: '/v1/chat/completions',
    icon: MessageSquareText,
    category: 'Text',
    autoModel: 'openprovider/auto-free',
    exactModel: 'groq/openai/gpt-oss-20b',
    responseLabel: 'JSON chat completion',
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Text-to-image generation through configured free image providers.',
    method: 'POST',
    path: '/v1/images/generations',
    icon: ImageIcon,
    category: 'Image',
    autoModel: 'auto',
    exactModel: 'cloudflare/@cf/black-forest-labs/flux-1-schnell',
    responseLabel: 'JSON image payload',
  },
  {
    id: 'vision',
    label: 'Image analysis',
    description: 'Image understanding from an image URL, data URL, or multipart upload.',
    method: 'POST',
    path: '/v1/images/analyze',
    icon: Eye,
    category: 'Image analysis',
    autoModel: 'auto',
    exactModel: 'cloudflare/@cf/llava-hf/llava-1.5-7b-hf',
    responseLabel: 'JSON analysis payload',
  },
  {
    id: 'speech',
    label: 'Speech',
    description: 'Text-to-speech that returns raw audio bytes.',
    method: 'POST',
    path: '/v1/audio/speech',
    icon: Volume2,
    category: 'Audio',
    autoModel: 'auto',
    exactModel: 'cloudflare/@cf/myshell-ai/melotts',
    responseLabel: 'Audio bytes',
    binary: true,
  },
];

const errorExamples = [
  { code: '401', title: 'authentication_error', text: 'Missing or invalid OpenProvider API key.' },
  { code: '404', title: 'model_not_found', text: 'Exact model is not in the free registry or does not match the endpoint category.' },
  { code: '503', title: 'no_route_available', text: 'No configured free model is currently available for the requested workflow.' },
  { code: '429', title: 'provider_rate_limited', text: 'A provider free tier returned a rate-limit response. Retry later or route to another model.' },
];

const sidebarSections = [
  {
    title: 'Start',
    links: [
      { href: '#overview', label: 'Overview', icon: BookOpen },
      { href: '#setup', label: 'Setup checklist', icon: ListChecks },
      { href: '#workspace', label: 'Account workspace', icon: Database },
    ],
  },
  {
    title: 'Use OpenProvider',
    links: [
      { href: '#catalog', label: 'Model catalog', icon: Search },
      { href: '#chat', label: 'Chat console', icon: MessageSquareText },
      { href: '/docs/vscodeextension', label: 'VS Code extension', icon: Terminal },
      { href: '#media', label: 'Image & speech', icon: ImageIcon },
      { href: '#routing', label: 'Routing logic', icon: Route },
    ],
  },
  {
    title: 'Build',
    links: [
      { href: '#api-keys', label: 'API keys', icon: KeyRound },
      { href: '#openai-compatibility', label: 'OpenAI compatibility', icon: Code2 },
      { href: '#api-reference', label: 'API reference', icon: Terminal },
      { href: '#try-endpoint', label: 'Live examples', icon: Play },
      { href: '#errors', label: 'Errors', icon: AlertCircle },
    ],
  },
];

const tocItems = [
  { href: '#overview', label: 'What OpenProvider does' },
  { href: '#setup', label: 'Setup checklist' },
  { href: '#workspace', label: 'Account workspace' },
  { href: '#catalog', label: 'Model catalog' },
  { href: '#chat', label: 'Chat console' },
  { href: '#media', label: 'Image and speech' },
  { href: '#routing', label: 'Routing logic' },
  { href: '#api-keys', label: 'API keys' },
  { href: '#openai-compatibility', label: 'OpenAI compatibility' },
  { href: '#api-reference', label: 'API reference' },
  { href: '#try-endpoint', label: 'Live examples' },
  { href: '#errors', label: 'Errors' },
];

const docSectionHrefs = sidebarSections
  .flatMap(section => section.links.map(link => link.href))
  .filter(href => href.startsWith('#'));
const docSectionIds = docSectionHrefs.map(href => href.slice(1));

const featureCards = [
  {
    icon: Layers3,
    title: 'Free model catalog',
    text: 'Browse synced free models across text, image generation, image analysis, and speech categories.',
  },
  {
    icon: PlugZap,
    title: 'Provider setup',
    text: 'Save provider credentials once. OpenProvider keeps those provider-native keys on the server.',
  },
  {
    icon: Route,
    title: 'Auto and exact routes',
    text: 'Use auto routing for fallback, or pass an exact model id when you need deterministic provider behavior.',
  },
  {
    icon: KeyRound,
    title: 'OpenProvider API keys',
    text: 'Client apps call OpenProvider with generated keys instead of handling provider credentials directly.',
  },
];

const setupSteps = [
  {
    title: 'Sign in',
    action: 'Open account',
    text: 'Use the account menu to create a personal workspace for provider keys, API keys, saved models, and chat history.',
    href: '/account',
  },
  {
    title: 'Connect providers',
    action: 'Open provider setup',
    text: 'Open Account -> Provider setup and save keys for the free providers you want OpenProvider to route through.',
    href: '/account/providersetup',
  },
  {
    title: 'Check the catalog',
    action: 'Open models',
    text: 'Open Models to confirm synced free models, filter by category, and inspect exact model ids.',
    href: '/models',
  },
  {
    title: 'Generate an API key',
    action: 'Open API keys',
    text: 'Open Account -> API keys and create an OpenProvider key for your application.',
    href: '/account/apikey',
  },
];

const workspaceCards = [
  {
    icon: PlugZap,
    title: 'Provider setup',
    text: 'Add, update, and keep encrypted provider credentials tied to your workspace.',
    href: '/account/providersetup',
  },
  {
    icon: KeyRound,
    title: 'API keys',
    text: 'Create and delete OpenProvider keys for apps that call `/v1/*` routes.',
    href: '/account/apikey',
  },
  {
    icon: Bookmark,
    title: 'Saved models',
    text: 'Bookmark models from the catalog and keep shortcuts for future routes.',
    href: '/account/savedmodels',
  },
  {
    icon: MessageSquareText,
    title: 'Conversations',
    text: 'Review recent chat history saved in your personal workspace.',
    href: '/account/conversations',
  },
];

const apiRoutes = [
  { method: 'GET', path: '/v1/models', label: 'List models', text: 'Returns the free model registry for the authenticated workspace.' },
  { method: 'GET', path: '/v1/providers/status', label: 'Provider status', text: 'Returns configured provider state, discovery errors, and catalog coverage.' },
  ...endpointDocs.map(endpoint => ({
    method: endpoint.method,
    path: endpoint.path,
    label: endpoint.label,
    text: endpoint.description,
  })),
];

const openAiCompatibilityRows = [
  {
    area: 'Base URL',
    support: 'Use your OpenProvider deployment origin plus `/v1` as the OpenAI SDK base URL.',
    example: 'https://openprovider.mimika.in/v1',
  },
  {
    area: 'API key',
    support: 'Use an OpenProvider key from Account. Provider-native keys stay on the server.',
    example: 'opk_live_...',
  },
  {
    area: 'Models',
    support: 'Call `/v1/models` for the working catalog and use `openprovider/auto-free` or an exact model id.',
    example: 'openprovider/auto-free',
  },
  {
    area: 'Chat',
    support: 'OpenAI-compatible `messages`, streaming chunks, tool calls, reasoning metadata, and image parts when the chosen model supports them.',
    example: 'POST /v1/chat/completions',
  },
];

const openAiUseCases = [
  {
    icon: Bot,
    title: 'Swap an OpenAI chat app',
    text: 'Point the existing OpenAI SDK client at OpenProvider, change the key, and start with `openprovider/auto-free` for free-model fallback.',
  },
  {
    icon: Route,
    title: 'Route agents across free models',
    text: 'Use `/v1/models` capabilities to pick models with tools, vision, reasoning, and the context window your agent needs.',
  },
  {
    icon: ShieldCheck,
    title: 'Keep provider keys off clients',
    text: 'Apps only see the OpenProvider key. Groq, Cloudflare, NVIDIA, and other provider credentials remain server-side.',
  },
  {
    icon: Code2,
    title: 'Prototype without rewrites',
    text: 'Keep OpenAI-compatible request shapes for chat while testing multiple free providers and exact model ids.',
  },
];

const openAiSdkSnippets: Array<{
  id: SdkLanguage;
  label: string;
  packageName: string;
  shikiLang: string;
  code: string;
}> = [
  {
    id: 'javascript',
    label: 'JavaScript',
    packageName: 'openai',
    shikiLang: 'javascript',
    code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENPROVIDER_API_KEY,
  baseURL: "https://openprovider.mimika.in/v1"
});

const completion = await client.chat.completions.create({
  model: "openprovider/auto-free",
  messages: [
    { role: "user", content: "Explain this codebase in one paragraph." }
  ],
  stream: true
});

for await (const chunk of completion) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
  },
  {
    id: 'python',
    label: 'Python',
    packageName: 'openai',
    shikiLang: 'python',
    code: `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENPROVIDER_API_KEY"],
    base_url="https://openprovider.mimika.in/v1",
)

response = client.chat.completions.create(
    model="openprovider/auto-free",
    messages=[
        {"role": "user", "content": "Summarize today's support tickets."}
    ],
)

print(response.choices[0].message.content)`,
  },
];

function requestBodyFor(endpoint: EndpointDoc, routingMode: RoutingMode): Record<string, unknown> {
  const model = routingMode === 'auto' ? endpoint.autoModel : endpoint.exactModel;

  if (endpoint.id === 'chat') {
    return {
      model,
      messages: [{ role: 'user', content: 'Explain OpenProvider auto routing in one paragraph.' }],
      temperature: 0.3,
    };
  }

  if (endpoint.id === 'image') {
    return {
      model,
      prompt: 'A clean product screenshot of an AI API dashboard, realistic lighting.',
      size: '1024x1024',
      n: 1,
    };
  }

  if (endpoint.id === 'vision') {
    return {
      model,
      image_url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
      prompt: 'Describe the image and extract any visible text.',
    };
  }

  return {
    model,
    input: 'OpenProvider routes free AI models through one OpenAI-compatible API.',
    voice: 'alloy',
    response_format: 'mp3',
  };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function trimOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '') || 'https://your-openprovider.app';
}

function curlSnippet(endpoint: EndpointDoc, baseUrl: string, apiKey: string, bodyText: string): string {
  const escapedBody = bodyText.replace(/'/g, "'\\''");
  const output = endpoint.binary ? ' \\\n  --output speech.mp3' : '';
  return `curl -X ${endpoint.method} "${trimOrigin(baseUrl)}${endpoint.path}" \\
  -H "Authorization: Bearer ${apiKey || 'opk_live_...'}" \\
  -H "Content-Type: application/json" \\
  --data '${escapedBody}'${output}`;
}

function javascriptSnippet(endpoint: EndpointDoc, baseUrl: string, apiKey: string, bodyText: string): string {
  const resultLine = endpoint.binary
    ? 'const audio = await response.blob();'
    : 'const result = await response.json();';
  const outputLine = endpoint.binary
    ? 'console.log(response.headers.get("x-openprovider-model"), audio.size);'
    : 'console.log(result);';
  return `const response = await fetch("${trimOrigin(baseUrl)}${endpoint.path}", {
  method: "${endpoint.method}",
  headers: {
    Authorization: "Bearer ${apiKey || 'opk_live_...'}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${bodyText})
});

if (!response.ok) {
  throw new Error(await response.text());
}

${resultLine}
${outputLine}`;
}

function safeJsonText(value: unknown): string {
  try {
    return prettyJson(value);
  } catch {
    return String(value);
  }
}

function ShikiCodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let mounted = true;
    setHtml('');

    void import('shiki')
      .then(({ codeToHtml }) => codeToHtml(code, {
        lang,
        theme: 'github-dark',
      }))
      .then(nextHtml => {
        if (mounted) {
          setHtml(nextHtml);
        }
      })
      .catch(() => {
        if (mounted) {
          setHtml('');
        }
      });

    return () => {
      mounted = false;
    };
  }, [code, lang]);

  if (!html) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ApiDocs() {
  const [activeEndpointId, setActiveEndpointId] = useState<EndpointId>('chat');
  const [activeDocHref, setActiveDocHref] = useState('#overview');
  const [routingMode, setRoutingMode] = useState<RoutingMode>('auto');
  const [language, setLanguage] = useState<Language>('curl');
  const [openAiSdkLanguage, setOpenAiSdkLanguage] = useState<SdkLanguage>('javascript');
  const [baseUrl, setBaseUrl] = useState('https://your-openprovider.app');
  const [apiKey, setApiKey] = useState('');
  const activeEndpoint = endpointDocs.find(endpoint => endpoint.id === activeEndpointId) ?? endpointDocs[0];
  const activeOpenAiSdkSnippet = openAiSdkSnippets.find(snippet => snippet.id === openAiSdkLanguage) ?? openAiSdkSnippets[0];
  const [bodyText, setBodyText] = useState(() => prettyJson(requestBodyFor(activeEndpoint, routingMode)));
  const [copied, setCopied] = useState(false);
  const [sdkCopied, setSdkCopied] = useState(false);
  const [pageCopied, setPageCopied] = useState(false);
  const [runState, setRunState] = useState<RunState>({ status: 'idle' });

  // Track a nav-click lock: while set, the scroll listener returns the locked
  // href instead of computing from scroll position. Cleared once scroll fully
  // settles (scrollend event) or after a generous 1200 ms fallback timeout.
  const lockedHrefRef = useRef<string | null>(null);
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // BUG FIX 2: Keep a ref to the previous audioUrl so we can revoke it
  // before replacing it, preventing object-URL memory leaks.
  const prevAudioUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    function updateFromHash() {
      const nextHash = docSectionHrefs.includes(window.location.hash)
        ? window.location.hash
        : '#overview';
      setActiveDocHref(nextHash);
    }
    updateFromHash();
    window.addEventListener('hashchange', updateFromHash);
    return () => window.removeEventListener('hashchange', updateFromHash);
  }, []);

  useEffect(() => {
    const initialHash = window.location.hash;
    if (!docSectionHrefs.includes(initialHash) || initialHash === '#overview') return;

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let finalTimer: ReturnType<typeof setTimeout> | null = null;
    const alignInitialHash = () => {
      const section = document.getElementById(initialHash.slice(1));
      if (!section) return;

      const headerHeightValue = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--site-header-height');
      const headerHeight = Number.parseFloat(headerHeightValue) || 0;
      const top = section.getBoundingClientRect().top + window.scrollY - headerHeight - 24;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    };

    const frame = window.requestAnimationFrame(() => {
      alignInitialHash();
      settleTimer = setTimeout(alignInitialHash, 120);
      finalTimer = setTimeout(alignInitialHash, 420);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
      if (finalTimer) clearTimeout(finalTimer);
    };
  }, []);

  useEffect(() => {
    function computeActiveHref(): string {
      const headerHeightValue = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--site-header-height');
      const headerHeight = Number.parseFloat(headerHeightValue) || 0;
      // Use 35% down the viewport so a section must dominate the visible area.
      const activationLine = headerHeight + window.innerHeight * 0.35;

      let bestHref = '#overview';
      let bestDist = Infinity;

      for (const sectionId of docSectionIds) {
        const section = document.getElementById(sectionId);
        if (!section) continue;
        const top = section.getBoundingClientRect().top;
        if (top > activationLine) continue;
        // Pick the section whose heading is closest (from above) to the line.
        const dist = activationLine - top;
        if (dist < bestDist) {
          bestDist = dist;
          bestHref = `#${sectionId}`;
        }
      }

      return bestHref;
    }

    function updateFromScroll() {
      // While a nav-click lock is active keep that href so scroll cannot
      // override the user's intended selection mid-flight.
      if (lockedHrefRef.current) {
        setActiveDocHref(lockedHrefRef.current);
        return;
      }
      const currentHref = computeActiveHref();
      setActiveDocHref(previous => (previous === currentHref ? previous : currentHref));
    }

    function releaseLockAndSync() {
      lockedHrefRef.current = null;
      if (scrollLockTimerRef.current) {
        clearTimeout(scrollLockTimerRef.current);
        scrollLockTimerRef.current = null;
      }
      setActiveDocHref(computeActiveHref());
    }

    updateFromScroll();
    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', updateFromScroll);
    // scrollend fires once smooth-scroll finishes — perfect time to release
    // the lock. Older browsers fall back to the 1200 ms timer in handleNavClick.
    window.addEventListener('scrollend', releaseLockAndSync);
    return () => {
      window.removeEventListener('scroll', updateFromScroll);
      window.removeEventListener('resize', updateFromScroll);
      window.removeEventListener('scrollend', releaseLockAndSync);
    };
  }, []);

  // BUG FIX 3: Reset body text AND runState whenever the endpoint OR
  // routing mode changes (original code forgot runState on routingMode change).
  useEffect(() => {
    setBodyText(prettyJson(requestBodyFor(activeEndpoint, routingMode)));
    setRunState({ status: 'idle' });
  }, [activeEndpoint, routingMode]);

  // BUG FIX 2: Revoke the previous audio object URL before storing the new
  // one, instead of only revoking on unmount (which leaked URLs across runs).
  useEffect(() => {
    if (runState.audioUrl !== prevAudioUrlRef.current) {
      if (prevAudioUrlRef.current) {
        URL.revokeObjectURL(prevAudioUrlRef.current);
      }
      prevAudioUrlRef.current = runState.audioUrl;
    }
    return () => {
      if (prevAudioUrlRef.current) {
        URL.revokeObjectURL(prevAudioUrlRef.current);
        prevAudioUrlRef.current = undefined;
      }
    };
  }, [runState.audioUrl]);

  const activeSnippet = useMemo(
    () =>
      language === 'curl'
        ? curlSnippet(activeEndpoint, baseUrl, apiKey, bodyText)
        : javascriptSnippet(activeEndpoint, baseUrl, apiKey, bodyText),
    [activeEndpoint, apiKey, baseUrl, bodyText, language],
  );

  async function writeClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  async function copySnippet() {
    await writeClipboard(activeSnippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function copyOpenAiSdkSnippet() {
    await writeClipboard(activeOpenAiSdkSnippet.code);
    setSdkCopied(true);
    window.setTimeout(() => setSdkCopied(false), 1400);
  }

  async function copyPage() {
    await writeClipboard(
      [
        'OpenProvider Docs',
        `${window.location.origin}/docs`,
        '',
        'Setup: sign in, connect provider credentials, confirm the model catalog, then generate an OpenProvider API key.',
        'App: browse models, save models, chat, generate images, analyze images, and create speech.',
        'VS Code extension docs: /docs/vscodeextension.',
        'OpenAI compatibility: set baseURL to /v1, use an OpenProvider API key, and call chat.completions with openprovider/auto-free or an exact model id.',
        'API: send Authorization: Bearer opk_live_... to /v1/models, /v1/chat/completions, /v1/images/generations, /v1/images/analyze, /v1/audio/speech, and /v1/providers/status.',
        'Routing: use auto/openprovider/auto-free for fallback or an exact model id for provider-specific behavior.',
      ].join('\n'),
    );
    setPageCopied(true);
    window.setTimeout(() => setPageCopied(false), 1400);
  }

  // Lock the active href to the clicked link. The lock is released by the
  // scrollend event (modern browsers) or the 1200 ms fallback timer.
  const handleNavClick = useCallback((href: string) => {
    setActiveDocHref(href);
    lockedHrefRef.current = href;
    if (scrollLockTimerRef.current) {
      clearTimeout(scrollLockTimerRef.current);
    }
    scrollLockTimerRef.current = setTimeout(() => {
      lockedHrefRef.current = null;
      scrollLockTimerRef.current = null;
    }, 1200);
  }, []);

  // BUG FIX 4: Switching endpoint tabs in the api-reference section should
  // also update the activeDocHref to '#try-endpoint' so the sidebar and TOC
  // both reflect the user's intent, and scroll the section into view.
  function handleEndpointSelect(id: EndpointId) {
    setActiveEndpointId(id);
    const el = document.getElementById('try-endpoint');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    handleNavClick('#try-endpoint');
  }

  async function runExample() {
    if (!apiKey.trim()) {
      setRunState({
        status: 'error',
        body: prettyJson({
          error: {
            message: 'Enter an OpenProvider API key before running this request.',
            type: 'missing_client_key',
          },
        }),
      });
      return;
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      setRunState({
        status: 'error',
        body: prettyJson({
          error: {
            message: 'Request body must be valid JSON.',
            type: 'invalid_json',
          },
        }),
      });
      return;
    }

    setRunState({ status: 'loading' });

    try {
      const response = await fetch(`${trimOrigin(baseUrl)}${activeEndpoint.path}`, {
        method: activeEndpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsedBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setRunState({
          status: 'error',
          statusCode: response.status,
          body: errorText.trim() || `Request failed with status ${response.status}.`,
        });
        return;
      }

      if (activeEndpoint.binary) {
        const audio = await response.blob();
        setRunState({
          status: 'success',
          statusCode: response.status,
          audioUrl: URL.createObjectURL(audio),
          body: prettyJson({
            contentType: response.headers.get('content-type'),
            model: response.headers.get('x-openprovider-model'),
            provider: response.headers.get('x-openprovider-provider'),
            bytes: audio.size,
          }),
        });
        return;
      }

      const payload = await response.json();
      setRunState({
        status: 'success',
        statusCode: response.status,
        body: safeJsonText(payload),
      });
    } catch (error) {
      setRunState({
        status: 'error',
        body: prettyJson({
          error: {
            message: error instanceof Error ? error.message : 'Request failed.',
            type: 'client_request_error',
          },
        }),
      });
    }
  }

  return (
    <div className="docs-page">
      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          {sidebarSections.map(section => (
            <div className="docs-sidebar-section" key={section.title}>
              <strong>{section.title}</strong>
              {section.links.map(item => {
                const isHashLink = item.href.startsWith('#');
                const active = activeDocHref === item.href;
                const content = (
                  <>
                    <item.icon size={17} />
                    {item.label}
                  </>
                );

                return isHashLink ? (
                  <a
                    aria-current={active ? 'page' : undefined}
                    className={active ? 'active' : ''}
                    href={item.href}
                    key={item.href}
                    onClick={() => handleNavClick(item.href)}
                  >
                    {content}
                  </a>
                ) : (
                  <Link href={item.href} key={item.href}>
                    {content}
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>

        <article className="docs-article">
          <header className="docs-article-header" id="overview">
            <span>Overview</span>
            <div>
              <h1>OpenProvider documentation</h1>
              <button onClick={() => void copyPage()} type="button">
                {pageCopied ? <Check size={16} /> : <Copy size={16} />}
                {pageCopied ? 'Copied' : 'Copy page'}
              </button>
            </div>
            <p>Set up providers, browse free models, use the app, and integrate with the OpenAI-style API.</p>
          </header>

          <section className="docs-prose">
            <p>
              OpenProvider is a free-model gateway. You connect provider credentials once, OpenProvider syncs a free-only
              model catalog, and your apps call one OpenProvider surface for chat, image generation, image analysis, and speech.
            </p>
            <p>
              The web app is for daily work: explore models, save useful routes, chat with text models, test image and speech
              routes, and manage provider/API credentials in Account.
            </p>
            <div className="docs-feature-grid">
              {featureCards.map(card => (
                <article className="docs-feature-card" key={card.title}>
                  <card.icon size={18} />
                  <strong>{card.title}</strong>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="docs-doc-section" id="setup">
            <span>Setup</span>
            <h2>From empty workspace to working route</h2>
            <p>
              A working OpenProvider workspace needs a signed-in account, at least one configured provider, a synced catalog,
              and an OpenProvider API key for external apps.
            </p>
            <ol className="docs-step-list">
              {setupSteps.map((step, index) => (
                <li key={step.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                    <a href={step.href}>
                      {step.action} <Route size={14} />
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="docs-doc-section" id="workspace">
            <span>Account</span>
            <h2>What each account area is for</h2>
            <p>
              Account is the operational center for credentials, API keys, saved model shortcuts, and conversation history.
            </p>
            <div className="docs-link-grid">
              {workspaceCards.map(card => (
                <a className="docs-link-card" href={card.href} key={card.title}>
                  <card.icon size={18} />
                  <strong>{card.title}</strong>
                  <p>{card.text}</p>
                </a>
              ))}
            </div>
          </section>

          <section className="docs-doc-section" id="catalog">
            <span>Models</span>
            <h2>Understand the model catalog</h2>
            <p>
              Models shows the current free registry after provider discovery and free-only filtering. Use it to compare
              providers, inspect context/output limits, save models, and copy exact model ids for API calls.
            </p>
            <div className="docs-principle-grid">
              <article>
                <Search size={18} />
                <strong>Filter by category</strong>
                <p>Text, image generation, vision, and speech are first-class catalog categories, so image output stays separate from image input.</p>
              </article>
              <article>
                <ShieldCheck size={18} />
                <strong>Prefer working models</strong>
                <p>The Working filter uses provider status checks so you can avoid routes that recently failed.</p>
              </article>
              <article>
                <Bookmark size={18} />
                <strong>Save exact routes</strong>
                <p>Saved models become workspace shortcuts for repeated testing and app integration.</p>
              </article>
            </div>
          </section>

          <section className="docs-doc-section" id="chat">
            <span>Chat</span>
            <h2>Use the chat console</h2>
            <p>
              Chat is the fastest way to test text models. Start with OpenProvider Auto Free for fallback across configured
              providers, or switch to a specific model when you need predictable provider behavior.
            </p>
            <div className="docs-command-callout">
              <Bot size={18} />
              <code>{'Chat -> select model -> send prompt -> save conversation in Account'}</code>
            </div>
          </section>

          <section className="docs-doc-section" id="media">
            <span>Playground</span>
            <h2>Generate images, analyze images, and create speech</h2>
            <p>
              The playground is for media workflows. Image routes generate pictures from prompts, image analysis accepts URLs
              or uploads, and speech routes return audio bytes from text prompts.
            </p>
            <div className="docs-link-grid">
              <a className="docs-link-card" href="/playground">
                <ImageIcon size={18} />
                <strong>Media playground</strong>
                <p>Use the combined image and speech workflow tester.</p>
              </a>
              <a className="docs-link-card" href="/vision">
                <Eye size={18} />
                <strong>Image analysis</strong>
                <p>Route visual understanding requests through configured vision-capable models.</p>
              </a>
              <a className="docs-link-card" href="/speech">
                <Volume2 size={18} />
                <strong>Speech</strong>
                <p>Create text-to-speech audio through supported providers.</p>
              </a>
            </div>
          </section>

          <section className="docs-doc-section" id="routing">
            <span>Routing</span>
            <h2>Choose auto routing or exact model ids</h2>
            <p>
              Auto routing is best when availability matters. Exact model ids are best when your app depends on a specific
              provider, context window, category, or output behavior.
            </p>
            <table className="docs-approach-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Use when</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Auto route</td>
                  <td>You want OpenProvider to select an available free route and fall back when one provider fails.</td>
                </tr>
                <tr>
                  <td>Exact model</td>
                  <td>You need deterministic provider behavior, model-specific limits, or a known output style.</td>
                </tr>
                <tr>
                  <td>Provider setup</td>
                  <td>You want to expand route availability by connecting more provider keys.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="docs-doc-section" id="api-keys">
            <span>Authentication</span>
            <h2>Use OpenProvider API keys</h2>
            <p>
              Generate an OpenProvider key from Account, then send it as a Bearer token. Provider-native credentials never
              need to leave the OpenProvider server.
            </p>
            <div className="docs-auth-card">
              <KeyRound size={18} />
              <code>Authorization: Bearer opk_live_...</code>
            </div>
          </section>

          <section className="docs-doc-section" id="openai-compatibility">
            <span>OpenAI compatibility</span>
            <h2>Use OpenProvider with OpenAI SDKs</h2>
            <p>
              OpenProvider exposes OpenAI-compatible model listing and chat completions so existing apps can move to a
              free-model gateway with minimal code changes. Point the SDK at your OpenProvider `/v1` base URL, use an
              OpenProvider API key, and choose `openprovider/auto-free` or an exact model id from `/v1/models`.
            </p>

            <div className="docs-principle-grid">
              {openAiUseCases.map(useCase => (
                <article key={useCase.title}>
                  <useCase.icon size={18} />
                  <strong>{useCase.title}</strong>
                  <p>{useCase.text}</p>
                </article>
              ))}
            </div>

            <table className="docs-approach-table">
              <thead>
                <tr>
                  <th>OpenAI concept</th>
                  <th>OpenProvider support</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {openAiCompatibilityRows.map(row => (
                  <tr key={row.area}>
                    <td>{row.area}</td>
                    <td>{row.support}</td>
                    <td><code>{row.example}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="docs-code-panel docs-compat-panel">
              <div className="docs-compat-toolbar">
                <div className="docs-sdk-switcher" aria-label="OpenAI SDK language">
                  {openAiSdkSnippets.map(snippet => (
                    <button
                      aria-pressed={snippet.id === openAiSdkLanguage}
                      className={snippet.id === openAiSdkLanguage ? 'active' : ''}
                      key={snippet.id}
                      onClick={() => setOpenAiSdkLanguage(snippet.id)}
                      type="button"
                    >
                      {snippet.label}
                    </button>
                  ))}
                </div>
                <div className="docs-compat-actions">
                  <code>{activeOpenAiSdkSnippet.packageName}</code>
                  <button className="docs-copy-button" onClick={() => void copyOpenAiSdkSnippet()} type="button">
                    {sdkCopied ? <Check size={15} /> : <Copy size={15} />}
                    {sdkCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="docs-shiki-code">
                <ShikiCodeBlock code={activeOpenAiSdkSnippet.code} lang={activeOpenAiSdkSnippet.shikiLang} />
              </div>
            </div>

            <div className="docs-command-callout">
              <Check size={18} />
              <code>{'Use /v1/models to read capabilities: supports_tools, input_modalities, supports_reasoning, context_length, and max_output_tokens.'}</code>
            </div>
          </section>

          <section className="docs-doc-section" id="api-reference">
            <span>API reference</span>
            <h2>OpenAI-style routes for supported workflows</h2>
            <p>All `/v1/*` routes require an OpenProvider API key. Provider credentials stay encrypted in the workspace.</p>
            <div className="docs-api-route-list">
              {apiRoutes.map(route => (
                <article key={`${route.method}-${route.path}`}>
                  <span className="docs-method">{route.method}</span>
                  <div>
                    <strong>{route.label}</strong>
                    <code>{route.path}</code>
                    <p>{route.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <h3>Interactive request builder</h3>
            <p>
              Choose a workflow below to generate copyable cURL and JavaScript snippets, edit the request body, and run a
              live request with your OpenProvider key.
            </p>
            {/* BUG FIX 4: Use handleEndpointSelect so clicking a tab scrolls
                to #try-endpoint and marks it active in the sidebar/TOC. */}
            <div className="docs-route-grid">
              {endpointDocs.map(endpoint => (
                <button
                  className={endpoint.id === activeEndpointId ? 'active' : ''}
                  key={endpoint.id}
                  onClick={() => handleEndpointSelect(endpoint.id)}
                  type="button"
                >
                  <span>
                    <endpoint.icon size={18} />
                  </span>
                  <strong>{endpoint.label}</strong>
                  <code>{endpoint.path}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="docs-doc-section" id="try-endpoint">
            <span>Interactive example</span>
            <h2>{activeEndpoint.label}</h2>
            <p>{activeEndpoint.description}</p>

            <div className="docs-workspace">
              <div className="docs-request-head">
                <div>
                  <span className="docs-method">{activeEndpoint.method}</span>
                  <code>{activeEndpoint.path}</code>
                </div>
                <small>{activeEndpoint.category} workflow</small>
              </div>

              <div className="docs-control-grid">
                <label>
                  <span>Deployment origin</span>
                  <input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} />
                </label>
                <label>
                  <span>OpenProvider API key</span>
                  <input
                    autoComplete="off"
                    placeholder="opk_live_..."
                    type="password"
                    value={apiKey}
                    onChange={event => setApiKey(event.target.value)}
                  />
                </label>
              </div>

              <div className="docs-mode-row" aria-label="Routing mode">
                <button
                  aria-pressed={routingMode === 'auto'}
                  className={routingMode === 'auto' ? 'active' : ''}
                  onClick={() => setRoutingMode('auto')}
                  type="button"
                >
                  Auto route
                </button>
                <button
                  aria-pressed={routingMode === 'exact'}
                  className={routingMode === 'exact' ? 'active' : ''}
                  onClick={() => setRoutingMode('exact')}
                  type="button"
                >
                  Exact model
                </button>
              </div>

              <div className="docs-editor-grid">
                <label className="docs-json-editor">
                  <span>Request body</span>
                  <textarea spellCheck={false} value={bodyText} onChange={event => setBodyText(event.target.value)} />
                </label>

                <div className="docs-code-panel">
                  <div className="docs-code-toolbar">
                    <div className="docs-language-tabs" aria-label="Snippet language">
                      <button
                        className={language === 'curl' ? 'active' : ''}
                        onClick={() => setLanguage('curl')}
                        type="button"
                      >
                        cURL
                      </button>
                      <button
                        className={language === 'javascript' ? 'active' : ''}
                        onClick={() => setLanguage('javascript')}
                        type="button"
                      >
                        JS
                      </button>
                    </div>
                    <button className="docs-copy-button" onClick={() => void copySnippet()} type="button">
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre>
                    <code>{activeSnippet}</code>
                  </pre>
                </div>
              </div>

              <div className="docs-runner">
                <div>
                  <strong>{activeEndpoint.label}</strong>
                  <span>{activeEndpoint.responseLabel}</span>
                </div>
                <button disabled={runState.status === 'loading'} onClick={() => void runExample()} type="button">
                  {runState.status === 'loading' ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
                  Run example
                </button>
              </div>

              <div className={`docs-response ${runState.status === 'error' ? 'error' : ''}`}>
                <div>
                  <span>{activeEndpoint.responseLabel}</span>
                  {runState.statusCode && <code>HTTP {runState.statusCode}</code>}
                </div>
                {runState.audioUrl && <audio controls src={runState.audioUrl} />}
                <pre>
                  <code>{runState.body ?? 'Run an example to inspect the response here.'}</code>
                </pre>
              </div>
            </div>
          </section>

          <section className="docs-doc-section" id="errors">
            <span>Errors</span>
            <h2>One error shape across providers</h2>
            <p>OpenProvider normalizes route, model, provider, and authentication failures into a predictable JSON envelope.</p>
            <div className="docs-error-grid">
              {errorExamples.map(error => (
                <article key={error.code}>
                  <strong>{error.code}</strong>
                  <span>{error.title}</span>
                  <p>{error.text}</p>
                </article>
              ))}
            </div>
          </section>
        </article>

        <aside className="docs-toc" aria-label="On this page">
          <strong>On this page</strong>
          {tocItems.map(item => (
            <a
              aria-current={activeDocHref === item.href ? 'page' : undefined}
              className={activeDocHref === item.href ? 'active' : ''}
              href={item.href}
              key={item.href}
              onClick={() => handleNavClick(item.href)}
            >
              {item.label}
            </a>
          ))}
        </aside>
      </div>
    </div>
  );
}
