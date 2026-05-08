import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

export const statements = sqliteTable(
  'statements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    scopeType: text('scope_type').notNull(),
    scopeKey: text('scope_key'),
    kind: text('kind').notNull(),
    authorType: text('author_type').notNull(),
    authorId: text('author_id').notNull(),
    icOoc: text('ic_ooc'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    supersedes: text('supersedes'),
    sources: text('sources', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    content: text('content').notNull(),
    fields: text('fields', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
  },
  (t) => ({
    scopeIdx: index('statements_scope_idx').on(t.scopeType, t.scopeKey, t.createdAt),
    kindIdx: index('statements_kind_idx').on(t.kind),
    supersedesIdx: index('statements_supersedes_idx').on(t.supersedes),
  }),
);

export const entities = sqliteTable('entities', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  scopeType: text('scope_type').notNull(),
  scopeKey: text('scope_key'),
  fields: text('fields', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull()
    .$defaultFn(() => ({})),
  primaryStatementId: text('primary_statement_id').references(() => statements.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const rooms = sqliteTable('rooms', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  binding: text('binding', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  oversightOf: text('oversight_of', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
});

export const roles = sqliteTable('roles', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  definition: text('definition', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
});

export const roleGrants = sqliteTable(
  'role_grants',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    grantedAt: integer('granted_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    grantedBy: text('granted_by').notNull(),
    precedence: integer('precedence').notNull().default(0),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    byUserRoom: index('role_grants_user_room_idx').on(t.userId, t.roomId),
  }),
);

export const mappings = sqliteTable(
  'mappings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    kind: text('kind').notNull(),
    sourceId: text('source_id').notNull(),
    platform: text('platform').notNull(),
    platformId: text('platform_id').notNull(),
    fields: text('fields', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    supersedes: text('supersedes'),
  },
  (t) => ({
    byKindSource: index('mappings_kind_source_idx').on(t.kind, t.sourceId),
    byPlatform: index('mappings_platform_idx').on(t.platform, t.platformId),
  }),
);

export const schedules = sqliteTable('schedules', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workerName: text('worker_name').notNull(),
  trigger: text('trigger', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const webhooks = sqliteTable('webhooks', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  platform: text('platform').notNull(),
  channelId: text('channel_id').notNull(),
  webhookId: text('webhook_id').notNull(),
  webhookToken: text('webhook_token').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
