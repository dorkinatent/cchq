import { pgTable, uuid, text, timestamp, jsonb, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "paused",
  "completed",
  "errored",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
  "tool",
]);

export const knowledgeTypeEnum = pgEnum("knowledge_type", [
  "decision",
  "fact",
  "context",
  "summary",
]);

export const trustLevelEnum = pgEnum("trust_level", [
  "full_auto",
  "auto_log",
  "ask_me",
]);

export const permissionDecisionEnum = pgEnum("permission_decision", [
  "allow",
  "deny",
  "ask",
]);

export const engineEnum = pgEnum("engine", ["sdk", "gastown"]);

export const knowledgeOriginEnum = pgEnum("knowledge_origin", [
  "session_extract",
  "manual",
  "doc_seed",
]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  engine: engineEnum("engine").notNull().default("sdk"),
  docGlobs: jsonb("doc_globs").$type<string[]>().notNull().default(sql`
  '["README.md", "CHANGELOG.md", "AGENTS.md", "CLAUDE.md", "docs/**/*.md", ".github/**/*.md", "doc/**/*.md"]'::jsonb
`),
  autoInjectDocs: boolean("auto_inject_docs").notNull().default(true),
  hasBeenIngestionPrompted: boolean("has_been_ingestion_prompted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  status: sessionStatusEnum("status").notNull().default("active"),
  model: text("model").notNull().default("claude-sonnet-4-6"),
  name: text("name").notNull(),
  sdkSessionId: text("sdk_session_id"),
  trustLevel: trustLevelEnum("trust_level").notNull().default("auto_log"),
  effort: text("effort").notNull().default("high"),
  usage: jsonb("usage").$type<{ totalTokens: number; totalCostUsd: number; numTurns: number }>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  toolUse: jsonb("tool_use"),
  thinking: text("thinking"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const knowledge = pgTable("knowledge", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  sessionId: uuid("session_id").references(() => sessions.id),
  type: knowledgeTypeEnum("type").notNull(),
  content: text("content").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  origin: knowledgeOriginEnum("origin").notNull().default("session_extract"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const permissionRules = pgTable("permission_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  toolPattern: text("tool_pattern").notNull(), // "Read", "Edit", "Bash", "Write", "*"
  actionPattern: text("action_pattern"), // regex on action content, or null for any
  decision: permissionDecisionEnum("decision").notNull(),
  priority: integer("priority").notNull().default(0), // higher = evaluated first
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const rigs = pgTable("rigs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  townPath: text("town_path"),
  rigName: text("rig_name"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const rigEvents = pgTable("rig_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  rigId: uuid("rig_id")
    .notNull()
    .references(() => rigs.id, { onDelete: "cascade" }),
  eventType: text("event_type"),
  actor: text("actor"),
  payload: jsonb("payload"),
  timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const projectNotes = pgTable("project_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});
