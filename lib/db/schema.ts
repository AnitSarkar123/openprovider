import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  account => ({
    compositePk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  token => ({
    compositePk: primaryKey({ columns: [token.identifier, token.token] }),
  })
);

export const authenticators = pgTable(
  'authenticator',
  {
    credentialID: text('credentialID').notNull().unique(),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerAccountId: text('providerAccountId').notNull(),
    credentialPublicKey: text('credentialPublicKey').notNull(),
    counter: integer('counter').notNull(),
    credentialDeviceType: text('credentialDeviceType').notNull(),
    credentialBackedUp: boolean('credentialBackedUp').notNull(),
    transports: text('transports'),
  },
  authenticator => ({
    compositePk: primaryKey({ columns: [authenticator.userId, authenticator.credentialID] }),
  })
);

export const savedModels = pgTable(
  'saved_model',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    provider: text('provider').notNull(),
    category: text('category').notNull(),
    modelName: text('model_name').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  model => ({
    userModelIdx: uniqueIndex('saved_model_user_model_idx').on(model.userId, model.modelId),
    userIdx: index('saved_model_user_idx').on(model.userId),
  })
);

export const providerKeys = pgTable(
  'provider_key',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    encryptedValues: text('encrypted_values').notNull(),
    keyNames: jsonb('key_names').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  key => ({
    userProviderIdx: uniqueIndex('provider_key_user_provider_idx').on(key.userId, key.provider),
    userIdx: index('provider_key_user_idx').on(key.userId),
  })
);

export const openProviderApiKeys = pgTable(
  'openprovider_api_key',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
    expiresAt: timestamp('expires_at', { mode: 'date' }),
    revokedAt: timestamp('revoked_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  key => ({
    keyHashIdx: uniqueIndex('openprovider_api_key_hash_idx').on(key.keyHash),
    userIdx: index('openprovider_api_key_user_idx').on(key.userId),
    userActiveIdx: index('openprovider_api_key_user_active_idx').on(key.userId, key.revokedAt),
    userCreatedIdx: index('openprovider_api_key_user_created_idx').on(key.userId, key.createdAt),
  })
);

export const apiUsageEvents = pgTable(
  'api_usage_event',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: text('api_key_id').references(() => openProviderApiKeys.id, { onDelete: 'set null' }),
    keyPrefix: text('key_prefix').notNull(),
    endpoint: text('endpoint').notNull(),
    method: text('method').notNull(),
    workflow: text('workflow').notNull(),
    requestedModel: text('requested_model'),
    routedModel: text('routed_model'),
    provider: text('provider'),
    statusCode: integer('status_code').notNull(),
    ok: boolean('ok').notNull().default(false),
    latencyMs: integer('latency_ms'),
    errorType: text('error_type'),
    tokenUsage: jsonb('token_usage'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  event => ({
    userCreatedIdx: index('api_usage_event_user_created_idx').on(event.userId, event.createdAt),
    apiKeyCreatedIdx: index('api_usage_event_key_created_idx').on(event.apiKeyId, event.createdAt),
    modelIdx: index('api_usage_event_model_idx').on(event.userId, event.routedModel),
    providerIdx: index('api_usage_event_provider_idx').on(event.userId, event.provider),
    workflowIdx: index('api_usage_event_workflow_idx').on(event.userId, event.workflow),
  })
);

export const modelStatuses = pgTable(
  'model_status',
  {
    modelId: text('model_id').primaryKey(),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('unknown'),
    checkedAt: timestamp('checked_at', { mode: 'date' }),
    latencyMs: integer('latency_ms'),
    httpStatus: integer('http_status'),
    errorMessage: text('error_message'),
    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    cooldownUntil: timestamp('cooldown_until', { mode: 'date' }),
    lastSuccessAt: timestamp('last_success_at', { mode: 'date' }),
    lastFailureAt: timestamp('last_failure_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  status => ({
    providerIdx: index('model_status_provider_idx').on(status.provider),
    statusIdx: index('model_status_status_idx').on(status.status),
    checkedAtIdx: index('model_status_checked_at_idx').on(status.checkedAt),
    providerStatusCheckedIdx: index('model_status_provider_status_checked_idx').on(status.provider, status.status, status.checkedAt),
  })
);

export const modelStatusRuns = pgTable(
  'model_status_run',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    trigger: text('trigger').notNull(),
    provider: text('provider'),
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { mode: 'date' }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { mode: 'date' }),
    checkedCount: integer('checked_count').notNull().default(0),
    workingCount: integer('working_count').notNull().default(0),
    failingCount: integer('failing_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    errorMessage: text('error_message'),
  },
  run => ({
    startedAtIdx: index('model_status_run_started_at_idx').on(run.startedAt),
    providerIdx: index('model_status_run_provider_idx').on(run.provider),
  })
);

export const conversations = pgTable(
  'conversation',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    modelId: text('model_id').notNull(),
    provider: text('provider').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  conversation => ({
    userIdx: index('conversation_user_idx').on(conversation.userId),
    userUpdatedAtIdx: index('conversation_user_updated_at_idx').on(conversation.userId, conversation.updatedAt),
  })
);

export const chatMessages = pgTable(
  'chat_message',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    tokenUsage: jsonb('token_usage'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  message => ({
    conversationIdx: index('chat_message_conversation_idx').on(message.conversationId),
    conversationCreatedIdx: index('chat_message_conversation_created_idx').on(message.conversationId, message.createdAt, message.id),
  })
);

export const userRelations = relations(users, ({ many }) => ({
  savedModels: many(savedModels),
  providerKeys: many(providerKeys),
  openProviderApiKeys: many(openProviderApiKeys),
  apiUsageEvents: many(apiUsageEvents),
  conversations: many(conversations),
}));

export const conversationRelations = relations(conversations, ({ many, one }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessageRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
}));
