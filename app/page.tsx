import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  AudioLines,
  Bot,
  Code2,
  ExternalLink,
  GitBranch,
  HeartPulse,
  Eye,
  Image as ImageIcon,
  KeyRound,
  MessageCircle,
  MessageSquareText,
  RefreshCcw,
  Route,
  Search,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { getShowcaseCatalogSnapshot, type PublicModel } from '@/lib/openprovider/catalog';
import { ProtectedLink } from '@/components/auth/auth-gate';
import { ProviderMark } from '@/components/providers/provider-mark';
import { providerName } from '@/lib/provider-meta';
import { homeJsonLd } from '@/lib/seo';


export const revalidate = 300;

function compactNumber(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

function categoryLabel(category: PublicModel['category']): string {
  if (category === 'vision') return 'Image analysis';
  if (category === 'audio') return 'Speech';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function categoryIcon(category: PublicModel['category']) {
  if (category === 'image') return <ImageIcon size={18} />;
  if (category === 'vision') return <Eye size={18} />;
  if (category === 'audio') return <Volume2 size={18} />;
  return <MessageSquareText size={18} />;
}

function modelHref(model: PublicModel): string {
  return `/models/${model.provider}/${encodeURIComponent(model.modelId)}`;
}

function modelSummary(model: PublicModel): string {
  return model.description?.trim()
    || `${model.name} is a free ${providerName(model.provider)} ${categoryLabel(model.category).toLowerCase()} model available through OpenProvider.`;
}

function formatModelNameToken(token: string): string {
  const lower = token.toLowerCase();
  const replacements: Record<string, string> = {
    a: 'A',
    ai: 'AI',
    api: 'API',
    cf: 'CF',
    glm: 'GLM',
    gpt: 'GPT',
    it: 'IT',
    k2: 'K2',
    llm: 'LLM',
    oss: 'OSS',
    tts: 'TTS',
    vl: 'VL',
    zai: 'Z.AI',
    openai: 'OpenAI',
    moonshotai: 'Moonshot AI',
  };

  if (replacements[lower]) return replacements[lower];
  if (/^\d+(b|m|k)$/i.test(token)) {
    return token.replace(/(b|m|k)$/i, suffix => suffix.toUpperCase());
  }
  if (/^\d+$/.test(token)) return token;
  if (token !== lower) return token;

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function modelDisplayName(model: PublicModel): string {
  const rawName = model.name.trim();
  const namespacedName = rawName.startsWith('@cf/')
    ? rawName.split('/').at(-1) ?? rawName
    : rawName;
  const compactName = namespacedName
    .replace(/^[^:]{2,36}:\s+/, '')
    .replace(/\s*\(free\)$/i, '');

  return compactName
    .replace(/[_/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(formatModelNameToken)
    .join(' ')
    .replace(/\b1 5\b/g, '1.5')
    .replace(/\b2 5\b/g, '2.5')
    .replace(/\b3 5\b/g, '3.5')
    .replace(/\b4 7\b/g, '4.7');
}

function modelCardSummary(model: PublicModel): string {
  const summary = modelSummary(model);
  const displayName = modelDisplayName(model);

  if (displayName === model.name) return summary;
  return summary.replace(model.name, displayName);
}

function compareFeaturedModels(left: PublicModel, right: PublicModel): number {
  return right.priority - left.priority
    || Number(right.supportsReasoning) - Number(left.supportsReasoning)
    || right.maxInputTokens - left.maxInputTokens
    || left.name.localeCompare(right.name);
}

function pickFeaturedModels(models: PublicModel[], limit: number): PublicModel[] {
  const rankedModels = models
    .filter(model => model.category === 'text')
    .sort(compareFeaturedModels);
  const selectedProviders = new Set<string>();
  const selectedIds = new Set<string>();
  const featuredModels: PublicModel[] = [];

  for (const model of rankedModels) {
    if (selectedProviders.has(model.provider)) continue;
    selectedProviders.add(model.provider);
    selectedIds.add(model.id);
    featuredModels.push(model);
    if (featuredModels.length === limit) return featuredModels;
  }

  for (const model of rankedModels) {
    if (selectedIds.has(model.id)) continue;
    featuredModels.push(model);
    if (featuredModels.length === limit) return featuredModels;
  }

  return featuredModels;
}

// ─── Showcase catalog snapshot ───────────────────────────────────────────────
// Keep this in sync with the actual free-model counts from the live catalog.
// To update: run `npm run test:providers` and copy provider model counts here.
// Category totals are derived automatically — do NOT edit them manually.
//
// Each entry: { provider, chat?, image?, 'image-to-text'?, 'text-to-speech'? }
// Omit a category if the provider has zero models in it.
// ─────────────────────────────────────────────────────────────────────────────
type ModelCategory = 'text' | 'image' | 'vision' | 'audio';

const PROVIDER_CATALOG: Array<{
  provider: string;
  text?: number;
  image?: number;
  vision?: number;
  audio?: number;
}> = [
  // ── High-volume providers ──────────────────────────────────────────────────
  { provider: 'huggingface',  text: 126                                      },
  { provider: 'nvidia',       text: 85,  image: 24, vision: 6, audio: 1 },
  { provider: 'cloudflare',   text: 43,  image: 1,  vision: 10, audio: 5 },
  { provider: 'sambanova',    text: 5                                        },
  { provider: 'siliconflow',  text: 1                                        },
  { provider: 'mistral',      text: 51,                                  audio: 4 },
  { provider: 'openrouter',   text: 40                                       },
  { provider: 'freemodel',    text: 8                                        },
  { provider: 'ollama',       text: 39                                       },
  { provider: 'puter',        text: 439,                    vision: 103 },
  // ── Mid-tier providers ─────────────────────────────────────────────────────
  { provider: 'routeway',     text: 18                                       },
  { provider: 'atxp',         text: 17                                       },
  { provider: 'groq',         text: 15,                                audio: 1 },
  { provider: 'cohere',       text: 14                                       },
  // ── Smaller / niche providers ─────────────────────────────────────────────
  { provider: 'pollinations', text: 5                                        },
  { provider: 'cerbes',       text: 4                                        },
  { provider: 'zenmux',       text: 4                                        },
  { provider: 'zai',          text: 3                                        },
  { provider: 'llm7',         text: 3                                        },
  { provider: 'llmgateway',   text: 2                                        },
  { provider: 'google',       text: 1                                        },
  { provider: 'apifreellm',   text: 1                                        },
];

// Derived — do not edit manually.
const showcaseProviderCounts = PROVIDER_CATALOG.map(entry => ({
  provider: entry.provider,
  count: (entry.text ?? 0) + (entry.image ?? 0) + (entry.vision ?? 0) + (entry.audio ?? 0),
})).filter(entry => entry.count > 0).sort((a, b) => b.count - a.count);

const showcaseCategoryCounts = (['text', 'image', 'vision', 'audio'] as ModelCategory[]).reduce(
  (acc, category) => {
    acc[category] = PROVIDER_CATALOG.reduce((sum, entry) => sum + (entry[category] ?? 0), 0);
    return acc;
  },
  {} as Record<ModelCategory, number>,
);

export default async function HomePage() {
  const snapshot = await getShowcaseCatalogSnapshot();
  const providerEntries = showcaseProviderCounts;
  const providerNames = providerEntries.map(item => item.provider);
  const featuredModels = pickFeaturedModels(snapshot.models, 8);
  const providerHighlights = providerEntries;
  const categories = [
    { label: 'Text', count: showcaseCategoryCounts.text, icon: MessageSquareText },
    { label: 'Image', count: showcaseCategoryCounts.image, icon: ImageIcon },
    { label: 'Vision', count: showcaseCategoryCounts.vision, icon: Eye },
    { label: 'Speech', count: showcaseCategoryCounts.audio, icon: Volume2 },
  ];
  const showcaseModelCount = providerEntries.reduce((sum, item) => sum + item.count, 0);
  const structuredData = homeJsonLd(showcaseModelCount, providerNames.length);
  const workflowSteps = [
    { label: 'Connect', description: 'Add provider API keys once.', icon: KeyRound },
    { label: 'Discover', description: 'Browse the live free catalog.', icon: Search },
    { label: 'Route', description: 'Use auto or exact provider paths.', icon: Route },
    { label: 'Build', description: 'Call OpenAI-style endpoints.', icon: Code2 },
  ];
  const routingPolicies = [
    {
      label: 'One policy for every route',
      description: 'Health, modality, and availability choose the best fallback path.',
      icon: ShieldCheck,
    },
    {
      label: 'Auto fallback',
      description: 'Requests move across configured providers when a route is unavailable.',
      icon: RefreshCcw,
    },
    {
      label: 'Provider health',
      description: 'Live checks keep unhealthy providers out of the request path.',
      icon: HeartPulse,
    },
  ];
  const providerStatusRows = providerHighlights.slice(0, 5).map((item, index) => ({
    ...item,
    status: index === 2 ? 'Limited' : 'Healthy',
  }));
  const remainingProviderCount = Math.max(providerNames.length - providerStatusRows.length, 0);
  const endpoints = [
    { method: 'POST', path: '/v1/chat/completions', label: 'Chat', description: 'Text and tool-ready conversations.', icon: MessageSquareText },
    { method: 'POST', path: '/v1/images/generations', label: 'Image', description: 'Generate images through configured providers.', icon: ImageIcon },
    { method: 'POST', path: '/v1/images/analyze', label: 'Image analysis', description: 'Route visual understanding requests.', icon: Eye },
    { method: 'POST', path: '/v1/audio/speech', label: 'Speech', description: 'Create speech from text prompts.', icon: Volume2 },
  ];
  const endpointBadges = [
    { label: 'Base URL', value: '/v1' },
    { label: 'Auth', value: 'OpenProvider key' },
    { label: 'Routing', value: 'auto or exact' },
  ];
  const routingCoverage = [
    { label: 'providers', value: providerNames.length },
    { label: 'modalities', value: categories.filter(item => item.count > 0).length },
    { label: 'API routes', value: endpoints.length },
  ];

  return (
    <div className="landing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <img alt="" aria-hidden="true" src="/brand/openprovider-icon.png" />
            OpenAI-compatible free-model gateway
          </span>
          <h1>One API for free AI models.</h1>
          <p>
            Connect provider keys once, sync a live free-only catalog, and use auto or exact routes for chat, image, image analysis, and speech without exposing provider credentials.
          </p>
          <div className="hero-actions">
            <ProtectedLink className="button-link" href="/models"><Search size={16} /> Explore models</ProtectedLink>
            <ProtectedLink className="button-link secondary" href="/chat"><MessageSquareText size={16} /> Open chat</ProtectedLink>
            <ProtectedLink className="button-link secondary" href="/playground"><AudioLines size={16} /> Media playground</ProtectedLink>
          </div>
        </div>

        <div className="hero-provider-rail" aria-label="Configured providers">
          {providerHighlights.map((item, index) => (
            <ProtectedLink
              className="provider-rail-chip"
              href={`/models?provider=${item.provider}`}
              key={item.provider}
              style={{ '--i': index } as CSSProperties}
            >
              <ProviderMark provider={item.provider} />
              <span>{providerName(item.provider)}</span>
              <strong>{item.count}</strong>
            </ProtectedLink>
          ))}
        </div>

        <div className="hero-stats" aria-label="OpenProvider catalog stats">
          <div><strong>{showcaseModelCount}</strong><span>Free models</span></div>
          <div><strong>{providerNames.length}</strong><span>Providers</span></div>
          <div><strong>{categories.filter(item => item.count > 0).length}</strong><span>Modalities</span></div>
          <div><strong>4</strong><span>API routes</span></div>
        </div>
      </section>


      <section className="workflow-section" aria-label="OpenProvider setup workflow">
        <div className="workflow-copy">
          <span className="eyebrow">Setup flow</span>
          <h2>Connect once, then route every free model.</h2>
          <p>
            Add provider keys, sync the live catalog, choose an auto or exact route, and call OpenAI-style endpoints from your apps.
          </p>
        </div>
        <div className="builder-flow">
          {workflowSteps.map((step, index) => (
            <div
              className="builder-step"
              key={step.label}
              style={{
                '--step-delay': `${220 + index * 90}ms`,
                '--pulse-delay': `${500 + index * 360}ms`,
              } as CSSProperties}
            >
              <span className="builder-step-index">0{index + 1}</span>
              <span className="builder-step-icon"><step.icon size={17} /></span>
              <strong>{step.label}</strong>
              <p>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="capability-section" aria-label="OpenProvider capabilities">
        <div className="section-heading routing-heading">
          <div className="routing-heading-copy">
            <h2>Built for free-model routing</h2>
            <p>Provider sync, auto fallback, and server-side keys keep the catalog useful after setup.</p>
          </div>
          <ProtectedLink className="routing-heading-action" href="/chat">
            Try auto route <ArrowRight size={15} />
          </ProtectedLink>
        </div>

        <div className="routing-shell">
          <article className="routing-panel routing-policy-panel">
            <span className="routing-panel-kicker">Intelligent routing</span>
            <div className="routing-policy-list">
              {routingPolicies.map((item, index) => (
                <div
                  className="routing-policy-item"
                  key={item.label}
                  style={{ '--item-delay': `${index * 90}ms` } as CSSProperties}
                >
                  <span className="routing-policy-icon"><item.icon size={19} /></span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="routing-policy-footer" aria-label="Routing coverage">
              <span>Routing coverage</span>
              <div>
                {routingCoverage.map(item => (
                  <strong key={item.label}>
                    {item.value}
                    <small>{item.label}</small>
                  </strong>
                ))}
              </div>
            </div>
          </article>

          <div className="routing-core-wrap">
            <div className="routing-core-card">
              <span className="routing-direction routing-direction-request" aria-hidden="true">Request</span>
              <span className="routing-direction routing-direction-response" aria-hidden="true">Response</span>
              <span className="routing-core-mark" aria-hidden="true">
                <img alt="" src="/brand/openprovider-icon.png" />
              </span>
              <h3>OpenProvider</h3>
              <p>free-route policy</p>
              <div className="routing-core-chips" aria-label="Routing controls">
                <span>Sync</span>
                <span>Fallback</span>
                <span>Keys</span>
              </div>
            </div>
          </div>

          <article className="routing-panel routing-provider-panel">
            <span className="routing-panel-kicker">Configured providers</span>
            <div className="provider-status-list">
              {providerStatusRows.map((item, index) => (
                <ProtectedLink
                  className="provider-status-row"
                  href={`/models?provider=${item.provider}`}
                  key={item.provider}
                  style={{ '--item-delay': `${index * 70}ms` } as CSSProperties}
                >
                  <span className="provider-status-mark"><ProviderMark provider={item.provider} /></span>
                  <span className="provider-status-text">
                    <strong>{providerName(item.provider)}</strong>
                    <small>{item.count} free models</small>
                  </span>
                  <em className={`provider-status-pill status-${item.status.toLowerCase()}`}>{item.status}</em>
                </ProtectedLink>
              ))}
              {remainingProviderCount > 0 && (
                <ProtectedLink className="provider-status-more" href="/models">
                  + {remainingProviderCount} more providers
                </ProtectedLink>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="featured-section">
        <div className="section-heading">
          <div>
            <h2>Featured free models</h2>
            <p>{compactNumber(showcaseModelCount)} free models across {providerNames.length} providers</p>
          </div>
          <ProtectedLink className="text-link" href="/models">View all <ArrowRight size={15} /></ProtectedLink>
        </div>

        <div className="featured-model-grid">
          {featuredModels.map((model, index) => (
            <ProtectedLink className={index === 0 ? 'featured-model-card featured-model-card-primary' : 'featured-model-card'} href={modelHref(model)} key={model.id}>
              <div className="featured-model-head">
                <div className="model-avatar">
                  <ProviderMark provider={model.provider} />
                </div>
                <div>
                  <h3 title={model.name}>{modelDisplayName(model)}</h3>
                  <p>by {providerName(model.provider)}</p>
                </div>
                <ArrowRight size={17} />
              </div>
              <p className="featured-model-summary">{modelCardSummary(model)}</p>
              <div className="featured-model-meta">
                <span>{categoryIcon(model.category)} {categoryLabel(model.category)}</span>
                <span>{compactNumber(model.maxInputTokens)} context</span>
                {model.supportsReasoning && <span><Bot size={14} /> reasoning</span>}
              </div>
            </ProtectedLink>
          ))}
        </div>
      </section>

      <section className="endpoint-band" aria-label="OpenProvider API endpoints">
        <div className="endpoint-copy">
          <span className="eyebrow">API endpoints</span>
          <h2>OpenAI-style routes for every supported workflow.</h2>
          <p>Keep your app integration simple while OpenProvider handles provider-specific routing behind the scenes.</p>
          <div className="endpoint-badge-row" aria-label="API route properties">
            {endpointBadges.map(item => (
              <span key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="endpoint-console">
          <div className="endpoint-console-bar">
            <span aria-hidden="true" />
            <strong>OpenProvider gateway</strong>
            <code>POST</code>
          </div>
          <div className="endpoint-list">
            {endpoints.map(endpoint => (
              <div className="endpoint-route" key={endpoint.path}>
                <span className="endpoint-route-icon"><endpoint.icon size={17} /></span>
                <span className="endpoint-route-copy">
                  <strong>{endpoint.label}</strong>
                  <code><em>{endpoint.method}</em>{endpoint.path}</code>
                </span>
                <small>{endpoint.description}</small>
              </div>
            ))}
          </div>
          <div className="endpoint-console-foot">
            <KeyRound size={15} />
            Provider credentials stay server-side while apps call OpenProvider keys.
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <Link className="footer-brand" href="/">
            <img alt="" aria-hidden="true" src="/brand/openprovider-icon.png" />
            <span>OpenProvider</span>
          </Link>
          <p>Free-first AI model routing for builders.</p>
        </div>
        <nav aria-label="Footer links">
          <ProtectedLink href="/models">Models</ProtectedLink>
          <ProtectedLink href="/chat">Chat</ProtectedLink>
          <ProtectedLink href="/account">Account</ProtectedLink>
          <a href="https://github.com/AnitSarkar123/openprovider" rel="noreferrer" target="_blank">
            <GitBranch size={15} />
            GitHub
            <ExternalLink size={13} />
          </a>
        </nav>
        <small>© {new Date().getFullYear()} OpenProvider. Built by VK.</small>
      </footer>
    </div>
  );
}
