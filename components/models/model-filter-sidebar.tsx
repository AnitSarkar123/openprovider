'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  AlignLeft,
  ChevronDown,
  ChevronRight,
  CircleDot,
  MessageSquare,
  Server,
  Sparkles,
  X,
} from 'lucide-react';
import { providerName } from '@/lib/provider-meta';

export type ModelStatusFilter = 'all' | 'working' | 'failing' | 'unknown';
export type ModelContextFilter = 'all' | '8k' | '32k' | '128k' | '256k';
export type ModelOutputFilter = 'all' | '2k' | '4k' | '8k' | '32k';
export type ModelModalityFilter = 'all' | 'text' | 'image' | 'audio';

type CapabilityFilters = {
  reasoning: boolean;
  tools: boolean;
};

type ModelFilterSidebarProps = {
  allProviderCount: number;
  capabilityCounts: Record<keyof CapabilityFilters, number>;
  capabilityFilters: CapabilityFilters;
  contextCounts: Record<ModelContextFilter, number>;
  contextFilter: ModelContextFilter;
  inputModalityCounts: Record<ModelModalityFilter, number>;
  inputModalityFilter: ModelModalityFilter;
  outputModalityCounts: Record<ModelModalityFilter, number>;
  outputModalityFilter: ModelModalityFilter;
  outputCounts: Record<ModelOutputFilter, number>;
  outputFilter: ModelOutputFilter;
  provider: string;
  providerCounts: Record<string, number>;
  providers: string[];
  statusCounts: Record<ModelStatusFilter, number>;
  statusFilter: ModelStatusFilter;
  onCapabilityToggle: (capability: keyof CapabilityFilters) => void;
  onContextFilterChange: (filter: ModelContextFilter) => void;
  onInputModalityFilterChange: (filter: ModelModalityFilter) => void;
  onOutputModalityFilterChange: (filter: ModelModalityFilter) => void;
  onOutputFilterChange: (filter: ModelOutputFilter) => void;
  onProviderChange: (provider: string) => void;
  onStatusFilterChange: (filter: ModelStatusFilter) => void;
  onReset: () => void;
};

type FilterOption = {
  id: string;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
};

type FilterGroup = {
  key: string;
  icon: React.ReactNode;
  title: string;
  defaultExpanded?: boolean;
  activeCount: number;
  options: FilterOption[];
};

const contextOptions: Array<{ id: ModelContextFilter; label: string }> = [
  { id: 'all', label: 'Any context' },
  { id: '8k', label: '8K+' },
  { id: '32k', label: '32K+' },
  { id: '128k', label: '128K+' },
  { id: '256k', label: '256K+' },
];

const outputOptions: Array<{ id: ModelOutputFilter; label: string }> = [
  { id: 'all', label: 'Any length' },
  { id: '2k', label: '2K+' },
  { id: '4k', label: '4K+' },
  { id: '8k', label: '8K+' },
  { id: '32k', label: '32K+' },
];

const modalityOptions: Array<{ id: ModelModalityFilter; label: string }> = [
  { id: 'all', label: 'Any type' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Speech' },
];

const statusOptions: Array<{ id: ModelStatusFilter; label: string }> = [
  { id: 'all', label: 'All status' },
  { id: 'working', label: 'Working' },
  { id: 'failing', label: 'Failing' },
  { id: 'unknown', label: 'Untested' },
];

const ICON_PROPS = { size: 18, strokeWidth: 1.5 } as const;

function FilterSection({
  icon,
  title,
  defaultExpanded = false,
  activeCount = 0,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultExpanded?: boolean;
  activeCount?: number;
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  return (
    <div className={clsx('filter-section', isExpanded && 'filter-section--open')}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="filter-section-trigger"
        type="button"
        aria-expanded={isExpanded}
      >
        <span className="filter-section-icon">{icon}</span>
        <span className="filter-section-label">{title}</span>
        {activeCount > 0 && !isExpanded && (
          <span className="filter-section-badge">{activeCount}</span>
        )}
        {isExpanded ? (
          <ChevronDown size={16} className="filter-section-chevron" />
        ) : (
          <ChevronRight size={16} className="filter-section-chevron" />
        )}
      </button>
      {isExpanded && (
        <div className="filter-options-list">
          {children}
        </div>
      )}
    </div>
  );
}

function FilterOptionButton({ option }: { option: FilterOption }) {
  return (
    <button
      className={clsx('filter-option', option.active && 'active')}
      onClick={option.onSelect}
      type="button"
    >
      <span className="filter-option-label">
        <span className="filter-truncate">{option.label}</span>
      </span>
      <small>{option.count}</small>
    </button>
  );
}

export function ModelFilterSidebar({
  allProviderCount,
  capabilityCounts,
  capabilityFilters,
  contextCounts,
  contextFilter,
  inputModalityCounts,
  inputModalityFilter,
  outputModalityCounts,
  outputModalityFilter,
  outputCounts,
  outputFilter,
  provider,
  providerCounts,
  providers,
  statusCounts,
  statusFilter,
  onCapabilityToggle,
  onContextFilterChange,
  onInputModalityFilterChange,
  onOutputModalityFilterChange,
  onOutputFilterChange,
  onProviderChange,
  onStatusFilterChange,
  onReset,
}: ModelFilterSidebarProps) {
  const activeCapabilityCount = (capabilityFilters.reasoning ? 1 : 0) + (capabilityFilters.tools ? 1 : 0);
  const hasActiveFilters =
    provider !== 'all' ||
    statusFilter !== 'all' ||
    contextFilter !== 'all' ||
    inputModalityFilter !== 'all' ||
    outputModalityFilter !== 'all' ||
    outputFilter !== 'all' ||
    activeCapabilityCount > 0;

  const activeFilterCount =
    (provider !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (contextFilter !== 'all' ? 1 : 0) +
    (inputModalityFilter !== 'all' ? 1 : 0) +
    (outputModalityFilter !== 'all' ? 1 : 0) +
    (outputFilter !== 'all' ? 1 : 0) +
    activeCapabilityCount;

  const groups: FilterGroup[] = [
    {
      key: 'providers',
      icon: <Server {...ICON_PROPS} />,
      title: 'Providers',
      defaultExpanded: true,
      activeCount: provider !== 'all' ? 1 : 0,
      options: [
        {
          id: 'all',
          label: 'All providers',
          count: allProviderCount,
          active: provider === 'all',
          onSelect: () => onProviderChange('all'),
        },
        ...providers.map<FilterOption>(item => ({
          id: item,
          label: providerName(item),
          count: providerCounts[item] ?? 0,
          active: provider === item,
          onSelect: () => onProviderChange(item),
        })),
      ],
    },
    {
      key: 'status',
      icon: <CircleDot {...ICON_PROPS} />,
      title: 'Status',
      activeCount: statusFilter !== 'all' ? 1 : 0,
      options: statusOptions.map(item => ({
        id: item.id,
        label: item.label,
        count: statusCounts[item.id] ?? 0,
        active: statusFilter === item.id,
        onSelect: () => onStatusFilterChange(item.id),
      })),
    },
    {
      key: 'input-modality',
      icon: <AlignLeft {...ICON_PROPS} />,
      title: 'Input type',
      activeCount: inputModalityFilter !== 'all' ? 1 : 0,
      options: modalityOptions.map(item => ({
        id: item.id,
        label: item.label,
        count: inputModalityCounts[item.id] ?? 0,
        active: inputModalityFilter === item.id,
        onSelect: () => onInputModalityFilterChange(item.id),
      })),
    },
    {
      key: 'output-modality',
      icon: <MessageSquare {...ICON_PROPS} />,
      title: 'Output type',
      activeCount: outputModalityFilter !== 'all' ? 1 : 0,
      options: modalityOptions.map(item => ({
        id: item.id,
        label: item.label,
        count: outputModalityCounts[item.id] ?? 0,
        active: outputModalityFilter === item.id,
        onSelect: () => onOutputModalityFilterChange(item.id),
      })),
    },
    {
      key: 'context',
      icon: <AlignLeft {...ICON_PROPS} />,
      title: 'Context length',
      activeCount: contextFilter !== 'all' ? 1 : 0,
      options: contextOptions.map(item => ({
        id: item.id,
        label: item.label,
        count: contextCounts[item.id] ?? 0,
        active: contextFilter === item.id,
        onSelect: () => onContextFilterChange(item.id),
      })),
    },
    {
      key: 'output',
      icon: <MessageSquare {...ICON_PROPS} />,
      title: 'Response length',
      activeCount: outputFilter !== 'all' ? 1 : 0,
      options: outputOptions.map(item => ({
        id: item.id,
        label: item.label,
        count: outputCounts[item.id] ?? 0,
        active: outputFilter === item.id,
        onSelect: () => onOutputFilterChange(item.id),
      })),
    },
    {
      key: 'capabilities',
      icon: <Sparkles {...ICON_PROPS} />,
      title: 'Capabilities',
      activeCount: activeCapabilityCount,
      options: [
        {
          id: 'reasoning',
          label: 'Reasoning',
          count: capabilityCounts.reasoning ?? 0,
          active: capabilityFilters.reasoning,
          onSelect: () => onCapabilityToggle('reasoning'),
        },
        {
          id: 'tools',
          label: 'Tools',
          count: capabilityCounts.tools ?? 0,
          active: capabilityFilters.tools,
          onSelect: () => onCapabilityToggle('tools'),
        },
      ],
    },
  ];

  return (
    <aside className="models-filter">
      <div className="filter-sections-list">
        {groups.map(group => (
          <FilterSection
            key={group.key}
            icon={group.icon}
            title={group.title}
            defaultExpanded={group.defaultExpanded}
            activeCount={group.activeCount}
          >
            {group.options.map(option => (
              <FilterOptionButton key={option.id} option={option} />
            ))}
          </FilterSection>
        ))}
      </div>

      <div className={clsx('filter-active-footer', hasActiveFilters && 'filter-active-footer--visible')}>
        <div className="filter-active-footer-inner">
          <span className="filter-active-count">
            <span className="filter-active-pip">{activeFilterCount}</span>
            {activeFilterCount === 1 ? 'filter active' : 'filters active'}
          </span>
          <button className="filter-reset-btn" onClick={onReset} type="button">
            <X size={12} />
            Clear all
          </button>
        </div>
      </div>
    </aside>
  );
}
