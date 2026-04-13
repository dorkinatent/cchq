# CCUI Mobile + Remote Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CCUI usable from a phone (LAN + Tailscale) by routing all client traffic through Next.js, adding a mobile-responsive pass to the two most-used pages, broadcasting the server on mDNS, and running on Mac boot via a LaunchAgent.

**Architecture:** Browser stops talking to Supabase directly. All reads go through `/api/*` REST routes; all realtime goes through SSE. A server-side Supabase realtime subscription watches DB changes and fans them out to SSE clients via an in-process event bus. The session list and session detail pages get an iOS-leaning responsive layout. Server binds to `0.0.0.0`, broadcasts `_ccui._tcp` via mDNS, and is launched on login by a user-level LaunchAgent. Push notifications and full mobile parity are deferred.

**Tech Stack:** Next.js 16 App Router, Vitest, Supabase (local via CLI), Drizzle ORM, Tailwind, `bonjour-service` (new), macOS `launchd`.

**Spec:** `docs/superpowers/specs/2026-04-12-ccui-mobile-remote-access-design.md`

---

## File Structure

**New files:**
- `src/lib/realtime/session-list-bus.ts` — in-process EventEmitter for session-list-scope events (created/updated/deleted + message_added).
- `src/lib/realtime/supabase-watcher.ts` — server-side Supabase realtime subscription; translates DB changes into bus events. Idempotent `ensureSupabaseWatcher()` initializer.
- `src/lib/realtime/__tests__/session-list-bus.test.ts`
- `src/lib/supabase-server.ts` — server-only Supabase client factory (uses service role key if available, otherwise anon — read-only usage in the watcher).
- `src/app/api/sessions/[id]/messages/route.ts` — GET full message history for a session.
- `src/app/api/sessions/stream/route.ts` — SSE feed for session-list changes.
- `src/lib/mdns/broadcast.ts` — starts/stops mDNS `_ccui._tcp` broadcast.
- `src/instrumentation.ts` — Next.js instrumentation hook; kicks off watcher + mDNS broadcast on server start.
- `scripts/ccui-start.sh` — LaunchAgent launch script (supabase + npm run start).
- `scripts/install-launchagent.sh` — writes plist, loads it.
- `scripts/uninstall-launchagent.sh` — unloads, removes plist.
- `scripts/app.ccui.plist.template` — plist with `{{PROJECT_DIR}}` and `{{LOG_DIR}}` placeholders.
- `docs/mobile-remote-access-runbook.md` — manual verification checklist.

**Modified files:**
- `src/lib/supabase.ts` — stripped of browser usage; re-exports from `supabase-server.ts` OR deleted outright (see Task 10).
- `src/hooks/use-sessions.ts` — fetch + EventSource instead of Supabase client.
- `src/hooks/use-session-messages.ts` — fetch + EventSource on the existing per-session stream.
- `src/app/api/sessions/[id]/stream/route.ts` — add `message_added` events sourced from the new watcher.
- `src/lib/sessions/stream-events.ts` — add `message_added` variant to `StreamEvent`.
- `src/app/page.tsx` — mobile-responsive session list.
- `src/components/session-card.tsx` — stacked/full-width at mobile widths.
- `src/app/sessions/[id]/page.tsx` (and children) — mobile-responsive session detail; sticky permission banner, safe-area composer.
- `package.json` — `dev`/`start` scripts get `-H 0.0.0.0`; `bonjour-service` dep added.

---

## Task 1: Add `bonjour-service` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dep**

Run: `npm install bonjour-service`
Expected: Installs without error; `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bonjour-service for mDNS broadcast"
```

---

## Task 2: In-process session-list event bus

**Files:**
- Create: `src/lib/realtime/session-list-bus.ts`
- Test: `src/lib/realtime/__tests__/session-list-bus.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/realtime/__tests__/session-list-bus.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { SessionListBus } from "../session-list-bus";

describe("SessionListBus", () => {
  it("delivers events to all subscribers", () => {
    const bus = new SessionListBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.emit({ type: "session_updated", sessionId: "s1", timestamp: 1 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("unsubscribe stops delivery", () => {
    const bus = new SessionListBus();
    const h = vi.fn();
    const off = bus.subscribe(h);
    off();
    bus.emit({ type: "session_updated", sessionId: "s1", timestamp: 1 });
    expect(h).not.toHaveBeenCalled();
  });

  it("isolates handler exceptions", () => {
    const bus = new SessionListBus();
    bus.subscribe(() => { throw new Error("boom"); });
    const ok = vi.fn();
    bus.subscribe(ok);
    expect(() => bus.emit({ type: "session_updated", sessionId: "s1", timestamp: 1 })).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run — confirm fails**

Run: `npx vitest run src/lib/realtime/__tests__/session-list-bus.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/realtime/session-list-bus.ts`:

```ts
export type SessionListEvent =
  | { type: "session_created"; sessionId: string; timestamp: number }
  | { type: "session_updated"; sessionId: string; timestamp: number }
  | { type: "session_deleted"; sessionId: string; timestamp: number }
  | { type: "message_added"; sessionId: string; messageId: string; timestamp: number };

export type SessionListHandler = (event: SessionListEvent) => void;

export class SessionListBus {
  private handlers = new Set<SessionListHandler>();

  subscribe(handler: SessionListHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  emit(event: SessionListEvent): void {
    for (const h of this.handlers) {
      try { h(event); } catch (err) {
        console.error("[session-list-bus] handler threw", err);
      }
    }
  }
}

export const sessionListBus = new SessionListBus();
```

- [ ] **Step 4: Run — confirm passes**

Run: `npx vitest run src/lib/realtime/__tests__/session-list-bus.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime/
git commit -m "feat(realtime): add in-process session-list event bus"
```

---

## Task 3: Add `message_added` to per-session StreamEvent

**Files:**
- Modify: `src/lib/sessions/stream-events.ts`

- [ ] **Step 1: Add variant**

Edit `src/lib/sessions/stream-events.ts` — add to the `StreamEvent` union (after the `"ping"` variant):

```ts
  | { type: "message_added"; messageId: string; role: "user" | "assistant" | "system" | "tool"; timestamp: number }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors related to this change.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sessions/stream-events.ts
git commit -m "feat(stream): add message_added event variant"
```

---

## Task 4: Server-only Supabase client

**Files:**
- Create: `src/lib/supabase-server.ts`

- [ ] **Step 1: Create**

```ts
// src/lib/supabase-server.ts
// Server-only Supabase client. Do NOT import from client components.
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars not set (NEXT_PUBLIC_SUPABASE_URL + anon or service key)");
  }
  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: false },
  });
  return _client;
}
```

- [ ] **Step 2: Install `server-only` if missing**

Run: `npm install server-only`
Expected: Installs without error.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase-server.ts package.json package-lock.json
git commit -m "feat: add server-only Supabase client factory"
```

---

## Task 5: Supabase realtime watcher (server → bus)

**Files:**
- Create: `src/lib/realtime/supabase-watcher.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/realtime/supabase-watcher.ts
import "server-only";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sessionListBus } from "./session-list-bus";
import { sessionEventBus } from "@/lib/sessions/stream-events";

let started = false;

/**
 * Opens a single server-side Supabase realtime subscription for the sessions
 * and messages tables and relays changes to the in-process buses. Idempotent:
 * safe to call multiple times.
 */
export function ensureSupabaseWatcher(): void {
  if (started) return;
  started = true;

  const supabase = getSupabaseServer();

  supabase
    .channel("watcher-sessions")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sessions" },
      (payload) => {
        const row: any = payload.new ?? payload.old ?? {};
        const sessionId = row.id;
        if (!sessionId) return;
        const timestamp = Date.now();
        if (payload.eventType === "INSERT") {
          sessionListBus.emit({ type: "session_created", sessionId, timestamp });
        } else if (payload.eventType === "DELETE") {
          sessionListBus.emit({ type: "session_deleted", sessionId, timestamp });
        } else {
          sessionListBus.emit({ type: "session_updated", sessionId, timestamp });
        }
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[watcher] sessions channel", status);
      }
    });

  supabase
    .channel("watcher-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const row: any = payload.new ?? {};
        const { id: messageId, session_id: sessionId, role } = row;
        if (!messageId || !sessionId) return;
        const timestamp = Date.now();
        sessionListBus.emit({ type: "message_added", sessionId, messageId, timestamp });
        sessionEventBus.emit(sessionId, {
          type: "message_added",
          messageId,
          role,
          timestamp,
        });
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[watcher] messages channel", status);
      }
    });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/realtime/supabase-watcher.ts
git commit -m "feat(realtime): server-side Supabase watcher relays DB changes to in-process bus"
```

---

## Task 6: Next.js instrumentation hook — start watcher

**Files:**
- Create: `src/instrumentation.ts`

- [ ] **Step 1: Create**

```ts
// src/instrumentation.ts
// Next.js calls register() once per server process at startup.
// See: node_modules/next/dist/docs/building-your-application/optimizing/instrumentation.mdx
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSupabaseWatcher } = await import("@/lib/realtime/supabase-watcher");
  ensureSupabaseWatcher();
}
```

- [ ] **Step 2: Verify Next 16 instrumentation is enabled**

Check `node_modules/next/dist/docs/` for instrumentation docs — the hook is GA in Next 16 and requires no config flag. If docs indicate otherwise, add the relevant setting to `next.config.ts`.

Run: `ls node_modules/next/dist/docs/ | grep -i instrument`
Expected: Matches a file.

- [ ] **Step 3: Boot the server and confirm no errors**

Run: `npm run dev` in a second terminal; observe startup logs.
Expected: No crash; no `[watcher] ... CHANNEL_ERROR`. Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/instrumentation.ts
git commit -m "feat: register Supabase watcher via Next instrumentation hook"
```

---

## Task 7: New REST route — `GET /api/sessions/[id]/messages`

**Files:**
- Create: `src/app/api/sessions/[id]/messages/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/sessions/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, id),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return NextResponse.json(messages);
}
```

- [ ] **Step 2: Manual smoke**

With dev server running and at least one session with messages:

```bash
curl -s http://localhost:3000/api/sessions/<SESSION_ID>/messages | head
```
Expected: JSON array of messages.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/[id]/messages/route.ts
git commit -m "feat(api): add GET /api/sessions/[id]/messages"
```

---

## Task 8: New SSE route — `GET /api/sessions/stream`

**Files:**
- Create: `src/app/api/sessions/stream/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/sessions/stream/route.ts
import { sessionListBus, type SessionListEvent } from "@/lib/realtime/session-list-bus";
import { ensureSupabaseWatcher } from "@/lib/realtime/supabase-watcher";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureSupabaseWatcher(); // belt-and-suspenders; instrumentation already calls it
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`));

      unsubscribe = sessionListBus.subscribe((event: SessionListEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Manual smoke**

With dev server running:

```bash
curl -N http://localhost:3000/api/sessions/stream
```

In another terminal, touch a session (e.g. send a message). Expected: events stream in; ping every 15s.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/stream/route.ts
git commit -m "feat(api): add SSE /api/sessions/stream"
```

---

## Task 9: Refactor `useSessions` hook to fetch + EventSource

**Files:**
- Modify: `src/hooks/use-sessions.ts`
- Modify: `src/app/api/sessions/route.ts` (to include projects + message counts so client doesn't need Supabase)

- [ ] **Step 1: Extend API route response shape**

Edit `src/app/api/sessions/route.ts` — the `GET` handler. Replace the existing query with:

```ts
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  const rows = await db.query.sessions.findMany({
    where: projectId ? eq(schema.sessions.projectId, projectId) : undefined,
    orderBy: (sessions, { desc }) => [desc(sessions.updatedAt)],
    with: { project: { columns: { name: true, path: true } } },
  });

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const raw = await db
      .select({ sessionId: schema.messages.sessionId })
      .from(schema.messages)
      .where(inArray(schema.messages.sessionId, ids));
    for (const r of raw) counts.set(r.sessionId, (counts.get(r.sessionId) ?? 0) + 1);
  }

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      project_id: r.projectId,
      project_name: r.project?.name,
      project_path: r.project?.path,
      message_count: counts.get(r.id) ?? 0,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }))
  );
}
```

Add import: `import { inArray } from "drizzle-orm";`

Note: the `with: { project: ... }` requires a relation named `project` on `schema.sessions`. Check `src/lib/db/schema.ts`; if missing, add the relation. If schema uses a different relation name, adjust.

- [ ] **Step 2: Replace hook implementation**

Replace entire contents of `src/hooks/use-sessions.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";

export type Session = {
  id: string;
  project_id: string;
  status: "active" | "paused" | "completed" | "errored";
  model: string;
  name: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  project_name?: string;
  project_path?: string;
  message_count?: number;
  last_message?: string;
};

export function useSessions(projectId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchSessions() {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      try {
        const res = await fetch(`/api/sessions${qs}`, { cache: "no-store", signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Session[];
        if (!cancelled) {
          setSessions(data);
          setLoading(false);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[useSessions] fetch failed", err);
        if (!cancelled) setLoading(false);
      }
    }

    fetchSessions();

    const es = new EventSource("/api/sessions/stream");
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === "ping") return;
        // Any session_* or message_added event means the list view may need refresh.
        if (projectId && evt.sessionId) {
          // Optimization opportunity (future): only refetch if event is for this project.
        }
        fetchSessions();
      } catch {}
    };
    es.onerror = () => {
      // Browser auto-reconnects; no-op.
    };

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      es.close();
    };
  }, [projectId]);

  return { sessions, loading };
}
```

- [ ] **Step 3: Manual smoke**

`npm run dev`, load `http://localhost:3000` in a browser. Expected: session list renders; sending a message in another tab updates the list. Open devtools Network tab → confirm no requests to `:54321`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-sessions.ts src/app/api/sessions/route.ts
git commit -m "refactor: use-sessions hook goes through /api/* (REST + SSE)"
```

---

## Task 10: Refactor `useSessionMessages` hook

**Files:**
- Modify: `src/hooks/use-session-messages.ts`

- [ ] **Step 1: Replace hook**

Replace entire contents of `src/hooks/use-session-messages.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";

export type Message = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_use: unknown;
  thinking: string | null;
  created_at: string;
};

export function useSessionMessages(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadOne(messageId: string) {
      // Lightweight re-fetch of the full list on any message_added.
      // (Could be optimized to fetch just the new message; list is small.)
      await loadAll();
      void messageId;
    }

    async function loadAll() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Message[];
        if (cancelled) return;
        messagesRef.current = data;
        setMessages(data);
        setLoading(false);
      } catch (err) {
        console.error("[useSessionMessages] fetch failed", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === "message_added") loadOne(evt.messageId);
      } catch {}
    };
    es.onerror = () => {
      // Browser auto-reconnects
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [sessionId]);

  return { messages, loading };
}
```

- [ ] **Step 2: Manual smoke**

Open a session detail page, send a message from the desktop, confirm it appears in the stream. Open devtools → confirm no `:54321` calls.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-session-messages.ts
git commit -m "refactor: use-session-messages hook goes through /api/* (REST + SSE)"
```

---

## Task 11: Remove browser-side Supabase client

**Files:**
- Delete/modify: `src/lib/supabase.ts`

- [ ] **Step 1: Audit remaining imports of `@/lib/supabase`**

Run: `rg "from \"@/lib/supabase\"" src/` (via Grep tool)
Expected: Only server-side files (API routes, lib/*). If any client components or hooks still import it, they must be migrated first — return to their task before proceeding.

- [ ] **Step 2: Decide action**

If all remaining importers are server-side: rewrite `src/lib/supabase.ts` to re-export from `supabase-server.ts`:

```ts
// src/lib/supabase.ts
// Legacy import path. New code should import from "@/lib/supabase-server".
export { getSupabaseServer } from "./supabase-server";
```

If callers use `supabase` as a module-level value, update them to call `getSupabaseServer()` — this is cleaner but may touch several files. Prefer updating callers; legacy re-export is a fallback.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "refactor: remove browser-side Supabase client"
```

---

## Task 12: Bind Next.js to `0.0.0.0`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update scripts**

Change:
```json
"dev": "next dev",
"start": "next start",
```
to:
```json
"dev": "next dev -H 0.0.0.0",
"start": "next start -H 0.0.0.0",
```

- [ ] **Step 2: Smoke**

Run `npm run dev`. From another device on the LAN: `curl -I http://<mac-lan-ip>:3000/` expected 200.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bind Next.js to 0.0.0.0 for LAN/Tailscale access"
```

---

## Task 13: mDNS broadcast

**Files:**
- Create: `src/lib/mdns/broadcast.ts`
- Modify: `src/instrumentation.ts`

- [ ] **Step 1: Implement broadcast**

Create `src/lib/mdns/broadcast.ts`:

```ts
// src/lib/mdns/broadcast.ts
import "server-only";
import { Bonjour, Service } from "bonjour-service";

let bonjour: Bonjour | null = null;
let service: Service | null = null;

export function startMdnsBroadcast(port: number = 3000): void {
  if (service) return;
  try {
    bonjour = new Bonjour();
    service = bonjour.publish({
      name: "CCUI",
      type: "ccui",
      protocol: "tcp",
      port,
      txt: { version: "1" },
    });
    console.log(`[mdns] broadcasting _ccui._tcp on port ${port}`);
  } catch (err) {
    console.error("[mdns] failed to broadcast", err);
  }
}

export function stopMdnsBroadcast(): void {
  try {
    service?.stop?.();
    bonjour?.destroy?.();
  } catch {}
  service = null;
  bonjour = null;
}
```

- [ ] **Step 2: Wire into instrumentation**

Edit `src/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSupabaseWatcher } = await import("@/lib/realtime/supabase-watcher");
  ensureSupabaseWatcher();
  const { startMdnsBroadcast } = await import("@/lib/mdns/broadcast");
  const port = Number(process.env.PORT ?? 3000);
  startMdnsBroadcast(port);
}
```

- [ ] **Step 3: Smoke**

Run `npm run dev`. From another Mac on the LAN: `dns-sd -B _ccui._tcp`
Expected: a line containing `CCUI`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mdns src/instrumentation.ts
git commit -m "feat(mdns): broadcast _ccui._tcp on server start"
```

---

## Task 14: Session list — mobile responsive

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/session-card.tsx`

- [ ] **Step 1: Audit current classes**

Read both files end-to-end. Note: the grid uses `grid-cols-1 md:grid-cols-2` already — single column on mobile is free. The top bar, search input width, and `SessionCard` layout are the likely issues.

- [ ] **Step 2: Edit top bar for mobile**

In `src/app/page.tsx`, replace the top-bar div (the one containing the active-sessions count, search, and + New button) with:

```tsx
<div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border)]">
  <div className="flex items-center gap-4">
    <span className="text-[var(--text-secondary)] text-sm">
      {activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""}
    </span>
  </div>
  <div className="flex gap-3 items-center">
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search sessions..."
      className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] flex-1 md:w-52 md:flex-none placeholder-[var(--text-muted)]"
    />
    <button
      onClick={openNewSession}
      aria-label="New session"
      className="bg-[var(--accent)] text-[var(--bg)] px-3.5 py-2 rounded-md text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors min-h-11 min-w-11"
    >
      + New
    </button>
  </div>
</div>
```

Change the keyboard-shortcut hint block (⌥⇧N / ⌘K `kbd` spans) inside the empty-state to be hidden on mobile:

```tsx
<p className="text-sm text-[var(--text-secondary)] leading-relaxed">
  <span className="hidden md:inline">
    Press <kbd>⌥⇧N</kbd> to start one, or <kbd>⌘K</kbd> to jump to a recent one.
  </span>
  <span className="md:hidden">Tap + New to start one.</span>
</p>
```
(Keep the existing `kbd` styling classes.)

Also: change the grid padding `p-5` → `p-3 md:p-5`.

- [ ] **Step 3: Update SessionCard**

In `src/components/session-card.tsx` ensure the root container uses `w-full` and horizontal padding tuned for mobile. Specifically check that there are no fixed `min-w-` or `w-[XYZpx]` values that break at narrow widths, and that action buttons are at least `min-h-11 min-w-11` (44px).

If current card uses internal flex row that wraps poorly at <360px, wrap the secondary metadata (project · time · msg count) in `flex flex-wrap gap-x-2`.

- [ ] **Step 4: Smoke**

Load `http://localhost:3000/` in Chrome devtools at iPhone 14 Pro viewport. Confirm:
- Top bar wraps cleanly
- Search is full-width on mobile
- Cards stack single-column
- No horizontal scroll

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/session-card.tsx
git commit -m "feat(mobile): responsive session list"
```

---

## Task 15: Session detail — mobile responsive shell

**Files:**
- Modify: `src/app/sessions/[id]/page.tsx` (and the primary layout component in that route)

- [ ] **Step 1: Audit current layout**

Read `src/app/sessions/[id]/page.tsx` in full. Identify:
- The top bar / session header component
- The message stream container
- The composer component
- Any sidebar (model, effort, trust-level controls)

- [ ] **Step 2: Mobile layout rules**

Apply the following at mobile widths (`< md`):

1. Top bar becomes a compact header: `[← back] [truncated session name] [⋯ overflow]`. Back button must be `min-h-11 min-w-11`. Title gets `truncate` + `max-w-[60vw]`.

2. Any desktop sidebar containing model/effort/trust is hidden on mobile (`hidden md:flex`) and its contents moved into the overflow menu opened by `⋯`. If no overflow menu exists, add one using a simple popover / full-screen sheet — reuse any existing dropdown/menu component in `src/components/ui/`.

3. Message stream container: `flex-1 overflow-y-auto`, full viewport width on mobile, auto-scroll on new message (preserve existing behavior).

4. Root layout switches to `flex flex-col h-[100svh]` so header / stream / composer stack vertically and fill the viewport. Use `100svh` (small viewport height) to handle iOS URL bar.

- [ ] **Step 3: Implement**

For each region identified in Step 1, apply the rules from Step 2. Exact edits depend on current file contents, so follow these patterns:

- Add `hidden md:flex` to any desktop-only sidebar.
- Wrap the main content in `<div className="flex flex-col h-[100svh]">`.
- Ensure the header is `sticky top-0 z-20` with appropriate background.

- [ ] **Step 4: Smoke**

Load a session in Chrome devtools iPhone viewport. Confirm: back/title/overflow header; stream fills; no desktop sidebar visible.

- [ ] **Step 5: Commit**

```bash
git add src/app/sessions
git commit -m "feat(mobile): session detail responsive shell"
```

---

## Task 16: Session detail — composer + permission banner

**Files:**
- Modify: the composer component rendered on the session detail page (find via `rg "composer" src/components/chat`)
- Modify: the permission banner component (find via `rg -i "permission" src/components`)

- [ ] **Step 1: Composer safe-area + sticky bottom**

Add to the composer's root container classes:

```
sticky bottom-0 bg-[var(--bg)] border-t border-[var(--border)]
pb-[max(env(safe-area-inset-bottom),0.75rem)]
```

Ensure the text input has `min-h-11` and the send button `min-h-11 min-w-11`.

- [ ] **Step 2: Permission banner — sticky above composer**

The banner should render between the message stream and the composer. Root classes:

```
sticky bottom-[calc(var(--composer-height,64px)+env(safe-area-inset-bottom))]
z-10 bg-[var(--warn-bg)]
```

Simplest alternative if the composer height isn't available as a variable: place the banner *inside* the same sticky container as the composer, rendered above the textarea. This is cleaner and avoids magic numbers.

Recommend the "inside sticky composer container" approach. Restructure:

```tsx
<div className="sticky bottom-0 bg-[var(--bg)] border-t border-[var(--border)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
  {permissionRequest && (
    <PermissionBanner request={permissionRequest} />
  )}
  <Composer ... />
</div>
```

`PermissionBanner` renders tool name, truncated input preview, and two side-by-side buttons (Deny, Allow) each `min-h-11`.

- [ ] **Step 3: Smoke**

In Chrome iPhone viewport: open a session, confirm composer sits above the bottom inset. Trigger a permission request (run a real session that asks to use Bash). Confirm the banner appears above the composer and both Allow/Deny work.

- [ ] **Step 4: Commit**

```bash
git add src/components
git commit -m "feat(mobile): sticky composer with permission banner and safe-area insets"
```

---

## Task 17: `ccui-start.sh` launch script

**Files:**
- Create: `scripts/ccui-start.sh`

- [ ] **Step 1: Write script**

```bash
#!/usr/bin/env bash
# scripts/ccui-start.sh — launched by LaunchAgent on login.
set -eu
cd "$(dirname "$0")/.."

LOG_DIR="$HOME/Library/Logs/ccui"
mkdir -p "$LOG_DIR"

# Ensure PATH includes homebrew / nvm paths — launchd has a minimal env.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Start Supabase (idempotent — no-op if already running).
if command -v supabase >/dev/null 2>&1; then
  supabase start >>"$LOG_DIR/supabase.log" 2>&1 || true
else
  echo "[ccui-start] supabase CLI not found" >&2
fi

# Wait for Supabase REST to be up (max 30s).
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:54321/rest/v1/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec npm run start
```

- [ ] **Step 2: Mark executable**

Run: `chmod +x scripts/ccui-start.sh`

- [ ] **Step 3: Manual test**

Build first: `npm run build` then `./scripts/ccui-start.sh`
Expected: Supabase starts if not running; Next.js starts on :3000. Ctrl-C to exit.

- [ ] **Step 4: Commit**

```bash
git add scripts/ccui-start.sh
git commit -m "feat(launchd): add ccui-start.sh launcher"
```

---

## Task 18: LaunchAgent plist template + install script

**Files:**
- Create: `scripts/app.ccui.plist.template`
- Create: `scripts/install-launchagent.sh`
- Create: `scripts/uninstall-launchagent.sh`

- [ ] **Step 1: Plist template**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.ccui</string>
  <key>ProgramArguments</key>
  <array>
    <string>{{PROJECT_DIR}}/scripts/ccui-start.sh</string>
  </array>
  <key>WorkingDirectory</key><string>{{PROJECT_DIR}}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{{LOG_DIR}}/stdout.log</string>
  <key>StandardErrorPath</key><string>{{LOG_DIR}}/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>PORT</key><string>3000</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 2: Install script**

Create `scripts/install-launchagent.sh`:

```bash
#!/usr/bin/env bash
set -eu

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/Library/Logs/ccui"
PLIST_SRC="$PROJECT_DIR/scripts/app.ccui.plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/app.ccui.plist"
LABEL="app.ccui"

mkdir -p "$LOG_DIR" "$(dirname "$PLIST_DST")"

sed -e "s|{{PROJECT_DIR}}|$PROJECT_DIR|g" \
    -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
    "$PLIST_SRC" > "$PLIST_DST"

# Unload first in case it's already loaded.
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"
echo "Loaded $LABEL. Logs: $LOG_DIR"
```

- [ ] **Step 3: Uninstall script**

Create `scripts/uninstall-launchagent.sh`:

```bash
#!/usr/bin/env bash
set -eu
PLIST="$HOME/Library/LaunchAgents/app.ccui.plist"
[ -f "$PLIST" ] && launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Uninstalled app.ccui"
```

- [ ] **Step 4: Mark executable**

Run: `chmod +x scripts/install-launchagent.sh scripts/uninstall-launchagent.sh`

- [ ] **Step 5: Manual install + verify**

Run: `./scripts/install-launchagent.sh`
Then: `launchctl list | grep ccui`
Expected: entry visible.
Then: `curl -I http://localhost:3000/` — expected 200 within ~60s.
Tail logs: `tail -f ~/Library/Logs/ccui/stderr.log` — sanity-check.

Uninstall for now (to not conflict with `npm run dev` during further development):
`./scripts/uninstall-launchagent.sh`

- [ ] **Step 6: Commit**

```bash
git add scripts/app.ccui.plist.template scripts/install-launchagent.sh scripts/uninstall-launchagent.sh
git commit -m "feat(launchd): add install/uninstall scripts and plist template"
```

---

## Task 19: Runbook doc — manual verification

**Files:**
- Create: `docs/mobile-remote-access-runbook.md`

- [ ] **Step 1: Write runbook**

```markdown
# Mobile + Remote Access Runbook

## One-time setup

1. `./scripts/install-launchagent.sh`
2. Ensure Tailscale is installed on the Mac and your iPhone; note the Mac's MagicDNS hostname (e.g. `studio.tail1234.ts.net`).
3. If macOS firewall prompts, allow `node` to accept incoming.

## Verification checklist

- [ ] **Reboot Mac.** Within 60s of login: `curl -I http://localhost:3000/` returns 200.
- [ ] **LAN:** from another device on the same LAN, `http://<mac-lan-ip>:3000/` loads; session list populates.
- [ ] **Tailscale:** from phone (Wi-Fi off, cellular on), `http://<mac>.tailXXXX.ts.net:3000/` loads; session list populates.
- [ ] **mDNS:** `dns-sd -B _ccui._tcp` on another Mac lists `CCUI`.
- [ ] **SSE:** send a message from desktop; list + detail views update on phone within ~1s.
- [ ] **Permission flow:** trigger a tool call requiring approval; banner appears on phone; Allow proceeds; Deny blocks.
- [ ] **Crash recovery:** `kill $(lsof -ti :3000)`; LaunchAgent restarts the process; phone reconnects.
- [ ] **No :54321 calls:** Chrome DevTools Network tab on phone (via remote debug) shows only `:3000` requests.

## Log locations

- `~/Library/Logs/ccui/stdout.log`
- `~/Library/Logs/ccui/stderr.log`
- `~/Library/Logs/ccui/supabase.log`
```

- [ ] **Step 2: Commit**

```bash
git add docs/mobile-remote-access-runbook.md
git commit -m "docs: add mobile + remote access runbook"
```

---

## Task 20: Final verification pass

- [ ] **Step 1: Fresh install check**

Run:
```bash
npm run build
npm run lint
npx tsc --noEmit
npx vitest run
```
Expected: All clean.

- [ ] **Step 2: Execute runbook**

Walk through every checklist item in `docs/mobile-remote-access-runbook.md`. Any failures block completion.

- [ ] **Step 3: Update memory**

If verification uncovers any architectural decisions worth remembering for future sessions, add a note to the relevant memory file.

- [ ] **Step 4: Ready for merge**

No commit for this task unless something was fixed along the way.

---

## Follow-up tickets (not in this plan)

- Push notifications (APNs + web push).
- Phase C mobile parity: knowledge base, new-session flow, projects page, ⌘K switcher.
- HTTPS via `tailscale cert` + `tailscale serve`.
- Admin/logs page to view LaunchAgent logs from phone.
- iOS app — separate project.
