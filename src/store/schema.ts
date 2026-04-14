import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';

// pgvector column helper — raw SQL since drizzle doesn't ship a first-party vector type yet.
const vector = (name: string, dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(',')
        .map((s) => Number(s));
    },
  })(name);

const EMBED_DIM = Number(process.env.EMBED_DIM ?? 1536);

export const statements = pgTable(
  'statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scopeType: text('scope_type').notNull(),
    scopeKey: text('scope_key'),
    kind: text('kind').notNull(),
    authorType: text('author_type').notNull(),
    authorId: text('author_id').notNull(),
    icOoc: text('ic_ooc'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    supersedes: uuid('supersedes'),
    sources: uuid('sources')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    content: text('content').notNull(),
    fields: jsonb('fields')
      .notNull()
      .default(sql`'{}'::jsonb`),
    embedding: vector('embedding', EMBED_DIM),
  },
  (t) => ({
    scopeIdx: index('statements_scope_idx').on(t.scopeType, t.scopeKey, t.createdAt),
    kindIdx: index('statements_kind_idx').on(t.kind),
    supersedesIdx: index('statements_supersedes_idx').on(t.supersedes),
  }),
);

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(), // npc, location, faction, item, deity, ...
  name: text('name').notNull(),
  scopeType: text('scope_type').notNull(),
  scopeKey: text('scope_key'),
  fields: jsonb('fields')
    .notNull()
    .default(sql`'{}'::jsonb`),
  primaryStatementId: uuid('primary_statement_id').references(() => statements.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  binding: jsonb('binding').notNull(),
  oversightOf: uuid('oversight_of')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  definition: jsonb('definition').notNull(), // Role shape minus id
});

export const roleGrants = pgTable(
  'role_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: text('granted_by').notNull(),
    precedence: integer('precedence').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    byUserRoom: index('role_grants_user_room_idx').on(t.userId, t.roomId),
  }),
);

export const mappings = pgTable(
  'mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(), // room-channel, role-discord-role, user-discord-user
    sourceId: text('source_id').notNull(),
    platform: text('platform').notNull(),
    platformId: text('platform_id').notNull(),
    fields: jsonb('fields')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    supersedes: uuid('supersedes'),
  },
  (t) => ({
    byKindSource: index('mappings_kind_source_idx').on(t.kind, t.sourceId),
    byPlatform: index('mappings_platform_idx').on(t.platform, t.platformId),
  }),
);

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workerName: text('worker_name').notNull(),
  trigger: jsonb('trigger').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  active: boolean('active').notNull().default(true),
});

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull(),
  channelId: text('channel_id').notNull(),
  webhookId: text('webhook_id').notNull(),
  webhookToken: text('webhook_token').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
