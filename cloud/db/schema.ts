import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
export const snapshots = sqliteTable('cp_snapshots', { source_key: text('source_key').primaryKey(), captured_at: text('captured_at').notNull(), received_at: text('received_at').notNull(), payload: text('payload').notNull() })
export const projects = sqliteTable('cp_projects', { id: text('id').primaryKey(), name: text('name').notNull().unique(), owner: text('owner').notNull(), goal: text('goal').notNull(), archived: integer('archived').notNull().default(0) })
export const nodes = sqliteTable('cp_nodes', { id: text('id').primaryKey(), payload: text('payload').notNull() })
export const events = sqliteTable('cp_events', { id: text('id').primaryKey(), kind: text('kind').notNull(), node_id: text('node_id'), summary: text('summary').notNull(), created_at: text('created_at').notNull() })
export const control = sqliteTable('cp_control', { id: integer('id').primaryKey(), revision: integer('revision').notNull().default(0) })
