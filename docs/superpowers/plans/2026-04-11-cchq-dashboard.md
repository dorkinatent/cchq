# CCHQ Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web dashboard to control multiple Claude Code instances with persistent knowledge base and unified session management.

**Architecture:** Next.js 15 App Router frontend with Supabase (local) for persistence and real-time streaming. Claude Code Agent SDK (`@anthropic-ai/claude-agent-sdk`) spawns and manages coding sessions. Drizzle ORM for type-safe database access. Three views: dashboard overview (session grid), session chat, knowledge base.

**Tech Stack:** Next.js 15, React, Tailwind CSS, impeccable.style, Supabase (local CLI), Drizzle ORM (postgres), @anthropic-ai/claude-agent-sdk, Vitest

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout with sidebar
│   ├── page.tsx                      # Dashboard overview (session grid)
│   ├── sessions/
│   │   └── [id]/
│   │       └── page.tsx              # Session chat view
│   ├── knowledge/
│   │   └── page.tsx                  # Knowledge base view
│   └── api/
│       ├── projects/
│       │   └── route.ts              # CRUD for projects
│       ├── sessions/
│       │   ├── route.ts              # List/create sessions
│       │   └── [id]/
│       │       ├── route.ts          # Get/update/delete session
│       │       ├── message/
│       │       │   └── route.ts      # Send message to session
│       │       └── complete/
│       │           └── route.ts      # Complete session + extract knowledge
│       └── knowledge/
│           └── route.ts              # CRUD for knowledge entries
├── lib/
│   ├── db/
│   │   ├── schema.ts                 # Drizzle schema (all tables)
│   │   ├── index.ts                  # Drizzle client + Supabase connection
│   │   └── migrate.ts               # Migration runner
│   ├── sessions/
│   │   ├── manager.ts               # In-memory session manager (SDK instances)
│   │   └── knowledge-extractor.ts   # Extract knowledge from completed sessions
│   └── supabase.ts                  # Supabase client (frontend)
├── components/
│   ├── sidebar.tsx                   # Project sidebar + nav
│   ├── session-card.tsx              # Session card for dashboard grid
│   ├── chat/
│   │   ├── message-list.tsx          # Scrollable message list
│   │   ├── message-bubble.tsx        # Single message (user or assistant)
│   │   ├── tool-use-block.tsx        # Collapsible tool use display
│   │   ├── message-input.tsx         # Chat input bar
│   │   └── session-context-panel.tsx # Right panel with knowledge + stats
│   ├── knowledge/
│   │   ├── knowledge-list.tsx        # Knowledge entry list
│   │   ├── knowledge-entry.tsx       # Single knowledge entry card
│   │   └── knowledge-form.tsx        # Add/edit knowledge entry form
│   └── new-session-dialog.tsx        # Dialog for creating new session
├── hooks/
│   ├── use-session-messages.ts       # Real-time message subscription
│   └── use-sessions.ts              # Real-time session list subscription
drizzle/                              # Generated migrations
supabase/
│   ├── config.toml                   # Supabase local config
│   └── migrations/                   # Supabase migrations (generated from Drizzle)
drizzle.config.ts                     # Drizzle config
tailwind.config.ts
next.config.ts
package.json
tsconfig.json
.env.local                            # Supabase connection string
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize Next.js project**

Run:
```bash
cd /path/to/cchq
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack
```

Expected: Next.js 15 project scaffolded with App Router, Tailwind, TypeScript.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install @anthropic-ai/claude-agent-sdk @supabase/supabase-js drizzle-orm postgres uuid
npm install -D drizzle-kit @types/uuid vitest
```

Expected: All packages installed successfully.

- [ ] **Step 3: Initialize Supabase locally**

Run:
```bash
npx supabase init
npx supabase start
```

Expected: Supabase local stack running. Note the DB URL, API URL, anon key, and service role key from output.

- [ ] **Step 4: Create `.env.local`**

Write `.env.local` with the Supabase connection details from `supabase start` output:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-start>
```

- [ ] **Step 5: Create Drizzle config**

Create `drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 6: Verify dev server starts**

Run: `npm run dev`

Expected: Next.js dev server running at http://localhost:3000, default page loads.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Supabase and dependencies"
```

---

### Task 2: Database Schema & Migrations

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`

- [ ] **Step 1: Write the Drizzle schema**

Create `src/lib/db/schema.ts`:

```typescript
import { pgTable, uuid, text, timestamptz, jsonb, pgEnum } from "drizzle-orm/pg-core";
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

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
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
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  toolUse: jsonb("tool_use"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
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
  createdAt: timestamptz("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Write the database client**

Create `src/lib/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
export { schema };
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: Migration files generated in `drizzle/` folder, schema pushed to local Supabase Postgres.

- [ ] **Step 4: Enable Supabase Realtime on tables**

Run via Supabase SQL editor or psql:
```bash
npx supabase db query "ALTER PUBLICATION supabase_realtime ADD TABLE sessions, messages, knowledge;"
```

Expected: Realtime enabled for sessions, messages, and knowledge tables.

- [ ] **Step 5: Verify schema in database**

Run:
```bash
npx supabase db query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
```

Expected: Tables `projects`, `sessions`, `messages`, `knowledge` listed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/ drizzle/ drizzle.config.ts
git commit -m "feat: add database schema with Drizzle ORM and Supabase"
```

---

### Task 3: Supabase Client & Real-Time Hooks

**Files:**
- Create: `src/lib/supabase.ts`, `src/hooks/use-sessions.ts`, `src/hooks/use-session-messages.ts`

- [ ] **Step 1: Create Supabase browser client**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Create `use-sessions` hook**

Create `src/hooks/use-sessions.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Session = {
  id: string;
  project_id: string;
  status: "active" | "paused" | "completed" | "errored";
  model: string;
  name: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_path?: string;
  message_count?: number;
  last_message?: string;
};

export function useSessions(projectId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      let query = supabase
        .from("sessions")
        .select("*, projects(name, path)")
        .order("updated_at", { ascending: false });

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data } = await query;
      if (data) {
        setSessions(
          data.map((s: any) => ({
            ...s,
            project_name: s.projects?.name,
            project_path: s.projects?.path,
          }))
        );
      }
      setLoading(false);
    }

    fetchSessions();

    const channel = supabase
      .channel("sessions-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}),
        },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return { sessions, loading };
}
```

- [ ] **Step 3: Create `use-session-messages` hook**

Create `src/hooks/use-session-messages.ts`:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export type Message = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_use: any;
  created_at: string;
};

export function useSessionMessages(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    async function fetchMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (data) {
        messagesRef.current = data;
        setMessages(data);
      }
      setLoading(false);
    }

    fetchMessages();

    const channel = supabase
      .channel(`messages-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          messagesRef.current = [...messagesRef.current, newMsg];
          setMessages([...messagesRef.current]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { messages, loading };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/hooks/
git commit -m "feat: add Supabase client and real-time hooks for sessions and messages"
```

---

### Task 4: Session Manager (SDK Integration)

**Files:**
- Create: `src/lib/sessions/manager.ts`, `src/lib/sessions/knowledge-extractor.ts`

- [ ] **Step 1: Write the session manager**

Create `src/lib/sessions/manager.ts`:

```typescript
import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

type ActiveSession = {
  query: Query;
  sessionId: string;
  sdkSessionId: string | null;
  abortController: AbortController;
};

const activeSessions = new Map<string, ActiveSession>();

export async function startSession(
  sessionId: string,
  projectPath: string,
  model: string,
  initialPrompt: string
): Promise<void> {
  const abortController = new AbortController();

  // Fetch knowledge for context injection
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const knowledgeEntries = await db.query.knowledge.findMany({
    where: eq(schema.knowledge.projectId, session.projectId),
    orderBy: [desc(schema.knowledge.createdAt)],
    limit: 20,
  });

  let systemAppend = "";
  if (knowledgeEntries.length > 0) {
    const formatted = knowledgeEntries
      .map((k) => `- [${k.type}] ${k.content}`)
      .join("\n");
    systemAppend = `\n\nHere is context from previous sessions on this project:\n${formatted}`;
  }

  const q = query({
    prompt: initialPrompt,
    options: {
      cwd: projectPath,
      model,
      abortController,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: systemAppend,
      },
      permissionMode: "acceptEdits",
    },
  });

  let sdkSessionId: string | null = null;

  // Process messages in background
  (async () => {
    try {
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          sdkSessionId = message.session_id;
          await db
            .update(schema.sessions)
            .set({ sdkSessionId: message.session_id, updatedAt: new Date() })
            .where(eq(schema.sessions.id, sessionId));
        }

        if (message.type === "assistant" && message.message?.content) {
          const textContent = message.message.content
            .filter((b: any) => "text" in b)
            .map((b: any) => b.text)
            .join("\n");

          const toolBlocks = message.message.content.filter(
            (b: any) => "name" in b
          );

          if (textContent) {
            await db.insert(schema.messages).values({
              sessionId,
              role: "assistant",
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
            });
          }
        }

        if (message.type === "result") {
          await db
            .update(schema.sessions)
            .set({
              status: message.subtype === "success" ? "active" : "errored",
              updatedAt: new Date(),
            })
            .where(eq(schema.sessions.id, sessionId));
        }
      }
    } catch (error) {
      await db
        .update(schema.sessions)
        .set({ status: "errored", updatedAt: new Date() })
        .where(eq(schema.sessions.id, sessionId));
    }
  })();

  activeSessions.set(sessionId, {
    query: q,
    sessionId,
    sdkSessionId,
    abortController,
  });
}

export async function sendMessage(
  sessionId: string,
  content: string
): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (!active) throw new Error(`No active session ${sessionId}`);

  // Persist user message
  await db.insert(schema.messages).values({
    sessionId,
    role: "user",
    content,
  });

  // Send to SDK via resume with new prompt
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
    with: { project: true },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Close current query and start a new one resuming the SDK session
  active.query.close();

  const abortController = new AbortController();
  const q = query({
    prompt: content,
    options: {
      cwd: session.projectId ? undefined : undefined, // cwd is stored in SDK session
      resume: active.sdkSessionId ?? undefined,
      abortController,
      permissionMode: "acceptEdits",
    },
  });

  // Process response messages
  (async () => {
    try {
      for await (const message of q) {
        if (message.type === "assistant" && message.message?.content) {
          const textContent = message.message.content
            .filter((b: any) => "text" in b)
            .map((b: any) => b.text)
            .join("\n");

          const toolBlocks = message.message.content.filter(
            (b: any) => "name" in b
          );

          if (textContent) {
            await db.insert(schema.messages).values({
              sessionId,
              role: "assistant",
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
            });
          }
        }

        if (message.type === "result") {
          await db
            .update(schema.sessions)
            .set({ updatedAt: new Date() })
            .where(eq(schema.sessions.id, sessionId));
        }
      }
    } catch (error) {
      console.error(`Session ${sessionId} error:`, error);
    }
  })();

  activeSessions.set(sessionId, {
    ...active,
    query: q,
    abortController,
  });
}

export async function completeSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    active.query.close();
    activeSessions.delete(sessionId);
  }

  await db
    .update(schema.sessions)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

export async function pauseSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    active.query.close();
    activeSessions.delete(sessionId);
  }

  await db
    .update(schema.sessions)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function getActiveSessions(): Map<string, ActiveSession> {
  return activeSessions;
}
```

- [ ] **Step 2: Write the knowledge extractor**

Create `src/lib/sessions/knowledge-extractor.ts`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type ExtractedKnowledge = {
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
};

export async function extractKnowledge(sessionId: string): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return;

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
  });

  if (messages.length === 0) return;

  const conversationSummary = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const prompt = `Review this conversation and extract key decisions, facts, and context that would be useful in future sessions on this project. Return a JSON array of objects with fields: type ("decision", "fact", "context", or "summary"), content (string), tags (string array).

Return ONLY the JSON array, no other text.

Conversation:
${conversationSummary}`;

  try {
    let resultText = "";

    for await (const message of query({
      prompt,
      options: {
        model: "claude-sonnet-4-6",
        maxTurns: 1,
        permissionMode: "default",
        allowedTools: [],
        persistSession: false,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        resultText = message.result;
      }
    }

    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const entries: ExtractedKnowledge[] = JSON.parse(jsonMatch[0]);

    for (const entry of entries) {
      if (!["decision", "fact", "context", "summary"].includes(entry.type)) continue;

      await db.insert(schema.knowledge).values({
        projectId: session.projectId,
        sessionId: session.id,
        type: entry.type,
        content: entry.content,
        tags: entry.tags,
      });
    }
  } catch (error) {
    console.error(`Knowledge extraction failed for session ${sessionId}:`, error);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/sessions/
git commit -m "feat: add session manager with SDK integration and knowledge extractor"
```

---

### Task 5: API Routes

**Files:**
- Create: `src/app/api/projects/route.ts`, `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/app/api/sessions/[id]/message/route.ts`, `src/app/api/sessions/[id]/complete/route.ts`, `src/app/api/knowledge/route.ts`

- [ ] **Step 1: Projects API**

Create `src/app/api/projects/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const projects = await db.query.projects.findMany({
    orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { name, path } = await req.json();

  const existing = await db.query.projects.findFirst({
    where: eq(schema.projects.path, path),
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const [project] = await db
    .insert(schema.projects)
    .values({ name, path })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
```

- [ ] **Step 2: Sessions list/create API**

Create `src/app/api/sessions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { startSession } from "@/lib/sessions/manager";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  const sessions = await db.query.sessions.findMany({
    where: projectId ? eq(schema.sessions.projectId, projectId) : undefined,
    orderBy: (sessions, { desc }) => [desc(sessions.updatedAt)],
  });
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const { projectId, name, model, prompt } = await req.json();

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [session] = await db
    .insert(schema.sessions)
    .values({
      projectId,
      name,
      model: model || "claude-sonnet-4-6",
      status: "active",
    })
    .returning();

  // Start the SDK session
  await startSession(session.id, project.path, session.model, prompt);

  // Persist the user's initial prompt
  await db.insert(schema.messages).values({
    sessionId: session.id,
    role: "user",
    content: prompt,
  });

  return NextResponse.json(session, { status: 201 });
}
```

- [ ] **Step 3: Session detail API**

Create `src/app/api/sessions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { pauseSession } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.status === "paused") {
    await pauseSession(id);
  }

  const [updated] = await db
    .update(schema.sessions)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.sessions.id, id))
    .returning();

  return NextResponse.json(updated);
}
```

- [ ] **Step 4: Send message API**

Create `src/app/api/sessions/[id]/message/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/sessions/manager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content } = await req.json();

  try {
    await sendMessage(id, content);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
```

- [ ] **Step 5: Complete session API**

Create `src/app/api/sessions/[id]/complete/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { completeSession } from "@/lib/sessions/manager";
import { extractKnowledge } from "@/lib/sessions/knowledge-extractor";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await completeSession(id);

  // Extract knowledge in background — don't block the response
  extractKnowledge(id).catch((err) =>
    console.error(`Knowledge extraction failed for ${id}:`, err)
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Knowledge API**

Create `src/app/api/knowledge/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, and, ilike, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const type = req.nextUrl.searchParams.get("type");
  const search = req.nextUrl.searchParams.get("search");

  const conditions = [];
  if (projectId) conditions.push(eq(schema.knowledge.projectId, projectId));
  if (type)
    conditions.push(
      eq(schema.knowledge.type, type as "decision" | "fact" | "context" | "summary")
    );
  if (search) conditions.push(ilike(schema.knowledge.content, `%${search}%`));

  const entries = await db.query.knowledge.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(schema.knowledge.createdAt)],
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const { projectId, type, content, tags } = await req.json();

  const [entry] = await db
    .insert(schema.knowledge)
    .values({ projectId, type, content, tags: tags || [] })
    .returning();

  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.delete(schema.knowledge).where(eq(schema.knowledge.id, id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/
git commit -m "feat: add API routes for projects, sessions, messages, and knowledge"
```

---

### Task 6: Sidebar & Layout

**Files:**
- Create: `src/components/sidebar.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Build the sidebar component**

Create `src/components/sidebar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Project = {
  id: string;
  name: string;
  path: string;
};

export function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
  }, []);

  return (
    <aside className="w-52 border-r border-neutral-800 bg-neutral-950 flex flex-col p-4 shrink-0">
      <Link href="/" className="text-lg font-semibold text-white mb-1">
        CCHQ
      </Link>
      <span className="text-xs text-neutral-500 mb-6">Claude Code Headquarters</span>

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
        Projects
      </div>
      <Link
        href="/"
        className={`px-2.5 py-1.5 rounded text-sm mb-0.5 ${
          pathname === "/" ? "bg-blue-950/50 text-blue-300" : "text-neutral-400 hover:text-neutral-200"
        }`}
      >
        All Sessions
      </Link>
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/?project=${p.id}`}
          className="px-2.5 py-1.5 rounded text-sm text-neutral-400 hover:text-neutral-200 mb-0.5"
        >
          {p.name}
        </Link>
      ))}

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-6 mb-2">
        Memory
      </div>
      <Link
        href="/knowledge"
        className={`px-2.5 py-1.5 rounded text-sm ${
          pathname === "/knowledge" ? "bg-blue-950/50 text-blue-300" : "text-neutral-400 hover:text-neutral-200"
        }`}
      >
        Knowledge Base
      </Link>
    </aside>
  );
}
```

- [ ] **Step 2: Update root layout**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CCHQ — Claude Code Headquarters",
  description: "Control multiple Claude Code instances from one place",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-neutral-950 text-neutral-100 antialiased`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify layout renders**

Run: `npm run dev`

Expected: Dark layout with sidebar on the left, "CCHQ" branding, project list, knowledge base link.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx src/app/layout.tsx
git commit -m "feat: add sidebar navigation and dark layout"
```

---

### Task 7: Dashboard Overview Page

**Files:**
- Create: `src/components/session-card.tsx`, `src/components/new-session-dialog.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Build the session card component**

Create `src/components/session-card.tsx`:

```tsx
import Link from "next/link";
import type { Session } from "@/hooks/use-sessions";

const statusStyles = {
  active: { bg: "bg-green-950/50", text: "text-green-400", dot: "●" },
  paused: { bg: "bg-yellow-950/50", text: "text-yellow-400", dot: "◐" },
  completed: { bg: "bg-neutral-800", text: "text-neutral-400", dot: "○" },
  errored: { bg: "bg-red-950/50", text: "text-red-400", dot: "✕" },
};

export function SessionCard({ session }: { session: Session }) {
  const style = statusStyles[session.status];

  return (
    <Link
      href={`/sessions/${session.id}`}
      className={`block bg-neutral-900 border rounded-lg p-4 hover:border-blue-800/50 transition-colors ${
        session.status === "active" ? "border-blue-900/30" : "border-neutral-800"
      } ${session.status === "paused" ? "opacity-70" : ""}`}
    >
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-sm font-medium text-white truncate mr-2">
          {session.name}
        </span>
        <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full shrink-0`}>
          {style.dot} {session.status}
        </span>
      </div>
      <div className="text-xs text-neutral-500 mb-2">
        {session.project_name || "Unknown project"} &middot; {session.model}
      </div>
      {session.last_message && (
        <div className="text-[13px] text-neutral-400 line-clamp-2 mb-3 leading-relaxed">
          {session.last_message}
        </div>
      )}
      <div className="flex justify-between items-center text-[11px] text-neutral-600">
        <span>{session.message_count || 0} messages</span>
        <span>{new Date(session.updated_at).toLocaleString()}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Build the new session dialog**

Create `src/components/new-session-dialog.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Project = { id: string; name: string; path: string };

export function NewSessionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [prompt, setPrompt] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then(setProjects);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    let finalProjectId = projectId;

    if (showNewProject) {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName, path: newProjectPath }),
      });
      const project = await res.json();
      finalProjectId = project.id;
    }

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: finalProjectId,
        name,
        model,
        prompt,
      }),
    });
    const session = await res.json();
    setSubmitting(false);
    onClose();
    router.push(`/sessions/${session.id}`);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold text-white mb-4">New Session</h2>

        {!showNewProject ? (
          <div className="mb-4">
            <label className="block text-xs text-neutral-400 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
              required
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="text-xs text-blue-400 mt-1 hover:underline"
            >
              + New project
            </button>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Project Name</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
                placeholder="My Project"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Directory Path</label>
              <input
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white font-mono"
                placeholder="/Users/you/Code/project"
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setShowNewProject(false)}
              className="text-xs text-neutral-400 hover:underline"
            >
              Use existing project
            </button>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-neutral-400 mb-1">Session Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            placeholder="Auth refactor"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs text-neutral-400 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
          >
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="block text-xs text-neutral-400 mb-1">Initial Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white h-24 resize-none"
            placeholder="What should Claude work on?"
            required
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Starting..." : "Start Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Build the dashboard overview page**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSessions } from "@/hooks/use-sessions";
import { SessionCard } from "@/components/session-card";
import { NewSessionDialog } from "@/components/new-session-dialog";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || undefined;
  const { sessions, loading } = useSessions(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeSessions = sessions.filter((s) => s.status === "active");

  const filtered = search
    ? sessions.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.project_name?.toLowerCase().includes(search.toLowerCase())
      )
    : sessions;

  return (
    <div>
      <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <span className="text-neutral-500 text-sm">
            {activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-white w-52 placeholder-neutral-600"
          />
          <button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 text-white px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-500"
          >
            + New Session
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-neutral-500 text-sm">Loading sessions...</div>
        ) : filtered.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-20">
            No sessions yet. Click &ldquo;+ New Session&rdquo; to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      <NewSessionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Verify dashboard renders**

Run: `npm run dev`, open http://localhost:3000.

Expected: Dark dashboard with top bar (search + new session button), empty state message, sidebar navigation.

- [ ] **Step 5: Commit**

```bash
git add src/components/session-card.tsx src/components/new-session-dialog.tsx src/app/page.tsx
git commit -m "feat: add dashboard overview with session cards and new session dialog"
```

---

### Task 8: Session Chat View

**Files:**
- Create: `src/components/chat/message-list.tsx`, `src/components/chat/message-bubble.tsx`, `src/components/chat/tool-use-block.tsx`, `src/components/chat/message-input.tsx`, `src/components/chat/session-context-panel.tsx`, `src/app/sessions/[id]/page.tsx`

- [ ] **Step 1: Build the tool use block**

Create `src/components/chat/tool-use-block.tsx`:

```tsx
"use client";

import { useState } from "react";

type ToolBlock = {
  name: string;
  input?: any;
};

export function ToolUseBlock({ tools }: { tools: ToolBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-md mt-1.5 overflow-hidden max-w-[80%]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-xs text-neutral-500 text-left hover:text-neutral-300 flex justify-between items-center"
      >
        <span>{tools.length} tool call{tools.length !== 1 ? "s" : ""}</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded &&
        tools.map((tool, i) => (
          <div
            key={i}
            className="px-3 py-2 border-t border-neutral-800 text-xs flex justify-between items-center"
          >
            <span className="text-neutral-400">
              {tool.name}{" "}
              {tool.input?.file_path && (
                <span className="text-neutral-600 font-mono">
                  {tool.input.file_path}
                </span>
              )}
              {tool.input?.command && (
                <span className="text-neutral-600 font-mono">
                  {tool.input.command}
                </span>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}
```

- [ ] **Step 2: Build the message bubble**

Create `src/components/chat/message-bubble.tsx`:

```tsx
import type { Message } from "@/hooks/use-session-messages";
import { ToolUseBlock } from "./tool-use-block";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const timeAgo = new Date(message.created_at).toLocaleTimeString();

  return (
    <div className="mb-5">
      <div className="text-[11px] text-neutral-600 mb-1">
        {isUser ? "You" : "Claude"} &middot; {timeAgo}
      </div>
      <div
        className={`rounded-lg px-4 py-3 text-sm leading-relaxed max-w-[80%] ${
          isUser
            ? "bg-blue-950/30 text-blue-100"
            : "bg-neutral-900 border border-neutral-800 text-neutral-300"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
      {message.tool_use && Array.isArray(message.tool_use) && (
        <ToolUseBlock tools={message.tool_use} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build the message list**

Create `src/components/chat/message-list.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/hooks/use-session-messages";
import { MessageBubble } from "./message-bubble";

export function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {messages
        .filter((m) => m.role !== "system")
        .map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Build the message input**

Create `src/components/chat/message-input.tsx`:

```tsx
"use client";

import { useState } from "react";

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (content: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-neutral-800">
      <div className="flex gap-3 items-end">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white resize-none placeholder-neutral-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Build the session context panel**

Create `src/components/chat/session-context-panel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
};

export function SessionContextPanel({
  sessionId,
  projectId,
  projectPath,
  model,
  messageCount,
}: {
  sessionId: string;
  projectId: string;
  projectPath: string;
  model: string;
  messageCount: number;
}) {
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);

  useEffect(() => {
    if (projectId) {
      fetch(`/api/knowledge?projectId=${projectId}`)
        .then((r) => r.json())
        .then((entries) => setKnowledge(entries.slice(0, 10)));
    }
  }, [projectId]);

  return (
    <div className="w-64 border-l border-neutral-800 p-4 overflow-y-auto shrink-0">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-3">
        Session Context
      </div>

      <div className="bg-neutral-900 rounded-md p-2.5 mb-2.5">
        <div className="text-[11px] text-neutral-500 mb-1">Working Directory</div>
        <div className="text-xs text-neutral-300 font-mono truncate">{projectPath}</div>
      </div>

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-4 mb-2">
        Injected Knowledge
      </div>
      {knowledge.length === 0 ? (
        <div className="text-xs text-neutral-600">No knowledge entries for this project.</div>
      ) : (
        knowledge.map((k) => (
          <div
            key={k.id}
            className="bg-green-950/20 border border-green-950/30 rounded-md p-2.5 mb-2"
          >
            <div className="text-[11px] text-green-400 mb-1">{k.type}</div>
            <div className="text-xs text-neutral-400 leading-relaxed">{k.content}</div>
          </div>
        ))
      )}

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-4 mb-2">
        Session Stats
      </div>
      <div className="text-xs text-neutral-500 leading-loose">
        Messages: {messageCount}<br />
        Model: {model}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build the session chat page**

Create `src/app/sessions/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useSessionMessages } from "@/hooks/use-session-messages";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { SessionContextPanel } from "@/components/chat/session-context-panel";

type SessionDetail = {
  id: string;
  name: string;
  status: string;
  model: string;
  project_id: string;
  project_name?: string;
  project_path?: string;
};

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { messages, loading } = useSessionMessages(id);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(setSession);
  }, [id]);

  async function handleSend(content: string) {
    setSending(true);
    await fetch(`/api/sessions/${id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSending(false);
  }

  async function handleComplete() {
    await fetch(`/api/sessions/${id}/complete`, { method: "POST" });
    setSession((s) => (s ? { ...s, status: "completed" } : s));
  }

  async function handlePause() {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    setSession((s) => (s ? { ...s, status: "paused" } : s));
  }

  const isActive = session?.status === "active";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex justify-between items-center px-6 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-neutral-500 hover:text-neutral-300 text-sm">
            &larr; Back
          </Link>
          <span className="text-base font-semibold text-white">
            {session?.name || "Loading..."}
          </span>
          {session && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                isActive
                  ? "bg-green-950/50 text-green-400"
                  : session.status === "paused"
                  ? "bg-yellow-950/50 text-yellow-400"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {session.status}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center text-xs text-neutral-500">
          {session?.model}
          {isActive && (
            <>
              <button
                onClick={handlePause}
                className="ml-3 px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 hover:text-white"
              >
                Pause
              </button>
              <button
                onClick={handleComplete}
                className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 hover:text-white"
              >
                Complete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Chat + Context Panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
              Loading messages...
            </div>
          ) : (
            <MessageList messages={messages} />
          )}
          <MessageInput
            onSend={handleSend}
            disabled={!isActive || sending}
          />
        </div>

        {session && (
          <SessionContextPanel
            sessionId={id}
            projectId={session.project_id}
            projectPath={session.project_path || ""}
            model={session.model}
            messageCount={messages.length}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify chat view renders**

Run: `npm run dev`, navigate to http://localhost:3000, create a session, verify the chat page loads.

Expected: Chat view with top bar (back link, session name, status, pause/complete buttons), message list, input bar.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ src/app/sessions/
git commit -m "feat: add session chat view with message list, input, and tool use blocks"
```

---

### Task 9: Knowledge Base View

**Files:**
- Create: `src/components/knowledge/knowledge-entry.tsx`, `src/components/knowledge/knowledge-list.tsx`, `src/components/knowledge/knowledge-form.tsx`, `src/app/knowledge/page.tsx`

- [ ] **Step 1: Build the knowledge entry card**

Create `src/components/knowledge/knowledge-entry.tsx`:

```tsx
type KnowledgeEntryData = {
  id: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  created_at: string;
  session_id: string | null;
};

const typeStyles = {
  decision: { bg: "bg-blue-950/30", text: "text-blue-400" },
  fact: { bg: "bg-green-950/30", text: "text-green-400" },
  context: { bg: "bg-yellow-950/30", text: "text-yellow-400" },
  summary: { bg: "bg-neutral-800", text: "text-neutral-400" },
};

export function KnowledgeEntry({
  entry,
  onDelete,
}: {
  entry: KnowledgeEntryData;
  onDelete: (id: string) => void;
}) {
  const style = typeStyles[entry.type];

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full`}>
          {entry.type}
        </span>
        <div className="flex gap-2 items-center">
          <span className="text-[11px] text-neutral-600">
            {new Date(entry.created_at).toLocaleDateString()}
          </span>
          <button
            onClick={() => onDelete(entry.id)}
            className="text-neutral-600 hover:text-red-400 text-xs"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="text-sm text-neutral-300 leading-relaxed mb-2">{entry.content}</p>
      {entry.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the knowledge form**

Create `src/components/knowledge/knowledge-form.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";

type Project = { id: string; name: string };

export function KnowledgeForm({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<"decision" | "fact" | "context" | "summary">("fact");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then(setProjects);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type,
        content,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });

    setSubmitting(false);
    setContent("");
    setTagsInput("");
    onSubmit();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Add Knowledge Entry</h2>

        <div className="mb-3">
          <label className="block text-xs text-neutral-400 mb-1">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            required
          >
            <option value="">Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-neutral-400 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
          >
            <option value="decision">Decision</option>
            <option value="fact">Fact</option>
            <option value="context">Context</option>
            <option value="summary">Summary</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-neutral-400 mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white h-24 resize-none"
            required
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs text-neutral-400 mb-1">Tags (comma-separated)</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            placeholder="auth, api, migration"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-400 hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Build the knowledge list**

Create `src/components/knowledge/knowledge-list.tsx`:

```tsx
"use client";

import { KnowledgeEntry } from "./knowledge-entry";

type Entry = {
  id: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  created_at: string;
  session_id: string | null;
};

export function KnowledgeList({
  entries,
  onDelete,
}: {
  entries: Entry[];
  onDelete: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-neutral-500 text-sm text-center py-20">
        No knowledge entries yet. They&apos;ll appear here as sessions are completed.
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        <KnowledgeEntry key={entry.id} entry={entry} onDelete={onDelete} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build the knowledge base page**

Create `src/app/knowledge/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { KnowledgeList } from "@/components/knowledge/knowledge-list";
import { KnowledgeForm } from "@/components/knowledge/knowledge-form";

type Entry = {
  id: string;
  project_id: string;
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
  created_at: string;
  session_id: string | null;
};

type Project = { id: string; name: string };

export default function KnowledgePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [filterProject, setFilterProject] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const fetchEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProject) params.set("projectId", filterProject);
    if (filterType) params.set("type", filterType);
    if (search) params.set("search", search);

    const res = await fetch(`/api/knowledge?${params}`);
    setEntries(await res.json());
    setLoading(false);
  }, [filterProject, filterType, search]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleDelete(id: string) {
    await fetch(`/api/knowledge?id=${id}`, { method: "DELETE" });
    fetchEntries();
  }

  return (
    <div>
      <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-white">Knowledge Base</h1>
          <span className="text-xs text-neutral-500">{entries.length} entries</span>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge..."
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-white w-52 placeholder-neutral-600"
          />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-white"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-white"
          >
            <option value="">All Types</option>
            <option value="decision">Decision</option>
            <option value="fact">Fact</option>
            <option value="context">Context</option>
            <option value="summary">Summary</option>
          </select>
          <button
            onClick={() => setFormOpen(true)}
            className="bg-blue-600 text-white px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-500"
          >
            + Add Entry
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-neutral-500 text-sm">Loading...</div>
        ) : (
          <KnowledgeList entries={entries} onDelete={handleDelete} />
        )}
      </div>

      <KnowledgeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={fetchEntries}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify knowledge page renders**

Run: `npm run dev`, navigate to http://localhost:3000/knowledge.

Expected: Knowledge base page with filters (project, type, search), add entry button, empty state.

- [ ] **Step 6: Commit**

```bash
git add src/components/knowledge/ src/app/knowledge/
git commit -m "feat: add knowledge base view with filtering, search, and manual entry"
```

---

### Task 10: End-to-End Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Ensure Supabase is running**

Run: `npx supabase status`

Expected: All services running. If not, run `npx supabase start`.

- [ ] **Step 2: Start dev server**

Run: `npm run dev`

- [ ] **Step 3: Test the full flow**

1. Open http://localhost:3000
2. Click "+ New Session"
3. Create a new project pointing to any local directory
4. Name the session, pick a model, write an initial prompt
5. Verify you're redirected to the chat view
6. Verify Claude's response streams in as messages
7. Send a follow-up message, verify response
8. Click "Complete" — verify session status changes
9. Navigate to Knowledge Base — verify extracted entries appear (may take a few seconds)
10. Go back to dashboard — verify session card shows as completed

- [ ] **Step 4: Test knowledge injection**

1. Create a new session on the same project
2. Check the backend logs — verify knowledge entries from the first session are being injected as system context
3. Ask Claude "What do you know about this project from prior sessions?" — verify it references the injected knowledge

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes"
```

---

### Task 11: Design Polish with impeccable.style

**Files:** Multiple UI files from Tasks 6-9

- [ ] **Step 1: Run `/impeccable teach`**

Invoke the impeccable skill to load design knowledge.

- [ ] **Step 2: Run `/audit` on the dashboard**

Run the impeccable audit skill against the running app at http://localhost:3000. Fix any identified design issues.

- [ ] **Step 3: Run `/polish` on key components**

Run the polish skill on:
- `src/components/session-card.tsx`
- `src/components/chat/message-bubble.tsx`
- `src/components/chat/tool-use-block.tsx`
- `src/components/knowledge/knowledge-entry.tsx`
- `src/app/layout.tsx`

Apply recommended improvements for typography, spacing, color, and visual hierarchy.

- [ ] **Step 4: Run `/typeset`**

Ensure typography is well-tuned across the app — font sizes, line heights, letter spacing.

- [ ] **Step 5: Verify in browser**

Open http://localhost:3000 and review all three views. Ensure the design feels cohesive and polished.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "style: polish UI with impeccable.style audit and design improvements"
```
