'use client';

import { Bot, BrainCircuit, Check, ChevronRight, Code2, Copy, FileText, GitCompareArrows, Loader2, LockKeyhole, Mic, Paperclip, MoreVertical, PanelLeft, Plus, RefreshCw, RotateCcw, Route, Search, Send, SlidersHorizontal, Trash2, Wrench, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AssistantMarkdown } from './assistant-markdown';
import type { ConversationGroup, ConversationRow } from './chat-sidebar';
import type { UiModel } from '../models/model-explorer';
import { withModelApiCacheVersion } from '@/lib/model-api-cache';
import { providerName } from '@/lib/provider-meta';
import { ProviderMark } from '../providers/provider-mark';

const ChatSidebar = lazy(() => import('./chat-sidebar').then(module => ({ default: module.ChatSidebar })));

type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[];
  reasoning?: string;
  reasoningComplete?: boolean;
  reasoningRequested?: boolean;
  provider?: string;
  modelLabel?: string;
  latencyMs?: number;
  tokenUsage?: TokenUsage;
  createdAt?: number;
  completedAt?: number;
};

type ChatTurnOptions = {
  promptText: string;
  baseMessages: Message[];
  appendUserMessage: boolean;
  attachments?: ComposerAttachment[];
  clearInput?: boolean;
  replaceConversationMessages?: boolean;
};

type MessageAttachment = {
  kind: 'image' | 'text';
  name: string;
  type: string;
  size: number;
};

type ComposerAttachment = MessageAttachment & {
  id: string;
  dataUrl?: string;
  text?: string;
};

type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ApiChatMessage = Omit<Message, 'content' | 'attachments'> & {
  content: string | ChatMessageContentPart[];
};

type PersistedConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  tokenUsage?: TokenUsage;
};

type ModelsPayload = {
  data: UiModel[];
};

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimated?: boolean;
};

type ConversationSummary = {
  id: string;
  title: string;
  modelId: string;
  provider: string;
  updatedAt?: string;
};

type ConversationsPayload = {
  data: ConversationSummary[];
  meta?: {
    limit?: number;
    remaining?: number;
    total?: number;
  };
};

type ConversationDetailPayload = {
  data?: ConversationSummary & {
    messages?: Array<{
      id: string;
      role: string;
      content: string;
      tokenUsage?: Record<string, unknown> | null;
      createdAt?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

type ConversationMutationPayload = {
  ok?: boolean;
  data?: ConversationSummary;
  error?: {
    message?: string;
  };
};

type ChatStreamEvent =
  | { type: 'metadata'; provider?: string; model?: string; modelName?: string }
  | { type: 'delta'; content?: string }
  | { type: 'reasoning'; content?: string }
  | { type: 'done'; provider?: string; model?: string; modelName?: string; content?: string; reasoning?: string; usage?: unknown; conversationId?: string | null }
  | { type: 'error'; message?: string; code?: string };

type ChatErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

class ChatRequestError extends Error {
  constructor(message: string, readonly allowFallback: boolean) {
    super(message);
    this.name = 'ChatRequestError';
  }
}

function shouldRunFallbackCompletion(error: unknown): boolean {
  return !(error instanceof ChatRequestError) || error.allowFallback;
}

const promptStarters = [
  {
    icon: Wrench,
    title: 'Debug a problem',
    prompt: 'Help me debug this issue. Ask for any missing logs or context, then suggest the most likely fix.',
  },
  {
    icon: Code2,
    title: 'Build a feature',
    prompt: 'Help me design and implement this feature cleanly. Start by identifying the key decisions and edge cases.',
  },
  {
    icon: GitCompareArrows,
    title: 'Compare options',
    prompt: 'Compare the practical options for this decision, then recommend the best path and explain the tradeoffs.',
  },
  {
    icon: FileText,
    title: 'Summarize and plan',
    prompt: 'Turn this messy context into a concise summary, key risks, and a clear next-step checklist.',
  },
];

const STREAM_STALL_TIMEOUT_MS = 12000;
const LEGACY_DEFAULT_MAX_TOKENS = 512;
const DEFAULT_MAX_TOKENS = 4096;
const AUTO_FREE_MODEL_ID = 'openprovider/auto-free';
const AUTO_FREE_MODEL_LABEL = 'OpenProvider Auto Free';
const DESKTOP_VISIBLE_MODEL_TABS = 3;
const COMPACT_VISIBLE_MODEL_TABS = 1;
const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_CHAT_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
const CONVERSATION_LIST_CACHE_MS = 5 * 60 * 1000;
const CONVERSATION_LIST_STORAGE_KEY = 'openprovider:chat:conversations:v1';
const DEFAULT_CONVERSATION_LIMIT = 10;
const CONVERSATION_LIMIT_ERROR_CODE = 'conversation_limit_reached';
const MODEL_LIST_CACHE_MS = 60 * 1000;
const MODEL_LIST_STORAGE_KEY = 'openprovider:chat:models:text:v2';

type ConversationListCache = {
  data: ConversationSummary[];
  storedAt: number;
};

type ModelListCache = {
  data: UiModel[];
  storedAt: number;
};

function scheduleBrowserIdle(callback: () => void, timeoutMs = 1500): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 250);
  return () => window.clearTimeout(handle);
}

function readConversationListCache(): ConversationSummary[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CONVERSATION_LIST_STORAGE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<ConversationListCache>;
    if (!Array.isArray(cached.data) || typeof cached.storedAt !== 'number') {
      return null;
    }

    if (Date.now() - cached.storedAt > CONVERSATION_LIST_CACHE_MS) {
      window.sessionStorage.removeItem(CONVERSATION_LIST_STORAGE_KEY);
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

function writeConversationListCache(data: ConversationSummary[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      CONVERSATION_LIST_STORAGE_KEY,
      JSON.stringify({ data, storedAt: Date.now() } satisfies ConversationListCache)
    );
  } catch {
    /* ignore unavailable storage */
  }
}

function readModelListCache(): UiModel[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(MODEL_LIST_STORAGE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<ModelListCache>;
    if (!Array.isArray(cached.data) || typeof cached.storedAt !== 'number') {
      return null;
    }

    if (Date.now() - cached.storedAt > MODEL_LIST_CACHE_MS) {
      window.sessionStorage.removeItem(MODEL_LIST_STORAGE_KEY);
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

function writeModelListCache(data: UiModel[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      MODEL_LIST_STORAGE_KEY,
      JSON.stringify({ data, storedAt: Date.now() } satisfies ModelListCache)
    );
  } catch {
    /* ignore unavailable storage */
  }
}

function ChatSidebarFallback({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside className={clsx('chat-sidebar', collapsed && 'collapsed')} aria-busy="true">
      <div className="chat-sidebar-head">
        {!collapsed && (
          <button className="new-chat-button" disabled type="button">
            <Plus size={17} />
            New Chat
          </button>
        )}
        <button
          aria-label={collapsed ? 'Expand conversations' : 'Collapse conversations'}
          aria-pressed={collapsed}
          className="sidebar-toggle-button"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand conversations' : 'Collapse conversations'}
          type="button"
        >
          <PanelLeft size={18} />
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="conversation-search">
            <Search size={18} />
            <input aria-label="Search conversations" disabled placeholder="Loading conversations..." />
          </div>
          <div className="thread-list conversation-list">
            <p className="conversation-empty">Loading conversations...</p>
          </div>
        </>
      )}
    </aside>
  );
}

function AssistantResponseSkeleton() {
  return (
    <div className="assistant-response-skeleton" aria-hidden="true">
      <span className="skeleton-shimmer" />
      <span className="skeleton-shimmer" />
    </div>
  );
}

function compactNumber(value: number): string {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

function estimateTokenCount(content: string): number {
  const text = content.trim();
  if (!text) return 0;

  return Math.max(1, Math.ceil(text.length / 4));
}

function readUsageNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function parseTokenUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const promptTokens = readUsageNumber(record, ['prompt_tokens', 'promptTokens', 'input_tokens', 'inputTokens']);
  const completionTokens = readUsageNumber(record, ['completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens']);
  const totalTokens = readUsageNumber(record, ['total_tokens', 'totalTokens']);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return { promptTokens, completionTokens, totalTokens, estimated: false };
}

function estimatedUsageForMessage(content: string, role: Message['role']): TokenUsage {
  const tokens = estimateTokenCount(content);
  return {
    promptTokens: role === 'user' ? tokens : undefined,
    completionTokens: role === 'assistant' ? tokens : undefined,
    totalTokens: tokens,
    estimated: true,
  };
}

function tokenCountForMessage(message: Message, content: string): { count: number; estimated: boolean } {
  const usage = message.tokenUsage ?? estimatedUsageForMessage(content, message.role);
  const count = message.role === 'assistant'
    ? usage.completionTokens ?? usage.totalTokens ?? estimateTokenCount(content)
    : usage.promptTokens ?? usage.totalTokens ?? estimateTokenCount(content);

  return { count, estimated: usage.estimated !== false };
}

function tokenLabel(message: Message, content: string): string {
  const { count, estimated } = tokenCountForMessage(message, content);
  return `${estimated ? '~' : ''}${compactNumber(count)} tokens`;
}

function latencyLabel(latencyMs?: number): string | undefined {
  if (latencyMs === undefined) {
    return undefined;
  }

  if (latencyMs < 1000) {
    return `${Math.max(1, latencyMs)}ms`;
  }

  const seconds = latencyMs / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}

function modelSummary(model: UiModel): string {
  return model.description?.trim() || `${model.name} is a free ${providerName(model.provider)} chat model available through OpenProvider.`;
}

function modelStatusLabel(model: UiModel): string {
  if (model.status === 'working') return 'Working';
  if (model.status === 'failing') return 'Failing';
  if (model.statusError || model.statusCheckedAt) return 'Needs review';
  return 'Untested';
}

function modelSupportsImageInput(model?: UiModel): boolean {
  if (!model) {
    return false;
  }

  if (model.category === 'vision') {
    return true;
  }

  const searchString = `${model.name} ${model.id}`.toLowerCase();
  if (
    searchString.includes('vision') ||
    searchString.includes('-vl') ||
    searchString.includes(' vl') ||
    searchString.includes('llava') ||
    searchString.includes('pixtral') ||
    searchString.includes('moondream') ||
    searchString.includes('minicpm') ||
    searchString.includes('gpt-4o') ||
    searchString.includes('gpt-4-turbo') ||
    searchString.includes('claude-3') ||
    searchString.includes('gemini') ||
    searchString.includes('qwen-vl') ||
    searchString.includes('qwen2-vl') ||
    searchString.includes('qwen2.5-vl') ||
    searchString.includes('internvl') ||
    searchString.includes('idefics')
  ) {
    return true;
  }

  const modalities = model.inputModalities.map(value => value.toLowerCase());
  const tags = model.tags.map(value => value.toLowerCase());
  return [...modalities, ...tags].some(value => (
    value === 'image' ||
    value === 'vision' ||
    value === 'multimodal' ||
    value.includes('vision') ||
    value.includes('image')
  ));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read this image.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read this image.'));
    reader.readAsDataURL(file);
  });
}

function isTextAttachmentFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith('text/') ||
    [
      'application/json',
      'application/xml',
      'application/x-yaml',
      'application/yaml',
      'application/javascript',
      'application/typescript',
    ].includes(type) ||
    /\.(txt|md|markdown|json|csv|tsv|xml|yaml|yml|js|jsx|ts|tsx|py|rb|go|rs|java|c|cpp|h|hpp|html|css|sql|log)$/i.test(name)
  );
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read this text file.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read this text file.'));
    reader.readAsText(file);
  });
}

function buildUserMessageContent(text: string, attachments: ComposerAttachment[]): string | ChatMessageContentPart[] {
  if (attachments.length === 0) {
    return text;
  }

  const textAttachmentContent = attachments
    .filter(attachment => attachment.kind === 'text' && attachment.text)
    .map(attachment => `File: ${attachment.name}\n${attachment.text}`)
    .join('\n\n');
  const imageAttachments = attachments.filter(attachment => attachment.kind === 'image' && attachment.dataUrl);
  const promptText = [
    text || (imageAttachments.length > 0 ? 'Analyze the attached image.' : 'Use the attached file context.'),
    textAttachmentContent,
  ].filter(Boolean).join('\n\n');

  if (imageAttachments.length === 0) {
    return promptText;
  }

  const parts: ChatMessageContentPart[] = [{
    type: 'text',
    text: promptText,
  }];

  for (const attachment of imageAttachments) {
    parts.push({
      type: 'image_url',
      image_url: { url: attachment.dataUrl ?? '' },
    });
  }

  return parts;
}

function attachmentSummary(attachments: MessageAttachment[]): string {
  if (attachments.length === 0) {
    return '';
  }

  return `Attached ${attachments.length === 1 ? 'file' : 'files'}: ${attachments.map(attachment => attachment.name).join(', ')}`;
}

function modelNameFromId(modelId: string): string {
  const parts = normalizeChatModelId(modelId).split('/').filter(Boolean);
  const rawName = parts.length > 1 ? parts.slice(-2).join(' ') : parts[0] ?? modelId;

  return rawName
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Z])/g, '$1 $2')
    .replace(/[:_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function conversationGroup(value?: string): ConversationGroup {
  if (!value) {
    return 'Previous 30 Days';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Previous 30 Days';
  }

  const age = Date.now() - timestamp;
  const oneDay = 24 * 60 * 60 * 1000;
  if (age < oneDay) {
    return 'Today';
  }

  if (age < 7 * oneDay) {
    return 'Previous 7 Days';
  }

  return 'Previous 30 Days';
}

function parseSseBlock(block: string): ChatStreamEvent | undefined {
  let eventType = '';
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  const data = dataLines.join('\n');

  if (!data) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;

    if (eventType && typeof parsed.type !== 'string') {
      return {
        ...parsed,
        type: eventType,
      } as ChatStreamEvent;
    }

    return parsed as ChatStreamEvent;
  } catch {
    return undefined;
  }
}

function parseSseBlocks(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  return {
    events: blocks.map(parseSseBlock).filter((event): event is ChatStreamEvent => Boolean(event)),
    rest,
  };
}

function splitThinkingMarkup(
  content: string,
  options: { allowLeadingReasoning?: boolean; assumeOpenReasoning?: boolean } = {}
): { content: string; reasoning: string } {
  const openMatch = /<think>/i.exec(content);
  if (!openMatch) {
    const closeMatch = /<\/think>/i.exec(content);
    if (closeMatch && options.allowLeadingReasoning) {
      return {
        content: content.slice(closeMatch.index + closeMatch[0].length).trimStart(),
        reasoning: content.slice(0, closeMatch.index),
      };
    }

    if (options.assumeOpenReasoning && content.trim()) {
      return {
        content: '',
        reasoning: content,
      };
    }

    return { content, reasoning: '' };
  }

  const before = content.slice(0, openMatch.index);
  const afterOpen = content.slice(openMatch.index + openMatch[0].length);
  const closeMatch = /<\/think>/i.exec(afterOpen);

  if (!closeMatch) {
    return {
      content: before.trim() ? before : '',
      reasoning: afterOpen,
    };
  }

  return {
    content: `${before}${afterOpen.slice(closeMatch.index + closeMatch[0].length)}`.trimStart(),
    reasoning: afterOpen.slice(0, closeMatch.index),
  };
}

function mergeReasoningSegments(...segments: Array<string | undefined>): string {
  const seen = new Set<string>();

  return segments
    .map(segment => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .filter(segment => {
      if (seen.has(segment)) {
        return false;
      }

      seen.add(segment);
      return true;
    })
    .join('\n\n');
}

function isAutoFreeModelId(value: string): boolean {
  return ['auto', AUTO_FREE_MODEL_ID, 'openprovider/auto', 'auto/free'].includes(value.trim().toLowerCase());
}

function normalizeChatModelId(value: string): string {
  const trimmed = value.trim();
  if (isAutoFreeModelId(trimmed)) return AUTO_FREE_MODEL_ID;

  return trimmed;
}

function normalizedModelLookupKey(value: string): string {
  return normalizeChatModelId(value).trim().toLowerCase();
}

function providerFromModelId(value: string): string {
  const normalized = normalizeChatModelId(value);
  return normalized.includes('/') ? normalized.split('/')[0] || 'openprovider' : 'openprovider';
}

function chatModelMatchesId(model: UiModel, modelId: string): boolean {
  const target = normalizedModelLookupKey(modelId);
  if (!target) {
    return false;
  }

  return [
    model.id,
    model.modelId,
    `${model.provider}/${model.modelId}`,
  ].some(value => normalizedModelLookupKey(value) === target);
}

function findChatModel(models: UiModel[], modelId: string): UiModel | undefined {
  return models.find(item => chatModelMatchesId(item, modelId));
}

function mergeUniqueChatModels(...groups: UiModel[][]): UiModel[] {
  const merged = new Map<string, UiModel>();

  for (const group of groups) {
    for (const model of group) {
      const key = normalizedModelLookupKey(model.id);
      if (!key) {
        continue;
      }

      merged.set(key, model);
    }
  }

  return Array.from(merged.values());
}

async function fetchChatModels(search?: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<UiModel[]> {
  const params = new URLSearchParams({
    category: 'text',
    facets: 'false',
    providerResults: 'false',
    limit: String(options.limit ?? 200),
  });
  const query = search?.trim();

  if (query) {
    params.set('q', query);
  }
  withModelApiCacheVersion(params);

  const response = await fetch(`/api/models?${params.toString()}`, {
    cache: 'no-cache',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error('Unable to load chat models.');
  }

  const payload = await response.json() as ModelsPayload;
  return Array.isArray(payload.data) ? payload.data : [];
}

function isMessageRole(value: string): value is Message['role'] {
  return value === 'system' || value === 'user' || value === 'assistant';
}

export function ChatConsole({ initialConversationId, initialModel = AUTO_FREE_MODEL_ID }: { initialConversationId?: string; initialModel?: string }) {
  const initialModelId = normalizeChatModelId(initialModel);
  const [models, setModels] = useState<UiModel[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [model, setModel] = useState(initialModelId);
  const [modelTabs, setModelTabs] = useState<string[]>([initialModelId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationActionId, setConversationActionId] = useState<string | null>(null);
  const [conversationLoadingId, setConversationLoadingId] = useState<string | null>(null);
  const [conversationListLoading, setConversationListLoading] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [conversationLimit, setConversationLimit] = useState(DEFAULT_CONVERSATION_LIMIT);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [conversationLimitModalOpen, setConversationLimitModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversationQuery, setConversationQuery] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearchLoading, setModelSearchLoading] = useState(false);
  const [modelLookupState, setModelLookupState] = useState<Record<string, 'pending' | 'done' | 'miss'>>({});
  const [returnToSettings, setReturnToSettings] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelTabsMenuOpen, setModelTabsMenuOpen] = useState(false);
  const [compactModelTabs, setCompactModelTabs] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [visionFilter, setVisionFilter] = useState(false);
  const [previewModelId, setPreviewModelId] = useState('auto');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.6);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const baseInputRef = useRef('');
  const modelLookupStateRef = useRef<Record<string, 'pending' | 'done' | 'miss'>>({});

  const displayModelName = useCallback((modelId: string, explicitName?: string): string => {
    const cleanName = explicitName?.trim();
    if (cleanName) {
      return cleanName;
    }

    return findChatModel(models, modelId)?.name ?? modelNameFromId(modelId);
  }, [models]);

  const routeDisplayLabel = useCallback((provider: string, modelId: string, explicitName?: string): string => (
    `${providerName(provider)} / ${displayModelName(modelId, explicitName)}`
  ), [displayModelName]);

  function setModelLookupStatus(modelId: string, status: 'pending' | 'done' | 'miss') {
    modelLookupStateRef.current = {
      ...modelLookupStateRef.current,
      [modelId]: status,
    };
    setModelLookupState(modelLookupStateRef.current);
  }

  function toggleMic() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    baseInputRef.current = input;

    type SpeechRecognitionCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((event: any) => void) | null;
      onerror: ((event: any) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };

    const SpeechRecognitionAPI =
      typeof window !== 'undefined'
        ? ((window as unknown as Record<string, unknown>).SpeechRecognition as SpeechRecognitionCtor | undefined)
          ?? ((window as unknown as Record<string, unknown>).webkitSpeechRecognition as SpeechRecognitionCtor | undefined)
        : undefined;

    if (!SpeechRecognitionAPI) {
      alert('Microphone recording is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      
      setInput(() => {
        const base = baseInputRef.current.trimEnd();
        const combined = (finalTranscript + interim).trimStart();
        return base ? `${base} ${combined}` : combined;
      });
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone access was denied. Please click the site information icon (ⓘ or 🔒) next to the URL bar above to allow microphone access, then refresh the page.');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      alert('Unable to access the microphone. Please ensure you have granted microphone permissions.');
      setIsListening(false);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const queryModel = url.searchParams.get('model');
    if (!queryModel) {
      return;
    }

    const normalizedQueryModel = normalizeChatModelId(queryModel);
    if (normalizedQueryModel === queryModel.trim()) {
      return;
    }

    url.searchParams.set('model', normalizedQueryModel);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const refreshConversations = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    let hasCachedConversations = false;

    if (!force) {
      const cachedConversations = readConversationListCache();
      if (cachedConversations) {
        hasCachedConversations = true;
        setConversations(cachedConversations);
        setConversationTotal(cachedConversations.length);
        setConversationLimit(DEFAULT_CONVERSATION_LIMIT);
        setConversationListLoading(false);
      }
    }

    if (!hasCachedConversations) {
      setConversationListLoading(true);
    }

    try {
      const response = await fetch('/api/conversations', { cache: 'no-store' });
      const payload = response.ok ? await response.json() as ConversationsPayload : { data: [] };
      const nextConversations = Array.isArray(payload.data) ? payload.data : [];
      const total = typeof payload.meta?.total === 'number' ? payload.meta.total : nextConversations.length;
      const limit = typeof payload.meta?.limit === 'number' ? payload.meta.limit : DEFAULT_CONVERSATION_LIMIT;
      setConversations(nextConversations);
      setConversationTotal(total);
      setConversationLimit(limit);
      writeConversationListCache(nextConversations);
    } catch {
      if (!hasCachedConversations) {
        setConversations([]);
        setConversationTotal(0);
        setConversationLimit(DEFAULT_CONVERSATION_LIMIT);
      }
    } finally {
      setConversationListLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cachedModels = readModelListCache();

    if (cachedModels) {
      setModels(cachedModels);
    }

    const cancelIdleFetch = scheduleBrowserIdle(() => {
      const params = withModelApiCacheVersion(new URLSearchParams({
        category: 'text',
        facets: 'false',
        providerResults: 'false',
        limit: '200',
      }));

      void fetch(`/api/models?${params.toString()}`, {
        cache: 'no-cache',
      })
        .then(response => response.json())
        .then((payload: ModelsPayload) => {
          if (cancelled) return;
          const nextModels = payload.data ?? [];
          setModels(nextModels);
          writeModelListCache(nextModels);
        })
        .catch(() => {
          /* keep cached or empty model list */
        });
    });

    return () => {
      cancelled = true;
      cancelIdleFetch();
    };
  }, []);

  useEffect(() => {
    setMaxTokens(current => current === LEGACY_DEFAULT_MAX_TOKENS ? DEFAULT_MAX_TOKENS : current);
  }, []);

  useEffect(() => {
    const cachedConversations = readConversationListCache();
    if (cachedConversations) {
      setConversations(cachedConversations);
      setConversationTotal(cachedConversations.length);
      setConversationLimit(DEFAULT_CONVERSATION_LIMIT);
    }

    let cancelled = false;
    const cancelIdleFetch = scheduleBrowserIdle(() => {
      if (!cancelled) {
        void refreshConversations();
      }
    });

    return () => {
      cancelled = true;
      cancelIdleFetch();
    };
  }, [refreshConversations]);

  useEffect(() => {
    if (!initialConversationId || activeConversationId || loading) {
      return;
    }

    const loadInitialConversation = async () => {
      setConversationLoadingId(initialConversationId);
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(initialConversationId)}`, { cache: 'no-store' });
        const payload = await response.json() as ConversationDetailPayload;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Unable to load this conversation.');
        }

        const conversation = payload.data;
        const loadedMessages = (conversation.messages ?? [])
          .filter(message => isMessageRole(message.role))
          .map(message => ({
            role: message.role as Message['role'],
            content: message.content,
            createdAt: message.createdAt ? new Date(message.createdAt).getTime() : undefined,
            tokenUsage: parseTokenUsage(message.tokenUsage) ?? estimatedUsageForMessage(message.content, message.role as Message['role']),
            ...(message.role === 'assistant'
              ? {
                provider: conversation.provider,
                modelLabel: displayModelName(conversation.modelId),
              }
              : {}),
          }));

        shouldStickToBottomRef.current = true;
        setActiveConversationId(conversation.id);
        setModel(normalizeChatModelId(conversation.modelId));
        setModelTabs([normalizeChatModelId(conversation.modelId)]);
        setActiveProvider(routeDisplayLabel(conversation.provider, conversation.modelId));
        setMessages(loadedMessages);
        setInput('');
        setAttachments([]);
        setAttachmentError('');
        scrollMessagesToBottom();
      } catch (error) {
        setConversationError(error instanceof Error ? error.message : 'Unable to load this conversation.');
      } finally {
        setConversationLoadingId(null);
      }
    };

    void loadInitialConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 1023px)');
    const syncSidebar = () => setSidebarCollapsed(media.matches);

    syncSidebar();
    media.addEventListener('change', syncSidebar);
    return () => media.removeEventListener('change', syncSidebar);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 1023px)');
    const syncTabs = () => setCompactModelTabs(media.matches);

    syncTabs();
    media.addEventListener('change', syncTabs);
    return () => media.removeEventListener('change', syncTabs);
  }, []);

  const normalizedSelectedModelId = normalizeChatModelId(model);
  const selectedIsAutoRoute = isAutoFreeModelId(normalizedSelectedModelId);
  const selectedModel = useMemo(() => findChatModel(models, normalizedSelectedModelId), [models, normalizedSelectedModelId]);
  const selectedLocked = selectedModel?.locked === true;
  const selectedLockReason = selectedModel?.lockReason ?? 'This model is locked.';
  const requestModelId = normalizedSelectedModelId;
  const selectedLabel = selectedModel
    ? `${providerName(selectedModel.provider)}: ${selectedModel.name}`
    : selectedIsAutoRoute
      ? AUTO_FREE_MODEL_LABEL
      : `${providerName(providerFromModelId(normalizedSelectedModelId))}: ${displayModelName(normalizedSelectedModelId)}`;
  const routeLabel = activeProvider ?? (
    selectedModel
      ? `${providerName(selectedModel.provider)} route`
      : selectedIsAutoRoute
        ? 'auto route'
        : `${providerName(providerFromModelId(normalizedSelectedModelId))} route`
  );
  const selectedSupportsReasoning = selectedModel
    ? selectedModel.supportsReasoning && !selectedLocked
    : selectedIsAutoRoute && models.some(item => item.supportsReasoning);
  const selectedSupportsImageUpload = selectedIsAutoRoute
    ? models.some(modelSupportsImageInput)
    : modelSupportsImageInput(selectedModel) && !selectedLocked;
  const hasUnsupportedImageAttachments = attachments.some(attachment => attachment.kind === 'image') && !selectedSupportsImageUpload;
  const canSendMessage = Boolean(input.trim() || attachments.length > 0)
    && !loading
    && !hasUnsupportedImageAttachments
    && !selectedLocked;
  const conversationCountForLimit = Math.max(conversationTotal, conversations.length);
  const isConversationLimitReached = conversationLimit > 0 && conversationCountForLimit >= conversationLimit;

  const showConversationLimitModal = useCallback(() => {
    setConversationError('');
    setSidebarCollapsed(false);
    setConversationLimitModalOpen(true);
  }, []);

  const conversationRows = useMemo(() => {
    const savedRows: ConversationRow[] = conversations.map(conversation => ({
      id: conversation.id,
      title: conversation.title,
      subtitle: `${providerName(conversation.provider)} · ${displayModelName(conversation.modelId)}`,
      modelId: conversation.modelId,
      provider: conversation.provider,
      group: conversationGroup(conversation.updatedAt),
    }));
    const query = conversationQuery.trim().toLowerCase();
    const rows = savedRows;

    if (!query) {
      return rows;
    }

    return rows.filter(row => [
      row.title,
      row.subtitle,
      row.modelId,
      row.provider,
      providerName(row.provider),
    ].join(' ').toLowerCase().includes(query));
  }, [conversationQuery, conversations, displayModelName]);
  const autoFreeModel = useMemo(() => findChatModel(models, AUTO_FREE_MODEL_ID), [models]);
  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    const selectableModels = models.filter(item => !isAutoFreeModelId(item.id));
    const baseModels = visionFilter 
      ? selectableModels.filter(modelSupportsImageInput)
      : selectableModels;

    if (!query) {
      return baseModels;
    }

    return baseModels.filter(item => [
      item.name,
      item.id,
      item.modelId,
      providerName(item.provider),
      item.provider,
      item.description,
      ...item.tags,
    ].join(' ').toLowerCase().includes(query));
  }, [modelQuery, models, visionFilter]);
  const autoFreeMatchesQuery = useMemo(() => {
    if (visionFilter) {
      return false;
    }

    if (!autoFreeModel) {
      return true;
    }

    const query = modelQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      autoFreeModel.name,
      autoFreeModel.id,
      autoFreeModel.modelId,
      providerName(autoFreeModel.provider),
      autoFreeModel.provider,
      autoFreeModel.description,
      ...autoFreeModel.tags,
    ].join(' ').toLowerCase().includes(query);
  }, [autoFreeModel, modelQuery]);
  const modelPickerCount = filteredModels.length + (autoFreeMatchesQuery ? 1 : 0);
  const previewModel = useMemo(() => findChatModel(models, previewModelId), [models, previewModelId]);
  const modelTabItems = useMemo(() => modelTabs.map(tabModelId => {
    const uiModel = findChatModel(models, tabModelId);
    const isAuto = isAutoFreeModelId(tabModelId);
    const label = uiModel?.name ?? (isAuto ? autoFreeModel?.name ?? AUTO_FREE_MODEL_LABEL : displayModelName(tabModelId));
    const title = uiModel ? `${providerName(uiModel.provider)}: ${uiModel.name}` : label;

    return {
      id: normalizeChatModelId(tabModelId),
      label,
      title,
      uiModel,
    };
  }), [autoFreeModel, displayModelName, modelTabs, models]);
  const maxVisibleModelTabs = compactModelTabs ? COMPACT_VISIBLE_MODEL_TABS : DESKTOP_VISIBLE_MODEL_TABS;
  const { overflowModelTabItems, visibleModelTabItems } = useMemo(() => {
    if (modelTabItems.length <= maxVisibleModelTabs) {
      return {
        overflowModelTabItems: [],
        visibleModelTabItems: modelTabItems,
      };
    }

    const visibleIds = new Set(modelTabItems.slice(0, maxVisibleModelTabs).map(item => item.id));
    if (!visibleIds.has(model)) {
      const lastVisible = modelTabItems[maxVisibleModelTabs - 1];
      if (lastVisible) {
        visibleIds.delete(lastVisible.id);
      }
      visibleIds.add(model);
    }

    return {
      overflowModelTabItems: modelTabItems.filter(item => !visibleIds.has(item.id)),
      visibleModelTabItems: modelTabItems.filter(item => visibleIds.has(item.id)),
    };
  }, [maxVisibleModelTabs, model, modelTabItems]);
  const systemPromptEnabled = systemPrompt.trim().length > 0;
  const emptyStateTitle = selectedModel
    ? selectedModel.name
    : selectedIsAutoRoute
      ? AUTO_FREE_MODEL_LABEL
      : displayModelName(normalizedSelectedModelId);
  const emptyStateProvider = selectedModel
    ? providerName(selectedModel.provider)
    : selectedIsAutoRoute
      ? 'OpenProvider'
      : providerName(providerFromModelId(normalizedSelectedModelId));
  const emptyStateContext = selectedModel
    ? `${compactNumber(selectedModel.maxInputTokens)} context`
    : selectedIsAutoRoute
      ? `${models.length || '...'} free chat models`
      : modelLookupState[normalizedSelectedModelId] === 'pending'
        ? 'checking model'
        : 'selected model';
  const emptyStateBadges = [
    emptyStateProvider,
    emptyStateContext,
    selectedSupportsReasoning && thinkingEnabled ? 'thinking on' : 'standard chat',
    selectedSupportsImageUpload ? 'image input' : 'text input',
  ];

  useEffect(() => {
    const lookupModelId = normalizedSelectedModelId;
    const lookupState = modelLookupStateRef.current[lookupModelId];

    if (!lookupModelId || selectedIsAutoRoute || selectedModel || lookupState === 'pending' || lookupState === 'done' || lookupState === 'miss') {
      return;
    }

    const controller = new AbortController();
    setModelLookupStatus(lookupModelId, 'pending');

    async function loadExactModel() {
      try {
        const results = await fetchChatModels(lookupModelId, { limit: 50, signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }

        setModels(current => mergeUniqueChatModels(current, results));
        setModelLookupStatus(lookupModelId, results.some(item => chatModelMatchesId(item, lookupModelId)) ? 'done' : 'miss');
      } catch {
        if (!controller.signal.aborted) {
          setModelLookupStatus(lookupModelId, 'miss');
        }
      }
    }

    void loadExactModel();

    return () => controller.abort();
  }, [normalizedSelectedModelId, selectedIsAutoRoute, selectedModel]);

  useEffect(() => {
    if (!modelPickerOpen) {
      setModelSearchLoading(false);
      return;
    }

    const query = modelQuery.trim();
    if (query.length < 2) {
      setModelSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setModelSearchLoading(true);
      void fetchChatModels(query, { limit: 100, signal: controller.signal })
        .then(results => {
          if (!controller.signal.aborted) {
            setModels(current => mergeUniqueChatModels(current, results));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) {
            setModelSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [modelPickerOpen, modelQuery]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const doScroll = () => {
      const list = messageListRef.current;
      if (!list) return;
      list.scrollTo({ top: list.scrollHeight, behavior });
    };
    // Double rAF handles mobile keyboard collapse / layout shifts
    window.requestAnimationFrame(() => window.requestAnimationFrame(doScroll));
  }, []);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scrollMessagesToBottom(loading ? 'auto' : 'smooth');
  }, [loading, messages, scrollMessagesToBottom]);

  useEffect(() => {
    if (overflowModelTabItems.length === 0) {
      setModelTabsMenuOpen(false);
    }
  }, [overflowModelTabItems.length]);

  useEffect(() => {
    const hasImageAttachments = attachments.some(attachment => attachment.kind === 'image');
    if (hasImageAttachments && !selectedSupportsImageUpload) {
      setAttachmentError('The selected model does not list image input. Switch to a vision model or remove attachments.');
    } else if (attachmentError.startsWith('The selected model does not list image input')) {
      setAttachmentError('');
    }
  }, [attachmentError, attachments, selectedSupportsImageUpload]);

  function handleMessageListScroll() {
    const list = messageListRef.current;

    if (!list) {
      return;
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 160;
  }

  useEffect(() => {
    if (!modelPickerOpen && !settingsOpen && !modelTabsMenuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setModelPickerOpen(false);
        setSettingsOpen(false);
        setModelTabsMenuOpen(false);
        setReturnToSettings(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modelPickerOpen, modelTabsMenuOpen, settingsOpen]);

  function openModelPicker(restoreSettings = false) {
    setReturnToSettings(restoreSettings);
    setModelTabsMenuOpen(false);
    if (restoreSettings) {
      setSettingsOpen(false);
    }
    setModelPickerOpen(true);
    setModelQuery('');
    setPreviewModelId(selectedModel?.id ?? normalizedSelectedModelId);
  }

  function closeModelPicker() {
    setModelPickerOpen(false);
    setReturnToSettings(false);
  }

  function activateModelTab(nextModel: string) {
    const nextModelId = normalizeChatModelId(nextModel);
    setModel(nextModelId);
    setActiveProvider(null);
    setModelTabsMenuOpen(false);
  }

  function chooseModel(nextModel: string) {
    const nextModelId = normalizeChatModelId(nextModel);
    setModel(nextModelId);
    setModelTabs(current => current.includes(nextModelId) ? current : [...current, nextModelId]);
    setActiveProvider(null);
    setModelPickerOpen(false);
    setModelTabsMenuOpen(false);
    if (returnToSettings) {
      setSettingsOpen(true);
      setReturnToSettings(false);
    }
  }

  function closeModelTab(tabModelId: string) {
    const nextTabs = modelTabs.filter(item => item !== tabModelId);
    const safeTabs = nextTabs.length > 0 ? nextTabs : [AUTO_FREE_MODEL_ID];
    const tabIndex = modelTabs.indexOf(tabModelId);
    setModelTabs(safeTabs);
    setModelTabsMenuOpen(false);

    if (model === tabModelId || !safeTabs.includes(model)) {
      const fallbackIndex = Math.max(0, Math.min(tabIndex, safeTabs.length - 1));
      setModel(safeTabs[fallbackIndex] ?? AUTO_FREE_MODEL_ID);
      setActiveProvider(null);
    }
  }

  function resetChat() {
    if (isConversationLimitReached) {
      showConversationLimitModal();
      return;
    }

    shouldStickToBottomRef.current = true;
    setActiveConversationId(null);
    setConversationError('');
    setConversationLoadingId(null);
    setMessages([]);
    setInput('');
    setAttachments([]);
    setAttachmentError('');
    setActiveProvider(null);
    setConversationQuery('');
    setModelTabs([model]);
  }

  function resetSettings() {
    setSystemPrompt('');
    setTemperature(0.6);
    setMaxTokens(DEFAULT_MAX_TOKENS);
    setThinkingEnabled(true);
  }

  function reusePrompt(content: string) {
    setInput(content);
    window.requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  async function addAttachments(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    const availableSlots = MAX_CHAT_ATTACHMENTS - attachments.length;
    if (availableSlots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files.`);
      return;
    }

    const acceptedFiles = files.slice(0, availableSlots);
    const rejectedCount = files.length - acceptedFiles.length;
    const nextAttachments: ComposerAttachment[] = [];

    try {
      for (const file of acceptedFiles) {
        if (file.size <= 0) {
          throw new Error(`${file.name} is empty.`);
        }

        if (file.type.startsWith('image/')) {
          if (!selectedSupportsImageUpload) {
            throw new Error('The selected model does not list image input. Switch to a vision model before attaching images.');
          }

          if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
            throw new Error(`${file.name} exceeds the 20 MB limit.`);
          }

          nextAttachments.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
            kind: 'image',
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: await readFileAsDataUrl(file),
          });
          continue;
        }

        if (!isTextAttachmentFile(file)) {
          throw new Error('Chat attachments support images and text-like files right now.');
        }

        if (file.size > MAX_CHAT_TEXT_ATTACHMENT_BYTES) {
          throw new Error(`${file.name} exceeds the 1 MB text-file limit.`);
        }

        nextAttachments.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          kind: 'text',
          name: file.name,
          type: file.type || 'text/plain',
          size: file.size,
          text: await readFileAsText(file),
        });
      }

      setAttachments(current => [...current, ...nextAttachments]);
      setAttachmentError(rejectedCount > 0 ? `Added ${nextAttachments.length}; ${rejectedCount} file(s) skipped because the limit is ${MAX_CHAT_ATTACHMENTS}.` : '');
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Unable to attach this image.');
    }
  }

  function removeAttachment(id: string) {
    setAttachments(current => current.filter(attachment => attachment.id !== id));
    setAttachmentError('');
  }

  async function copyMessageContent(content: string, key: string) {
    const text = content.trim();
    if (!text) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedMessageKey(key);
      window.setTimeout(() => {
        setCopiedMessageKey(current => current === key ? null : current);
      }, 1500);
    } catch {
      setCopiedMessageKey(null);
    }
  }

  async function submitChatTurn({
    promptText,
    baseMessages,
    appendUserMessage,
    attachments: turnAttachments = [],
    clearInput = false,
    replaceConversationMessages = false,
  }: ChatTurnOptions) {
    const text = promptText.trim();
    if (loading || (appendUserMessage && !text && turnAttachments.length === 0) || (!appendUserMessage && baseMessages.length === 0)) {
      return;
    }

    if (appendUserMessage && !activeConversationId && !replaceConversationMessages && isConversationLimitReached) {
      showConversationLimitModal();
      return;
    }

    const requestStartedAt = performance.now();
    const hasImageTurnAttachments = turnAttachments.some(attachment => attachment.kind === 'image');
    const userDisplayContent = text || (turnAttachments.length > 0
      ? hasImageTurnAttachments ? 'Analyze the attached image.' : 'Use the attached file context.'
      : '');
    const userAttachmentMeta = turnAttachments.map(({ kind, name, type, size }) => ({ kind, name, type, size }));
    const userPersistenceContent = [
      userDisplayContent,
      attachmentSummary(userAttachmentMeta),
    ].filter(Boolean).join('\n\n');
    const nextMessages: Message[] = appendUserMessage
      ? [...baseMessages, {
        role: 'user',
        content: userDisplayContent,
        attachments: userAttachmentMeta,
        createdAt: Date.now(),
        tokenUsage: estimatedUsageForMessage(userDisplayContent, 'user'),
      }]
      : [...baseMessages];
    const assistantIndex = nextMessages.length;
    const requestMessages: ApiChatMessage[] = nextMessages.map(message => ({
      ...message,
      content: message.content,
    }));
    if (appendUserMessage && turnAttachments.length > 0) {
      requestMessages[requestMessages.length - 1] = {
        ...requestMessages[requestMessages.length - 1],
        content: buildUserMessageContent(text, turnAttachments),
      };
    }
    const apiMessages: ApiChatMessage[] = systemPromptEnabled
      ? [{ role: 'system', content: systemPrompt.trim() }, ...requestMessages]
      : requestMessages;
    const requestThinking = thinkingEnabled && selectedSupportsReasoning;
    const initialAssistantProvider = selectedModel?.provider ?? (selectedIsAutoRoute ? 'openprovider' : providerFromModelId(normalizedSelectedModelId));
    const initialAssistantLabel = selectedModel
      ? selectedModel.name
      : selectedIsAutoRoute
        ? AUTO_FREE_MODEL_LABEL
        : displayModelName(normalizedSelectedModelId);
    const requestConversationId = activeConversationId;
    let completedConversationId = requestConversationId;
    let assistantContent = '';
    let assistantReasoning = '';
    let assistantUsage: TokenUsage | undefined;
    shouldStickToBottomRef.current = true;
    setMessages([...nextMessages, {
      role: 'assistant',
      content: '',
      reasoning: '',
      reasoningRequested: requestThinking,
      provider: initialAssistantProvider,
      modelLabel: initialAssistantLabel,
      createdAt: Date.now(),
    }]);
    if (clearInput) {
      setInput('');
      setAttachments([]);
      setAttachmentError('');
    }
    setLoading(true);

    function updateAssistant(updater: (message: Message) => Message) {
      setMessages(current => current.map((message, index) => (
        index === assistantIndex && message.role === 'assistant' ? updater(message) : message
      )));
    }

    function finalizeAssistant() {
      updateAssistant(message => {
        const split = splitThinkingMarkup(assistantContent || message.content, {
          allowLeadingReasoning: Boolean(message.reasoningRequested),
        });
        const fallbackSplit = splitThinkingMarkup(message.content, {
          allowLeadingReasoning: Boolean(message.reasoningRequested),
        });
        const finalReasoning = mergeReasoningSegments(
          assistantReasoning,
          split.reasoning,
          fallbackSplit.reasoning,
          message.reasoning,
        );
        const finalContent = split.content || fallbackSplit.content || 'The model returned an empty message.';
        return {
          ...message,
          content: finalContent,
          reasoning: finalReasoning,
          reasoningComplete: Boolean(finalReasoning.trim()) || message.reasoningComplete,
          latencyMs: Math.round(performance.now() - requestStartedAt),
          tokenUsage: assistantUsage ?? estimatedUsageForMessage(finalContent, 'assistant'),
          completedAt: Date.now(),
        };
      });
    }

    async function fallbackCompletion() {
      const fallbackResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: requestModelId,
          messages: apiMessages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          thinking: requestThinking,
          conversationId: requestConversationId ?? undefined,
          displayUserContent: appendUserMessage ? userPersistenceContent : undefined,
          replaceConversationMessages: replaceConversationMessages || undefined,
          ...(requestThinking ? { reasoning_effort: 'medium' } : {}),
        }),
      });
      const payload = await fallbackResponse.json() as ChatErrorPayload & {
        content?: string;
        conversationId?: string;
        model?: string;
        modelName?: string;
        provider?: string;
        raw?: { usage?: unknown };
        reasoning?: string;
        usage?: unknown;
      };

      if (!fallbackResponse.ok) {
        if (payload?.error?.code === CONVERSATION_LIMIT_ERROR_CODE) {
          showConversationLimitModal();
        }
        throw new ChatRequestError(payload?.error?.message ?? 'Chat request failed.', false);
      }

      const responseProvider = payload.provider;
      const responseModel = payload.model;
      if (responseProvider && responseModel) {
        setActiveProvider(routeDisplayLabel(responseProvider, responseModel, payload.modelName));
        updateAssistant(message => ({
          ...message,
          provider: responseProvider,
          modelLabel: displayModelName(responseModel, payload.modelName),
        }));
      }

      if (typeof payload.conversationId === 'string' && payload.conversationId) {
        completedConversationId = payload.conversationId;
        setActiveConversationId(payload.conversationId);
      }

      const split = splitThinkingMarkup(payload.content || '');
      assistantContent = split.content;
      assistantReasoning = [payload.reasoning, split.reasoning].filter(Boolean).join('\n\n');
      assistantUsage = parseTokenUsage(payload.usage ?? payload.raw?.usage);
      updateAssistant(message => ({
        ...message,
        content: assistantContent || 'The model returned an empty message.',
        reasoning: assistantReasoning || message.reasoning,
        reasoningComplete: Boolean(assistantReasoning.trim()) || message.reasoningComplete,
      }));
      finalizeAssistant();
    }

    let clearStreamStallTimer = () => {};

    try {
      const controller = new AbortController();
      let streamSettled = false;
      let streamSawEvent = false;
      let stallTimer = window.setTimeout(() => controller.abort(), STREAM_STALL_TIMEOUT_MS);
      clearStreamStallTimer = () => window.clearTimeout(stallTimer);
      const refreshStallTimer = () => {
        clearStreamStallTimer();
        stallTimer = window.setTimeout(() => controller.abort(), STREAM_STALL_TIMEOUT_MS);
      };
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: requestModelId,
          messages: apiMessages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
          thinking: requestThinking,
          conversationId: requestConversationId ?? undefined,
          displayUserContent: appendUserMessage ? userPersistenceContent : undefined,
          replaceConversationMessages: replaceConversationMessages || undefined,
          ...(requestThinking ? { reasoning_effort: 'medium' } : {}),
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => undefined) as ChatErrorPayload | undefined;
        if (payload?.error?.code === CONVERSATION_LIMIT_ERROR_CODE) {
          showConversationLimitModal();
        }
        throw new ChatRequestError(payload?.error?.message ?? 'Chat request failed.', false);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamSettled = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBlocks(buffer);
        buffer = parsed.rest;

        if (parsed.events.length > 0) {
          refreshStallTimer();
        }

        for (const event of parsed.events) {
          streamSawEvent = true;

          if (event.type === 'metadata' && event.provider && event.model) {
            const routedProvider = event.provider;
            const routedModel = event.model;
            setActiveProvider(routeDisplayLabel(routedProvider, routedModel, event.modelName));
            updateAssistant(message => ({
              ...message,
              provider: routedProvider,
              modelLabel: displayModelName(routedModel, event.modelName),
            }));
          }

          if (event.type === 'delta' && event.content) {
            assistantContent += event.content;
            updateAssistant(message => {
              const nextContent = `${message.content}${event.content}`;
              const split = splitThinkingMarkup(nextContent, {
                allowLeadingReasoning: Boolean(message.reasoningRequested),
              });

              return {
                ...message,
                content: nextContent,
                reasoning: split.reasoning.trim() ? split.reasoning : message.reasoning,
              };
            });
          }

          if (event.type === 'reasoning' && event.content) {
            assistantReasoning += event.content;
            updateAssistant(message => ({
              ...message,
              reasoning: `${message.reasoning ?? ''}${event.content}`,
              reasoningComplete: true,
            }));
          }

          if (event.type === 'done') {
            if (typeof event.conversationId === 'string' && event.conversationId) {
              completedConversationId = event.conversationId;
              setActiveConversationId(event.conversationId);
            }

            if (event.provider && event.model) {
              const routedProvider = event.provider;
              const routedModel = event.model;
              setActiveProvider(routeDisplayLabel(routedProvider, routedModel, event.modelName));
              updateAssistant(message => ({
                ...message,
                provider: routedProvider,
                modelLabel: displayModelName(routedModel, event.modelName),
              }));
            }
            assistantContent = event.content ?? assistantContent;
            assistantReasoning = event.reasoning ?? assistantReasoning;
            assistantUsage = parseTokenUsage(event.usage) ?? assistantUsage;
            const split = splitThinkingMarkup(assistantContent);
            assistantContent = split.content || assistantContent;
            assistantReasoning = [assistantReasoning, split.reasoning].filter(Boolean).join('\n\n');
            updateAssistant(message => ({
              ...message,
              content: assistantContent || message.content,
              reasoning: assistantReasoning || message.reasoning,
              reasoningComplete: Boolean(assistantReasoning.trim()) || message.reasoningComplete,
            }));
          }

          if (event.type === 'error') {
            if (event.code === CONVERSATION_LIMIT_ERROR_CODE) {
              showConversationLimitModal();
            }
            throw new ChatRequestError(event.message ?? 'Streaming chat request failed.', false);
          }
        }
      }
      clearStreamStallTimer();

      const tailEvent = parseSseBlock(buffer);
      if (tailEvent?.type === 'done') {
        streamSawEvent = true;
        streamSettled = true;
        if (typeof tailEvent.conversationId === 'string' && tailEvent.conversationId) {
          completedConversationId = tailEvent.conversationId;
          setActiveConversationId(tailEvent.conversationId);
        }
        assistantContent = tailEvent.content ?? assistantContent;
        assistantReasoning = tailEvent.reasoning ?? assistantReasoning;
        assistantUsage = parseTokenUsage(tailEvent.usage) ?? assistantUsage;
        if (tailEvent.provider && tailEvent.model) {
          const routedProvider = tailEvent.provider;
          const routedModel = tailEvent.model;
          setActiveProvider(routeDisplayLabel(routedProvider, routedModel, tailEvent.modelName));
          updateAssistant(message => ({
            ...message,
            provider: routedProvider,
            modelLabel: displayModelName(routedModel, tailEvent.modelName),
          }));
        }
        const split = splitThinkingMarkup(assistantContent);
        assistantContent = split.content || assistantContent;
        assistantReasoning = [assistantReasoning, split.reasoning].filter(Boolean).join('\n\n');
        updateAssistant(message => ({
          ...message,
          content: assistantContent || message.content,
          reasoning: assistantReasoning || message.reasoning,
          reasoningComplete: Boolean(assistantReasoning.trim()) || message.reasoningComplete,
        }));
      }

      if (!streamSettled || !streamSawEvent) {
        await fallbackCompletion();
      } else {
        finalizeAssistant();
      }

      if (completedConversationId) {
        void refreshConversations({ force: true });
      }
    } catch (error) {
      clearStreamStallTimer();

      if (!assistantContent.trim() && shouldRunFallbackCompletion(error)) {
        try {
          await fallbackCompletion();
          if (completedConversationId) {
            void refreshConversations({ force: true });
          }
        } catch (fallbackError) {
          updateAssistant(message => ({
            ...message,
            content: message.content || (fallbackError instanceof Error ? fallbackError.message : 'Chat request failed.'),
            reasoning: '',
            latencyMs: Math.round(performance.now() - requestStartedAt),
            tokenUsage: estimatedUsageForMessage(
              message.content || (fallbackError instanceof Error ? fallbackError.message : 'Chat request failed.'),
              'assistant'
            ),
            completedAt: Date.now(),
          }));
        }
        return;
      }

      updateAssistant(message => ({
        ...message,
        content: message.content || (error instanceof Error ? error.message : 'Chat request failed.'),
        reasoning: '',
        latencyMs: Math.round(performance.now() - requestStartedAt),
        tokenUsage: estimatedUsageForMessage(
          message.content || (error instanceof Error ? error.message : 'Chat request failed.'),
          'assistant'
        ),
        completedAt: Date.now(),
      }));
    } finally {
      clearStreamStallTimer();
      setLoading(false);
    }
  }

  function previousUserIndexBefore(index: number, sourceMessages = messages) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (sourceMessages[cursor]?.role === 'user') {
        return cursor;
      }
    }

    return -1;
  }

  async function sendMessage() {
    await submitChatTurn({
      promptText: input,
      baseMessages: messages,
      appendUserMessage: true,
      attachments,
      clearInput: true,
    });
  }

  async function regenerateAssistantMessage(index: number) {
    if (loading || messages[index]?.role !== 'assistant') {
      return;
    }

    const userIndex = previousUserIndexBefore(index);
    const promptText = userIndex >= 0 ? messages[userIndex]?.content ?? '' : '';
    if (!promptText.trim()) {
      return;
    }

    await submitChatTurn({
      promptText,
      baseMessages: messages.slice(0, index),
      appendUserMessage: false,
      replaceConversationMessages: true,
    });
  }

  function persistedConversationMessages(sourceMessages: Message[]): PersistedConversationMessage[] {
    return sourceMessages
      .filter((message): message is Message & { role: 'user' | 'assistant' } => (
        (message.role === 'user' || message.role === 'assistant') && Boolean(message.content.trim())
      ))
      .map(message => ({
        role: message.role,
        content: message.content,
        tokenUsage: message.tokenUsage,
      }));
  }

  async function persistConversationMessages(nextMessages: Message[]) {
    if (!activeConversationId) {
      return true;
    }

    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(activeConversationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: persistedConversationMessages(nextMessages) }),
      });
      const payload = await response.json() as ConversationMutationPayload;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to update this conversation.');
      }

      setConversations(current => {
        const next = current.map(conversation => (
          conversation.id === activeConversationId
            ? {
              ...conversation,
              updatedAt: payload.data?.updatedAt ?? conversation.updatedAt,
            }
            : conversation
        ));
        writeConversationListCache(next);
        return next;
      });
      return true;
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : 'Unable to update this conversation.');
      return false;
    }
  }

  async function deleteMessage(index: number) {
    if (loading || !messages[index]) {
      return;
    }

    const previousMessages = messages;
    const nextMessages = messages.filter((_, messageIndex) => messageIndex !== index);
    setConversationError('');
    setMessages(nextMessages);

    const saved = await persistConversationMessages(nextMessages);
    if (!saved) {
      setMessages(previousMessages);
    }
  }

  async function selectConversation(row: ConversationRow) {
    if (loading || conversationActionId || conversationLoadingId === row.id) {
      return;
    }

    setConversationError('');
    setConversationLoadingId(row.id);

    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      const payload = await response.json() as ConversationDetailPayload;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load this conversation.');
      }

      const conversation = payload.data;
      const loadedMessages = (conversation.messages ?? [])
        .filter(message => isMessageRole(message.role))
        .map(message => ({
          role: message.role as Message['role'],
          content: message.content,
          createdAt: message.createdAt ? new Date(message.createdAt).getTime() : undefined,
          tokenUsage: parseTokenUsage(message.tokenUsage) ?? estimatedUsageForMessage(message.content, message.role as Message['role']),
          ...(message.role === 'assistant'
            ? {
              provider: conversation.provider,
              modelLabel: displayModelName(conversation.modelId),
            }
            : {}),
        }));

      shouldStickToBottomRef.current = true;
      setActiveConversationId(conversation.id);
      setModel(normalizeChatModelId(conversation.modelId));
      setModelTabs([normalizeChatModelId(conversation.modelId)]);
      setActiveProvider(routeDisplayLabel(conversation.provider, conversation.modelId));
      setMessages(loadedMessages);
      setInput('');
      setAttachments([]);
      setAttachmentError('');
      scrollMessagesToBottom();
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : 'Unable to load this conversation.');
    } finally {
      setConversationLoadingId(null);
    }
  }

  async function renameConversation(row: ConversationRow, title: string): Promise<boolean> {
    const nextTitle = title.trim().replace(/\s+/g, ' ');
    if (!nextTitle) {
      setConversationError('Enter a conversation title.');
      return false;
    }

    if (nextTitle === row.title) {
      return true;
    }

    setConversationError('');
    setConversationActionId(row.id);

    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      const payload = await response.json() as ConversationMutationPayload;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to rename this conversation.');
      }

      setConversations(current => {
        const next = current.map(conversation => (
          conversation.id === row.id
            ? {
              ...conversation,
              title: payload.data?.title ?? nextTitle,
              updatedAt: payload.data?.updatedAt ?? conversation.updatedAt,
            }
            : conversation
        ));
        writeConversationListCache(next);
        return next;
      });
      return true;
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : 'Unable to rename this conversation.');
      return false;
    } finally {
      setConversationActionId(null);
    }
  }

  async function deleteConversation(row: ConversationRow): Promise<boolean> {
    setConversationError('');
    setConversationActionId(row.id);

    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({})) as ConversationMutationPayload;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Unable to delete this conversation.');
      }

      setConversations(current => {
        const next = current.filter(conversation => conversation.id !== row.id);
        writeConversationListCache(next);
        return next;
      });
      setConversationTotal(current => Math.max(0, (current || conversations.length) - 1));
      void refreshConversations({ force: true });

      if (activeConversationId === row.id) {
        shouldStickToBottomRef.current = true;
        setActiveConversationId(null);
        setConversationLoadingId(null);
        setMessages([]);
        setInput('');
        setActiveProvider(null);
      }

      return true;
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : 'Unable to delete this conversation.');
      return false;
    } finally {
      setConversationActionId(null);
    }
  }

  const groupedConversations: Record<ConversationGroup, ConversationRow[]> = {
    Today: conversationRows.filter(row => row.group === 'Today'),
    'Previous 7 Days': conversationRows.filter(row => row.group === 'Previous 7 Days'),
    'Previous 30 Days': conversationRows.filter(row => row.group === 'Previous 30 Days'),
  };

  return (
    <section className={clsx('chat-layout', sidebarCollapsed && 'sidebar-collapsed')}>
      <Suspense
        fallback={(
          <ChatSidebarFallback
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed(current => !current)}
          />
        )}
      >
        <ChatSidebar
          activeConversationId={activeConversationId}
          collapsed={sidebarCollapsed}
          conversationActionId={conversationActionId}
          conversationError={conversationError}
          conversationLoadingId={conversationLoadingId}
          conversationListLoading={conversationListLoading}
          conversationLimit={conversationLimit}
          conversationLimitOpen={conversationLimitModalOpen}
          conversationQuery={conversationQuery}
          conversationRows={conversationRows}
          conversationTotal={conversationCountForLimit}
          groupedConversations={groupedConversations}
          loading={loading}
          messageCount={messages.length}
          modelCount={models.length}
          onConversationQueryChange={setConversationQuery}
          onDeleteConversation={deleteConversation}
          onCloseConversationLimit={() => setConversationLimitModalOpen(false)}
          onRenameConversation={renameConversation}
          onReviewConversations={() => {
            setSidebarCollapsed(false);
            setConversationLimitModalOpen(false);
          }}
          onResetChat={resetChat}
          onSelectConversation={row => void selectConversation(row)}
          onToggleCollapsed={() => setSidebarCollapsed(current => !current)}
          routeLabel={routeLabel}
        />
      </Suspense>

      <div className="chat-panel">
        <div className="chat-topline">
          <button
            aria-label={sidebarCollapsed ? 'Show conversations' : 'Hide conversations'}
            aria-pressed={!sidebarCollapsed}
            className="mobile-sidebar-button"
            onClick={() => setSidebarCollapsed(current => !current)}
            title={sidebarCollapsed ? 'Show conversations' : 'Hide conversations'}
            type="button"
          >
            <PanelLeft size={17} />
          </button>
          <div className="chat-model-tabs" aria-label="Conversation models">
            {visibleModelTabItems.map(item => (
              <div className={clsx('chat-model-tab', item.id === model && 'active')} key={item.id}>
                <button
                  className="chat-model-pill"
                  onClick={() => activateModelTab(item.id)}
                  title={item.title}
                  type="button"
                >
                  {item.uiModel ? <ProviderMark provider={item.uiModel.provider} /> : <Bot size={18} />}
                  <span>{item.label}</span>
                </button>
                <button
                  className="chat-model-action"
                  onClick={() => closeModelTab(item.id)}
                  title="Remove model tab"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {overflowModelTabItems.length > 0 && (
              <div className="chat-model-overflow">
                <button
                  aria-expanded={modelTabsMenuOpen}
                  className={clsx('chat-model-overflow-button', modelTabsMenuOpen && 'active')}
                  onClick={() => setModelTabsMenuOpen(current => !current)}
                  title="Show more model tabs"
                  type="button"
                >
                  <MoreVertical size={16} />
                  <span>{overflowModelTabItems.length}</span>
                </button>
                {modelTabsMenuOpen && (
                  <div className="chat-model-overflow-menu" role="menu">
                    <div className="chat-model-overflow-head">
                      <span>More models</span>
                      <small>{overflowModelTabItems.length} hidden</small>
                    </div>
                    {overflowModelTabItems.map(item => (
                      <div className="chat-model-overflow-row" key={item.id}>
                        <button
                          className="chat-model-overflow-select"
                          onClick={() => activateModelTab(item.id)}
                          role="menuitem"
                          title={item.title}
                          type="button"
                        >
                          {item.uiModel ? <ProviderMark provider={item.uiModel.provider} /> : <Bot size={16} />}
                          <span className="chat-model-overflow-copy">
                            <strong>{item.label}</strong>
                            <small>
                              {item.uiModel
                                ? `${providerName(item.uiModel.provider)} · ${modelStatusLabel(item.uiModel)}`
                                : 'OpenProvider auto route'}
                            </small>
                          </span>
                        </button>
                        <button
                          className="chat-model-overflow-close"
                          onClick={() => closeModelTab(item.id)}
                          title="Remove model tab"
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className="chat-model-add" onClick={() => openModelPicker()} title="Add model tab" type="button">
              <Plus size={18} />
            </button>
          </div>
          <div className="chat-route-status" title={routeLabel}>
            <Route size={15} />
            <span>{routeLabel}</span>
            <small>{models.length || '...'} models</small>
          </div>
        </div>

        {settingsOpen && (
          <div className="chat-settings-backdrop" onClick={() => setSettingsOpen(false)}>
            <section
              aria-label="Chat model settings"
              aria-modal="true"
              className="chat-settings-dialog"
              onClick={event => event.stopPropagation()}
              role="dialog"
            >
              <button className="chat-settings-close" onClick={() => setSettingsOpen(false)} title="Close settings" type="button">
                <X size={16} />
              </button>

              <div className="chat-settings-title">
                {selectedModel ? <ProviderMark provider={selectedModel.provider} /> : <Bot size={18} />}
                <div>
                  <h2>Model settings</h2>
                  <p>{selectedLabel}</p>
                </div>
              </div>

              <div className="settings-field">
                <span>Model</span>
                <button className="settings-model-select" onClick={() => openModelPicker(true)} type="button">
                  {selectedModel ? <ProviderMark provider={selectedModel.provider} /> : <Bot size={18} />}
                  <span>
                    <strong>{selectedLabel}</strong>
                    <small>Search and choose a free chat model</small>
                  </span>
                  <Search size={17} />
                </button>
              </div>

              <label className={clsx('settings-check', !selectedSupportsReasoning && 'disabled')}>
                <input
                  checked={thinkingEnabled && selectedSupportsReasoning}
                  disabled={!selectedSupportsReasoning}
                  onChange={event => setThinkingEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Thinking</strong>
                  <small>
                    {selectedSupportsReasoning
                      ? 'Stream reasoning separately when the provider exposes it.'
                      : 'Not listed for this model.'}
                  </small>
                </span>
              </label>

              <div className="settings-field">
                <span>System prompt</span>
                <div className="settings-segmented">
                  <button className={!systemPromptEnabled ? 'active' : undefined} onClick={() => setSystemPrompt('')} type="button">Default</button>
                  <button className={systemPromptEnabled ? 'active' : undefined} onClick={() => setSystemPrompt(systemPrompt || 'You are a helpful assistant.')} type="button">Custom</button>
                </div>
                <textarea
                  disabled={!systemPromptEnabled}
                  onChange={event => setSystemPrompt(event.target.value)}
                  placeholder="Use the default provider behavior, or enter a custom system prompt."
                  value={systemPrompt}
                />
              </div>

              <div className="settings-field">
                <span><SlidersHorizontal size={15} /> Sampling parameters</span>
                <div className="settings-grid">
                  <label>
                    <span>Temperature</span>
                    <input
                      max="2"
                      min="0"
                      onChange={event => setTemperature(Number(event.target.value))}
                      step="0.1"
                      type="number"
                      value={temperature}
                    />
                  </label>
                  <label>
                    <span>Max tokens</span>
                    <input
                      max="8192"
                      min="64"
                      onChange={event => setMaxTokens(Number(event.target.value))}
                      step="64"
                      type="number"
                      value={maxTokens}
                    />
                  </label>
                </div>
              </div>

              <div className="chat-settings-actions">
                <button className="button-link secondary" onClick={resetSettings} type="button">
                  <RotateCcw size={15} />
                  Reset
                </button>
                <button className="button-link" onClick={() => setSettingsOpen(false)} type="button">Done</button>
              </div>
            </section>
          </div>
        )}

        {modelPickerOpen && (
          <div className="model-picker-backdrop" onClick={closeModelPicker}>
            <section
              aria-label="Select a chat model"
              aria-modal="true"
              className="model-picker"
              onClick={event => event.stopPropagation()}
              role="dialog"
            >
              <button className="model-picker-close" onClick={closeModelPicker} title="Close model picker" type="button">
                <X size={16} />
              </button>

              <div className="model-picker-list">
                <label className="model-picker-search">
                  <Search size={18} />
                  <input
                    autoFocus
                    onChange={event => setModelQuery(event.target.value)}
                    placeholder="Search models"
                    value={modelQuery}
                  />
                </label>

                <div className="model-picker-filters">
                  <span>Chat</span>
                  <span>Free</span>
                  <span>{modelPickerCount} models</span>
                  <button 
                    className={clsx('vision-filter-button', visionFilter && 'active')} 
                    onClick={() => setVisionFilter(v => !v)} 
                    type="button"
                  >
                    Image Input
                  </button>
                  {modelQuery && (
                    <button onClick={() => setModelQuery('')} type="button">Clear</button>
                  )}
                </div>

                <div className="model-picker-section">Free chat models</div>

                <div className="model-picker-scroll">
                  {autoFreeMatchesQuery && (
                    <button
                      className={clsx('model-picker-row', isAutoFreeModelId(model) && 'active')}
                      onClick={() => chooseModel(AUTO_FREE_MODEL_ID)}
                      onFocus={() => setPreviewModelId(AUTO_FREE_MODEL_ID)}
                      onMouseEnter={() => setPreviewModelId(AUTO_FREE_MODEL_ID)}
                      type="button"
                    >
                      <span className="model-picker-icon"><Bot size={17} /></span>
                      <span>
                        <strong>{autoFreeModel?.name ?? AUTO_FREE_MODEL_LABEL}</strong>
                        <small>Best free available model for each request</small>
                      </span>
                      {isAutoFreeModelId(model) && <Check size={16} />}
                    </button>
                  )}

                  {filteredModels.map(item => {
                    const locked = item.locked === true;
                    const active = chatModelMatchesId(item, model);

                    return (
                      <button
                        className={clsx('model-picker-row', active && 'active', locked && 'locked')}
                        disabled={locked}
                        key={item.id}
                        onClick={() => chooseModel(item.id)}
                        onFocus={() => setPreviewModelId(item.id)}
                        onMouseEnter={() => setPreviewModelId(item.id)}
                        title={locked ? item.lockReason ?? 'Model locked' : undefined}
                        type="button"
                      >
                        <ProviderMark provider={item.provider} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {locked
                              ? item.lockReason ?? 'Model locked'
                              : `${providerName(item.provider)} · ${compactNumber(item.maxInputTokens)} context${modelSupportsImageInput(item) ? ' · Image' : ''} · ${modelStatusLabel(item)}`}
                          </small>
                        </span>
                        {locked ? <LockKeyhole size={16} /> : active && <Check size={16} />}
                      </button>
                    );
                  })}

                  {modelPickerCount === 0 && (
                    <div className="model-picker-empty">
                      {modelSearchLoading ? 'Searching models...' : 'No free chat models match this search.'}
                    </div>
                  )}
                </div>
              </div>

              <aside className="model-picker-detail">
                {previewModel ? (
                  <>
                    <div className="model-picker-detail-head">
                      <ProviderMark provider={previewModel.provider} />
                      <h2>{previewModel.name}</h2>
                    </div>
                    <p>{modelSummary(previewModel)}</p>
                    <dl>
                      <div><dt>Provider</dt><dd>{providerName(previewModel.provider)}</dd></div>
                      <div><dt>Context</dt><dd>{compactNumber(previewModel.maxInputTokens)} tokens</dd></div>
                      {previewModel.maxOutputTokens > 0 && (
                        <div><dt>Output</dt><dd>{compactNumber(previewModel.maxOutputTokens)} tokens</dd></div>
                      )}
                      <div><dt>Tools</dt><dd>{previewModel.supportsTools ? 'Supported' : 'Not listed'}</dd></div>
                      <div><dt>Thinking</dt><dd>{previewModel.supportsReasoning ? 'Supported' : 'Not listed'}</dd></div>
                      <div><dt>Image Input</dt><dd>{modelSupportsImageInput(previewModel) ? 'Supported' : 'Not listed'}</dd></div>
                      <div><dt>Status</dt><dd>{modelStatusLabel(previewModel)}</dd></div>
                      {previewModel.locked && (
                        <div><dt>Locked</dt><dd>{previewModel.lockReason ?? 'Model locked'}</dd></div>
                      )}
                      <div><dt>Availability</dt><dd>{previewModel.freeReason}</dd></div>
                    </dl>
                  </>
                ) : !isAutoFreeModelId(previewModelId) ? (
                  <>
                    <div className="model-picker-detail-head">
                      <ProviderMark provider={providerFromModelId(previewModelId)} />
                      <h2>{displayModelName(previewModelId)}</h2>
                    </div>
                    <p>This selected model is being resolved outside the cached chat model list.</p>
                    <dl>
                      <div><dt>Provider</dt><dd>{providerName(providerFromModelId(previewModelId))}</dd></div>
                      <div><dt>Status</dt><dd>{modelLookupState[normalizeChatModelId(previewModelId)] === 'pending' ? 'Checking' : 'Selected'}</dd></div>
                      <div><dt>Route</dt><dd>Direct model request</dd></div>
                    </dl>
                  </>
                ) : (
                  <>
                    <div className="model-picker-detail-head">
                      <span className="model-picker-icon"><Bot size={17} /></span>
                      <h2>{AUTO_FREE_MODEL_LABEL}</h2>
                    </div>
                    <p>OpenProvider will pick the best available free chat model from your configured providers.</p>
                    <dl>
                      <div><dt>Mode</dt><dd>Automatic</dd></div>
                      <div><dt>Models</dt><dd>{models.length || '...'} free chat models</dd></div>
                      <div><dt>Fallback</dt><dd>Provider retry routing</dd></div>
                    </dl>
                  </>
                )}
              </aside>
            </section>
          </div>
        )}

        <div className="message-list" onScroll={handleMessageListScroll} ref={messageListRef}>
          {messages.length === 0 && (
            <div className="empty-chat">
              <div className="empty-chat-hero">
                <span className="empty-chat-kicker">
                  {selectedModel ? <ProviderMark provider={selectedModel.provider} /> : <Bot size={18} />}
                  {routeLabel}
                </span>
                <h1>{emptyStateTitle}</h1>
                <div className="empty-chat-badges" aria-label="Current chat route">
                  {emptyStateBadges.map(item => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="prompt-tiles">
                {promptStarters.map(item => {
                  const PromptIcon = item.icon;

                  return (
                    <button
                      key={item.title}
                      onClick={() => {
                        setInput(item.prompt);
                        window.requestAnimationFrame(() => composerInputRef.current?.focus());
                      }}
                      type="button"
                    >
                      <span className="prompt-tile-icon" aria-hidden="true">
                        <PromptIcon size={17} />
                      </span>
                      <span className="prompt-tile-copy">
                        <strong>{item.title}</strong>
                        <span>{item.prompt}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const isStreamingAssistant = loading && index === messages.length - 1 && message.role === 'assistant';
            const split = message.role === 'assistant'
              ? splitThinkingMarkup(message.content, {
                allowLeadingReasoning: Boolean(message.reasoningRequested),
              })
              : { content: message.content, reasoning: '' };
            const reasoning = mergeReasoningSegments(message.reasoning, split.reasoning);
            const content = split.content || (isStreamingAssistant ? 'Streaming response...' : '');
            const hasReasoning = Boolean(reasoning.trim() || message.reasoningComplete);
            const isThinkingStream = isStreamingAssistant && (Boolean(message.reasoningRequested) || hasReasoning);
            const isStreamingPlaceholder = isStreamingAssistant && content === 'Streaming response...';
            const showTextContent = Boolean(content.trim())
              && !isStreamingPlaceholder;
            const assistantProvider = message.provider ?? selectedModel?.provider ?? 'openprovider';
            const assistantLabel = message.modelLabel ?? (selectedModel ? selectedModel.name : AUTO_FREE_MODEL_LABEL);
            const showReasoningPanel = message.role === 'assistant'
              && (hasReasoning || (isStreamingAssistant && Boolean(message.reasoningRequested)));
            const showAssistantOutput = message.role === 'assistant' && !(isThinkingStream && !showTextContent);
            const messageActionKey = `${message.role}-${index}`;
            const copied = copiedMessageKey === messageActionKey;
            const tokenText = message.role === 'assistant' ? tokenLabel(message, content) : undefined;
            const responseTimeText = message.role === 'assistant'
              ? (isStreamingAssistant ? 'Responding...' : latencyLabel(message.latencyMs))
              : undefined;
            const assistantMeta = [responseTimeText, tokenText].filter(Boolean).join(' · ');
            const canRegenerate = message.role === 'assistant'
              && !isStreamingAssistant
              && previousUserIndexBefore(index) >= 0;

            return (
              <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="message-content">
                  {showReasoningPanel && (
                    <details
                      className={clsx('reasoning-panel', isStreamingAssistant && 'streaming')}
                      open={isStreamingAssistant}
                    >
                      <summary className={clsx('reasoning-pill', isStreamingAssistant ? 'thinking' : 'complete')}>
                        <span className="reasoning-pill-main">
                          <span className="reasoning-pill-icon" aria-hidden="true">
                            {isStreamingAssistant ? (
                              <Loader2 className="spin" size={13} />
                            ) : (
                              <Check size={14} strokeWidth={2.6} />
                            )}
                          </span>
                          <span className="reasoning-pill-copy">
                            <strong>{isStreamingAssistant ? 'Thinking' : 'Reasoning'}</strong>
                            <small>{isStreamingAssistant ? 'Live model trace' : 'Model trace available'}</small>
                          </span>
                        </span>
                        <span className="reasoning-pill-end">
                          {isStreamingAssistant && <span className="reasoning-pill-badge">Live</span>}
                          <ChevronRight size={14} />
                        </span>
                      </summary>
                      <div className="reasoning-panel-content">
                        {reasoning.trim() ? (
                          <pre>{reasoning}</pre>
                        ) : (
                          <>
                            <span className="reasoning-muted">
                              {isStreamingAssistant
                                ? 'Waiting for model trace.'
                                : 'This model finished without a separate trace.'}
                            </span>
                            {isStreamingAssistant && (
                              <div className="reasoning-skeleton" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </details>
                  )}
                  {showAssistantOutput ? (
                    <div className={clsx('assistant-output', !showTextContent && 'meta-only')}>
                      <div className="message-model-meta">
                        <span>{assistantProvider === 'openprovider' ? assistantLabel : `${providerName(assistantProvider)}: ${assistantLabel}`}</span>
                      </div>
                      {showTextContent && <AssistantMarkdown content={content} streaming={isStreamingAssistant} />}
                      {isStreamingAssistant && !showTextContent && <AssistantResponseSkeleton />}
                    </div>
                  ) : (
                    message.role !== 'assistant' && showTextContent && (
                      <>
                        <p>{content}</p>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="message-attachments" aria-label={attachmentSummary(message.attachments)}>
                            {message.attachments.map(attachment => (
                              <span key={`${attachment.name}-${attachment.size}`}>
                                <Paperclip size={12} />
                                {attachment.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )
                  )}
                  {message.role === 'user' && showTextContent && (
                    <div className="message-actions" aria-label="Prompt actions">
                      <button onClick={() => void copyMessageContent(content, messageActionKey)} type="button" title="Copy prompt">
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button onClick={() => reusePrompt(content)} type="button" title="Reuse prompt">
                        <RotateCcw size={14} />
                        <span>Reuse</span>
                      </button>
                    </div>
                  )}
                  {message.role === 'assistant' && showTextContent && (
                    <div className="message-actions" aria-label="Message actions">
                      {assistantMeta && <span className="message-action-meta">{assistantMeta}</span>}
                      {!isStreamingAssistant && (
                        <button onClick={() => void copyMessageContent(content, messageActionKey)} type="button" title="Copy response">
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                      {canRegenerate && (
                        <button onClick={() => void regenerateAssistantMessage(index)} type="button" title="Regenerate response">
                          <RefreshCw size={14} />
                          <span>Retry</span>
                        </button>
                      )}
                      {!isStreamingAssistant && (
                        <button className="danger" onClick={() => void deleteMessage(index)} type="button" title="Delete response">
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && messages.at(-1)?.role !== 'assistant' && (
            <div className="message assistant">
              <div className="message-content">
                <div className="assistant-output">
                  <div className="message-model-meta">
                    <span>Routing across the free registry</span>
                  </div>
                  <AssistantResponseSkeleton />
                </div>
              </div>
            </div>
          )}
          <div aria-hidden="true" className="message-scroll-anchor" ref={messageEndRef} />
        </div>

        <div className="composer">
          <div className="composer-label">
            <span className="composer-context">{selectedLabel}</span>
            <small className="composer-shortcut">Cmd/Ctrl + Enter</small>
          </div>
          <input
            accept="image/*,.txt,.md,.markdown,.json,.csv,.tsv,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.html,.css,.sql,.log"
            className="composer-file-input"
            multiple
            onChange={event => {
              void addAttachments(event.target.files);
              event.target.value = '';
            }}
            ref={composerFileInputRef}
            type="file"
          />
          {attachments.length > 0 && (
            <div className="composer-attachments" aria-label={attachmentSummary(attachments)}>
              {attachments.map(attachment => (
                <span className="composer-attachment" key={attachment.id}>
                  <Paperclip size={13} />
                  <strong>{attachment.name}</strong>
                  <small>{formatFileSize(attachment.size)}</small>
                  <button onClick={() => removeAttachment(attachment.id)} title="Remove attachment" type="button">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {attachmentError && (
            <div className="composer-attachment-error">{attachmentError}</div>
          )}
          {selectedLocked && (
            <div className="composer-attachment-error">{selectedLockReason}</div>
          )}
          <textarea
            ref={composerInputRef}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Start a new message..."
            value={input}
          />
          <div className="composer-toolbar">
            <div className="composer-toolbar-left">
              <button
                className="composer-icon-button"
                onClick={() => setSettingsOpen(true)}
                title="Chat settings"
                type="button"
              >
                <SlidersHorizontal size={18} />
              </button>
              <button
                aria-pressed={thinkingEnabled && selectedSupportsReasoning}
                className={clsx('composer-icon-button', thinkingEnabled && selectedSupportsReasoning && 'active')}
                disabled={!selectedSupportsReasoning || loading}
                onClick={() => setThinkingEnabled(current => !current)}
                title={selectedSupportsReasoning ? 'Toggle thinking' : 'Thinking is not listed for this model'}
                type="button"
              >
                <BrainCircuit size={19} />
              </button>
              {selectedSupportsImageUpload && (
                <button
                  className="composer-icon-button attach-button"
                  disabled={loading}
                  onClick={() => composerFileInputRef.current?.click()}
                  title="Attach image or text file"
                  type="button"
                >
                  <Paperclip size={19} />
                </button>
              )}
            </div>
            <div className="composer-toolbar-right">
              <button
                aria-label={isListening ? 'Stop recording' : 'Microphone'}
                className={clsx('composer-icon-button mic-button', isListening && 'is-listening')}
                onClick={toggleMic}
                title={isListening ? 'Stop recording' : 'Tap to speak'}
                type="button"
              >
                {isListening ? (
                  <span className="mic-listening-icon">
                    <span /><span /><span />
                  </span>
                ) : (
                  <Mic size={20} />
                )}
              </button>
              <button className="send-button" disabled={!canSendMessage} onClick={sendMessage} type="button">
                {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
