'use client';

import { Check, Loader2, MessageSquarePlus, MoreVertical, PanelLeft, Pencil, Search, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { type FormEvent, useEffect, useRef, useState } from 'react';

function DeleteConfirmModal({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return createPortal(
    <div className="delete-modal-backdrop" onClick={onCancel}>
      <div className="delete-modal" onClick={e => e.stopPropagation()}>
        <button className="delete-modal-close" onClick={onCancel} type="button" aria-label="Close">
          <X size={16} />
        </button>
        <h3 className="delete-modal-title">Delete chat</h3>
        <p className="delete-modal-body">
          Deleted conversations cannot be restored.<br />Please proceed with caution.
        </p>
        <div className="delete-modal-actions">
          <button className="delete-modal-cancel" onClick={onCancel} type="button" disabled={busy}>
            Cancel
          </button>
          <button className="delete-modal-confirm" onClick={onConfirm} type="button" disabled={busy}>
            {busy ? <Loader2 size={14} /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ConversationLimitModal({
  limit,
  total,
  onClose,
  onReviewConversations,
}: {
  limit: number;
  total: number;
  onClose: () => void;
  onReviewConversations: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="delete-modal-backdrop" onClick={onClose}>
      <div className="delete-modal conversation-limit-modal" onClick={e => e.stopPropagation()}>
        <button className="delete-modal-close" onClick={onClose} type="button" aria-label="Close">
          <X size={16} />
        </button>
        <div className="conversation-limit-icon" aria-hidden="true">
          <MessageSquarePlus size={18} />
        </div>
        <h3 className="delete-modal-title">Conversation limit reached</h3>
        <p className="delete-modal-body">
          You have {total} saved conversations. OpenProvider keeps up to {limit} per workspace to keep free chat fast and sustainable.
        </p>
        <p className="conversation-limit-hint">
          Delete an older conversation from the sidebar, then start a new chat.
        </p>
        <div className="delete-modal-actions">
          <button className="delete-modal-cancel" onClick={onClose} type="button">
            Close
          </button>
          <button className="delete-modal-confirm conversation-limit-primary" onClick={onReviewConversations} type="button">
            Review conversations
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export const CONVERSATION_GROUPS = ['Today', 'Previous 7 Days', 'Previous 30 Days'] as const;

export type ConversationGroup = typeof CONVERSATION_GROUPS[number];

export type ConversationRow = {
  id: string;
  title: string;
  subtitle: string;
  modelId: string;
  provider: string;
  group: ConversationGroup;
};

type ChatSidebarProps = {
  activeConversationId: string | null;
  collapsed: boolean;
  conversationError: string;
  conversationActionId: string | null;
  conversationLoadingId: string | null;
  conversationListLoading: boolean;
  conversationLimit: number;
  conversationLimitOpen: boolean;
  conversationQuery: string;
  conversationRows: ConversationRow[];
  conversationTotal: number;
  groupedConversations: Record<ConversationGroup, ConversationRow[]>;
  loading: boolean;
  messageCount: number;
  modelCount: number;
  routeLabel: string;
  onCloseConversationLimit: () => void;
  onConversationQueryChange: (value: string) => void;
  onDeleteConversation: (row: ConversationRow) => Promise<boolean>;
  onRenameConversation: (row: ConversationRow, title: string) => Promise<boolean>;
  onReviewConversations: () => void;
  onResetChat: () => void;
  onSelectConversation: (row: ConversationRow) => void;
  onToggleCollapsed: () => void;
};

function ConversationMenu({
  row,
  busy,
  conversationActionId,
  onRename,
  onDelete,
}: {
  row: ConversationRow;
  busy: boolean;
  conversationActionId: string | null;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="conversation-menu" ref={menuRef}>
      <button
        aria-label="Conversation options"
        className="conversation-menu-trigger"
        disabled={busy}
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        type="button"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div className="conversation-menu-dropdown">
          <button
            className="conversation-menu-item"
            disabled={conversationActionId === row.id}
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            type="button"
          >
            <Pencil size={14} />
            Rename
          </button>
          <button
            className="conversation-menu-item danger"
            disabled={conversationActionId === row.id}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            type="button"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function ChatSidebar({
  activeConversationId,
  collapsed,
  conversationError,
  conversationActionId,
  conversationLoadingId,
  conversationListLoading,
  conversationLimit,
  conversationLimitOpen,
  conversationQuery,
  conversationRows,
  conversationTotal,
  groupedConversations,
  loading,
  messageCount,
  modelCount,
  routeLabel,
  onCloseConversationLimit,
  onConversationQueryChange,
  onDeleteConversation,
  onRenameConversation,
  onReviewConversations,
  onResetChat,
  onSelectConversation,
  onToggleCollapsed,
}: ChatSidebarProps) {
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<ConversationRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const busy = loading || Boolean(conversationActionId);

  function beginRename(row: ConversationRow) {
    setConfirmDeleteRow(null);
    setEditingId(row.id);
    setEditingTitle(row.title);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingTitle('');
  }

  async function submitRename(event: FormEvent<HTMLFormElement>, row: ConversationRow) {
    event.preventDefault();
    const renamed = await onRenameConversation(row, editingTitle);
    if (renamed) {
      cancelRename();
    }
  }

  async function confirmDelete(row: ConversationRow) {
    const deleted = await onDeleteConversation(row);
    if (deleted) {
      setConfirmDeleteRow(null);
      if (editingId === row.id) {
        cancelRename();
      }
    }
  }

  return (
    <>
    {confirmDeleteRow && (
      <DeleteConfirmModal
        busy={Boolean(conversationActionId)}
        onConfirm={() => void confirmDelete(confirmDeleteRow)}
        onCancel={() => setConfirmDeleteRow(null)}
      />
    )}
    {conversationLimitOpen && (
      <ConversationLimitModal
        limit={conversationLimit}
        total={conversationTotal}
        onClose={onCloseConversationLimit}
        onReviewConversations={onReviewConversations}
      />
    )}
    <aside className={clsx('chat-sidebar', collapsed && 'collapsed')}>
      <div className="chat-sidebar-head">
        {!collapsed && (
          <button className="new-chat-button" onClick={onResetChat} type="button">
            <MessageSquarePlus size={17} />
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
            <input
              aria-label="Search conversations"
              onChange={event => onConversationQueryChange(event.target.value)}
              placeholder="Search conversations..."
              value={conversationQuery}
            />
            {conversationQuery && (
              <button aria-label="Clear conversation search" onClick={() => onConversationQueryChange('')} type="button">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="thread-list conversation-list">
            {CONVERSATION_GROUPS.map(group => {
              const rows = groupedConversations[group];

              if (rows.length === 0) {
                return null;
              }

              return (
                <section className="conversation-section" key={group}>
                  <h2>
                    <span>{group}</span>
                    <small>{rows.length}</small>
                  </h2>
                  {rows.map(row => (
                    <div
                      className={clsx(
                      'conversation-row',
                      row.id === activeConversationId && 'active',
                      editingId === row.id && 'editing'
                      )}
                      key={row.id}
                    >
                      {editingId === row.id ? (
                        <form className="conversation-edit-form" onSubmit={event => void submitRename(event, row)}>
                          <input
                            aria-label="Conversation title"
                            autoFocus
                            disabled={conversationActionId === row.id}
                            maxLength={120}
                            onChange={event => setEditingTitle(event.target.value)}
                            onKeyDown={event => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            value={editingTitle}
                          />
                          <button
                            aria-label="Save title"
                            disabled={conversationActionId === row.id || !editingTitle.trim()}
                            type="submit"
                          >
                            {conversationActionId === row.id ? <Loader2 size={14} /> : <Check size={14} />}
                          </button>
                          <button
                            aria-label="Cancel rename"
                            disabled={conversationActionId === row.id}
                            onClick={cancelRename}
                            type="button"
                          >
                            <X size={14} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            className="conversation-select"
                            disabled={busy || conversationLoadingId === row.id}
                            onClick={() => onSelectConversation(row)}
                            type="button"
                          >
                            <span>{row.title}</span>
                            <small>{conversationLoadingId === row.id ? 'Loading messages...' : row.subtitle}</small>
                          </button>

                          <ConversationMenu
                              row={row}
                              busy={busy}
                              conversationActionId={conversationActionId}
                              onRename={() => beginRename(row)}
                              onDelete={() => {
                                setEditingId(null);
                                setConfirmDeleteRow(row);
                              }}
                            />
                        </>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}
            {conversationRows.length === 0 && (
              <p className="conversation-empty">
                {conversationListLoading ? 'Loading conversations...' : conversationQuery ? 'No conversations match this search.' : 'No conversations yet.'}
              </p>
            )}
            {conversationError && <p className="conversation-error">{conversationError}</p>}
          </div>

          <div className="chat-sidebar-stats">
            <div className="chat-stat">
              <span>Chat models</span>
              <strong>{modelCount || '...'}</strong>
            </div>
            <div className="chat-stat">
              <span>Last route</span>
              <strong title={routeLabel}>{routeLabel}</strong>
            </div>
            <div className="chat-stat">
              <span>Messages</span>
              <strong>{messageCount}</strong>
            </div>
          </div>
        </>
      )}
    </aside>
    </>
  );
}
