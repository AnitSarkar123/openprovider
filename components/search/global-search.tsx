'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'nextjs-toploader/app';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ProviderMark } from '../providers/provider-mark';
import { useAuthGate } from '../auth/auth-gate';
import { withModelApiCacheVersion } from '@/lib/model-api-cache';
import { providerName } from '@/lib/provider-meta';

type SuggestionModel = {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  category: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const { requireAuth } = useAuthGate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionModel[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      const target = event.target;
      const tag = target instanceof HTMLElement ? target.tagName : '';
      const editable = target instanceof HTMLElement && target.isContentEditable;

      if (event.key === '/' && !editable && tag !== 'INPUT' && tag !== 'TEXTAREA' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current !== event.target
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const groupedSuggestions = useMemo(
    () => {
      const groups: Record<string, SuggestionModel[]> = {};

      for (const model of suggestions) {
        const key = providerName(model.provider);
        groups[key] ??= [];
        groups[key].push(model);
      }

      return groups;
    },
    [suggestions]
  );

  const fetchSuggestions = useCallback(async (value: string) => {
    const search = value.trim();

    if (!search) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const params = withModelApiCacheVersion(new URLSearchParams({
        q: search,
        limit: '8',
        facets: 'false',
        public: 'true',
        providerResults: 'false',
      }));

      const response = await fetch(
        `/api/models?${params.toString()}`,
        {
          cache: 'default',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error('Model search failed.');
      }

      const data = await response.json() as { data?: SuggestionModel[] };
      const models = (data.data ?? []).map(model => ({
        id: model.id,
        modelId: model.modelId,
        name: model.name,
        provider: model.provider,
        category: model.category,
      }));

      setSuggestions(models);
      setOpen(models.length > 0);
      setActiveIndex(-1);
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        setSuggestions([]);
        setOpen(false);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(value);
    }, 180);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setOpen(false);
    const search = query.trim();
    const href = search ? `/models?q=${encodeURIComponent(search)}` : '/models';
    if (requireAuth(href)) {
      router.push(href);
    }
  }

  function openModel(model: SuggestionModel) {
    setOpen(false);
    const href = `/models/${model.provider}/${encodeURIComponent(model.modelId)}`;
    if (requireAuth(href)) {
      router.push(href);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, -1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      openModel(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="global-search-wrap">
      <form className="global-search" onSubmit={handleSubmit} role="search">
        <Search aria-hidden="true" size={17} />
        <input
          aria-autocomplete="list"
          aria-expanded={open}
          aria-label="Search models"
          autoComplete="off"
          name="q"
          onChange={handleChange}
          onFocus={() => {
            if (suggestions.length > 0) {
              setOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search models"
          ref={inputRef}
          type="search"
          value={query}
        />
        {!loading && <kbd>/</kbd>}
        {loading && <span aria-hidden="true" className="gs-spinner" />}
      </form>

      {open && (
        <div className="gs-dropdown" ref={dropdownRef} role="listbox">
          {Object.entries(groupedSuggestions).map(([group, models]) => (
            <div className="gs-group" key={group}>
              <div className="gs-group-label">{group}</div>
              {models.map(model => {
                const flatIndex = suggestions.indexOf(model);
                return (
                  <button
                    aria-selected={flatIndex === activeIndex}
                    className={`gs-item${flatIndex === activeIndex ? ' active' : ''}`}
                    key={model.id}
                    onMouseDown={event => {
                      event.preventDefault();
                      openModel(model);
                    }}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    role="option"
                    type="button"
                  >
                    <ProviderMark provider={model.provider} />
                    <span className="gs-item-name">
                      <span className="gs-item-provider">{providerName(model.provider)}:</span>
                      {' '}
                      {model.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
