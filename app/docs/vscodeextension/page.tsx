import Image from 'next/image';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CopyCheck,
  ExternalLink,
  Filter,
  Gauge,
  Info,
  KeyRound,
  LogIn,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Route,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createPageMetadata } from '@/lib/seo';

const marketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=VK007.openprovider-vscode';

export const metadata = createPageMetadata({
  title: 'VS Code Extension Docs',
  description: 'Install and use the OpenProvider VS Code extension with GitHub Copilot Chat, anonymous Auto Free routing, optional browser sign-in, provider keys, tool calls, vision, settings, and troubleshooting.',
  path: '/docs/vscodeextension',
});

type IconItem = {
  icon: LucideIcon;
  title: string;
  text: string;
};

const pageNav = [
  { href: '#overview', label: 'Overview' },
  { href: '#requirements', label: 'Requirements' },
  { href: '#install', label: 'Install' },
  { href: '#connect', label: 'Connect' },
  { href: '#models', label: 'Models and routing' },
  { href: '#commands', label: 'Commands' },
  { href: '#settings', label: 'Settings' },
  { href: '#security', label: 'Security model' },
  { href: '#troubleshooting', label: 'Troubleshooting' },
];

const overviewCards: IconItem[] = [
  {
    icon: MessageSquareText,
    title: 'Copilot Chat provider',
    text: 'Use OpenProvider models from the GitHub Copilot Chat model picker without leaving VS Code.',
  },
  {
    icon: Route,
    title: 'Auto or exact routing',
    text: 'Start with Auto Free for fallback, or pin a specific provider model when your task needs stable behavior.',
  },
  {
    icon: Wrench,
    title: 'Tools, vision, reasoning',
    text: 'Expose exact-model capabilities to Copilot Chat when the selected model supports tool calls, images, and reasoning.',
  },
  {
    icon: ShieldCheck,
    title: 'No-login first run',
    text: 'Use Auto Free without an OpenProvider account, then sign in or add provider keys only when you need higher limits.',
  },
];

const quickStart = [
  {
    title: 'Install from Marketplace',
    text: 'Open the marketplace listing, install the extension, and reload VS Code if prompted.',
  },
  {
    title: 'Start with Auto Free',
    text: 'Choose Use Auto Free or Select Model. Anonymous routes work immediately for lightweight chat and coding tasks.',
  },
  {
    title: 'Refresh and pick a model',
    text: 'Refresh the catalog, filter by provider if needed, then choose Auto Free, sign in, or add a provider key for exact models.',
  },
];

const commandItems: IconItem[] = [
  {
    icon: Route,
    title: 'Use Auto Free',
    text: 'Switch back to anonymous Auto Free without browser sign-in.',
  },
  {
    icon: LogIn,
    title: 'Sign in',
    text: 'Optionally open OpenProvider in your browser for saved routes and higher limits.',
  },
  {
    icon: RefreshCw,
    title: 'Refresh Models',
    text: 'Bypass local cache and reload the OpenProvider model catalog.',
  },
  {
    icon: Filter,
    title: 'Filter Provider',
    text: 'Limit the model picker to one provider while testing routes.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Select Model',
    text: 'Choose Auto Free, or pick an exact model and add that provider key when needed.',
  },
  {
    icon: Info,
    title: 'Show Model Info',
    text: 'Open capability, token limit, provider, and route details for the selected model.',
  },
  {
    icon: Settings,
    title: 'Set Endpoint',
    text: 'Point the extension at another OpenProvider deployment or API base URL.',
  },
  {
    icon: Settings,
    title: 'Settings',
    text: 'Open all extension settings in the VS Code settings UI.',
  },
  {
    icon: LogOut,
    title: 'Sign out',
    text: 'Remove the stored extension credentials from VS Code.',
  },
];

const settingsRows = [
  {
    name: 'openprovider.outputTokenBudget',
    purpose: 'Normal max-token budget for model responses.',
    defaultValue: 'Clamped to the selected model limit.',
  },
  {
    name: 'openprovider.retryOutputTokenBudget',
    purpose: 'Smaller retry budget after empty streams or upstream rejections.',
    defaultValue: 'Used only on compact retries.',
  },
  {
    name: 'openprovider.forwardSamplingParameters',
    purpose: 'Forward temperature and top_p to providers that support them.',
    defaultValue: 'Disabled by default for broader route compatibility.',
  },
  {
    name: 'openprovider.freeRouteCatalogUrls',
    purpose: 'Optional catalog URLs for Auto Free routing.',
    defaultValue: 'Uses bundled anonymous catalogs when empty.',
  },
  {
    name: 'openprovider.freeRouteBaseUrls',
    purpose: 'Optional route base URLs for Auto Free traffic.',
    defaultValue: 'Uses bundled anonymous route URLs when empty.',
  },
  {
    name: 'openprovider.freeRouteGatewayUrl',
    purpose: 'Optional gateway URL for Auto Free fallback.',
    defaultValue: 'Reads the configured OpenProvider gateway env when empty.',
  },
];

const troubleshooting = [
  {
    title: 'Sign-in opens but does not finish',
    text: 'Confirm Google sign-in is configured on the OpenProvider deployment and retry from the command palette.',
  },
  {
    title: 'Anonymous route keeps failing',
    text: 'Use Auto Free again to try another route, start a new chat with less attached context, or add a direct provider API key for the selected model.',
  },
  {
    title: 'Models look stale',
    text: 'Run Refresh Models to bypass cache. If the provider still looks missing, verify that provider setup is enabled and working.',
  },
  {
    title: 'OpenProvider is missing in Copilot Chat',
    text: 'Confirm GitHub Copilot Chat is enabled and that VS Code is version 1.120.0 or newer.',
  },
];

export default function VscodeExtensionDocsPage() {
  return (
    <div className="vscode-doc-page">
      <aside className="vscode-doc-sidebar" aria-label="VS Code extension docs navigation">
        <Link className="vscode-doc-back" href="/docs">
          <ArrowLeft size={16} />
          API docs
        </Link>
        <strong>VS Code extension</strong>
        <nav>
          {pageNav.map(item => (
            <a href={item.href} key={item.href}>{item.label}</a>
          ))}
        </nav>
      </aside>

      <article className="vscode-doc-article">
        <header className="vscode-doc-hero" id="overview">
          <div className="vscode-doc-kicker">
            <Image alt="" aria-hidden="true" src="/brand/openprovider-icon.png" width={36} height={36} />
            <span>OpenProvider for VS Code</span>
          </div>
          <h1>Use OpenProvider models in GitHub Copilot Chat</h1>
          <p>
            The OpenProvider VS Code extension connects Copilot Chat to anonymous Auto Free routing, optional browser
            login, direct provider keys, live model refresh, provider filters, tool calls, vision support, and reasoning
            output for compatible models.
          </p>
          <div className="vscode-doc-actions">
            <a href={marketplaceUrl} rel="noreferrer" target="_blank">
              Install from Marketplace <ExternalLink size={15} />
            </a>
            <code>ext install VK007.openprovider-vscode</code>
          </div>
        </header>

        <section className="vscode-doc-section" id="requirements">
          <span>Requirements</span>
          <h2>Before you connect</h2>
          <div className="vscode-doc-checklist">
            <article>
              <Check size={18} />
              <div>
                <strong>VS Code 1.120.0 or newer</strong>
                <p>The extension relies on the current VS Code language model provider surface.</p>
              </div>
            </article>
            <article>
              <Check size={18} />
              <div>
                <strong>GitHub Copilot Chat enabled</strong>
                <p>OpenProvider models appear through the Copilot Chat model picker.</p>
              </div>
            </article>
            <article>
              <Check size={18} />
              <div>
                <strong>Optional provider keys</strong>
                <p>Auto Free works without sign-in. Add provider keys only for higher limits or exact provider models.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="vscode-doc-section" id="install">
          <span>Install</span>
          <h2>Install and open the command palette</h2>
          <p>
            Install the extension from Visual Studio Marketplace, then use the VS Code command palette for all extension
            actions. The fastest no-login path is <code>OpenProvider: Manage OpenProvider</code>, then <code>Use Auto Free</code>.
          </p>
          <ol className="vscode-doc-steps">
            {quickStart.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="vscode-doc-section" id="connect">
          <span>Connect</span>
          <h2>How optional browser sign-in works</h2>
          <p>
            You do not need sign-in for Auto Free. When you want saved OpenProvider routes, the sign-in command opens
            OpenProvider in your browser at <code>/api/vscode/connect</code>. After Google sign-in, OpenProvider returns
            a one-time credential bundle to a temporary local callback server started by the extension. VS Code stores
            the result in SecretStorage, so you do not need to paste OpenProvider credentials manually.
          </p>
          <div className="vscode-doc-flow">
            <article>
              <LogIn size={18} />
              <div>
                <strong>Command palette</strong>
                <p>Run <code>OpenProvider: Manage OpenProvider</code>, then choose Auto Free, Select Model, or Sign in.</p>
              </div>
            </article>
            <article>
              <KeyRound size={18} />
              <div>
                <strong>Browser authentication</strong>
                <p>Optional: sign in to the OpenProvider website and confirm your workspace credentials.</p>
              </div>
            </article>
            <article>
              <ShieldCheck size={18} />
              <div>
                <strong>Local callback</strong>
                <p>The browser posts the signed-in credential bundle back to VS Code on localhost.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="vscode-doc-section" id="models">
          <span>Models</span>
          <h2>Routing and model selection</h2>
          <p>
            Use <code>openprovider/auto-free</code> when you want OpenProvider to pick the best available free route.
            Auto Free works without sign-in, advertises a compact anonymous-safe context window, and retries across
            anonymous route providers. Choose an exact model when you need a specific provider, larger context window,
            tool support, image input support, or reasoning behavior.
          </p>
          <div className="vscode-doc-card-grid">
            {overviewCards.map(card => (
              <article key={card.title}>
                <card.icon size={18} />
                <strong>{card.title}</strong>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vscode-doc-section" id="commands">
          <span>Commands</span>
          <h2>Command palette reference</h2>
          <div className="vscode-doc-command-panel">
            {commandItems.map(command => (
              <article key={command.title}>
                <command.icon size={18} />
                <div>
                  <strong>{command.title}</strong>
                  <p>{command.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="vscode-doc-section" id="settings">
          <span>Settings</span>
          <h2>Extension settings</h2>
          <p>
            Most users can keep defaults. Adjust these settings when you are debugging provider behavior, running a custom
            endpoint, or tuning output budgets for long Copilot Chat sessions.
          </p>
          <table className="vscode-doc-settings-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Purpose</th>
                <th>Default behavior</th>
              </tr>
            </thead>
            <tbody>
              {settingsRows.map(row => (
                <tr key={row.name}>
                  <td><code>{row.name}</code></td>
                  <td>{row.purpose}</td>
                  <td>{row.defaultValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="vscode-doc-section" id="security">
          <span>Security</span>
          <h2>Credential handling</h2>
          <div className="vscode-doc-note">
            <ShieldCheck size={18} />
            <div>
              <strong>VS Code is the provider-native exception.</strong>
              <p>
                Browser and server clients should call <code>/v1/*</code> with OpenProvider API keys. The VS Code extension
                can use anonymous Auto Free without secrets, store direct provider keys in VS Code SecretStorage, or receive
                a signed-in credential bundle during optional browser login.
              </p>
            </div>
          </div>
          <div className="vscode-doc-card-grid compact">
            <article>
              <CopyCheck size={18} />
              <strong>No manual copy step</strong>
              <p>The browser callback sends the connection back to VS Code automatically.</p>
            </article>
            <article>
              <LogOut size={18} />
              <strong>Sign out clears storage</strong>
              <p>Run Sign out to remove the stored extension credentials from VS Code.</p>
            </article>
            <article>
              <Gauge size={18} />
              <strong>Route-aware requests</strong>
              <p>Auto Free selects candidates that match required tool, vision, and chat capabilities.</p>
            </article>
          </div>
        </section>

        <section className="vscode-doc-section" id="troubleshooting">
          <span>Troubleshooting</span>
          <h2>Common fixes</h2>
          <div className="vscode-doc-troubleshooting">
            {troubleshooting.map(item => (
              <article key={item.title}>
                <AlertCircle size={18} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="vscode-doc-footer">
          <BookOpen size={18} />
          <div>
            <strong>Building against the API too?</strong>
            <p>Use the API docs for `/v1/*` routes, OpenAI SDK setup, request examples, and normalized error shapes.</p>
          </div>
          <Link href="/docs">Open API docs</Link>
        </footer>
      </article>
    </div>
  );
}
