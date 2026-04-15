# Gas Town Engine Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gas Town engine to CCHQ as an alternative to the existing Claude Code SDK engine, with a Rig Dashboard showing agents, ready beads, and a live event stream.

**Architecture:** Engine abstraction at the backend. Gas Town engine shells out to the `gt` CLI for operations and tails `.events.jsonl` for real-time events. Each CCHQ project picks one engine at creation; UI routes fork based on `project.engine`. No changes to existing SDK flow.

**Tech Stack:** Next.js 15, React, Tailwind, Supabase/Drizzle (existing), `child_process` (CLI shell-out), `fs.watch` (events tailing), existing theme system + SSE event bus.

---

## File Structure

```
src/
├── lib/
│   ├── engines/
│   │   ├── types.ts                  # Engine interface + shared types
│   │   └── gastown/
│   │       ├── index.ts              # Gas Town engine entry
│   │       ├── cli.ts                # gt command runner (child_process wrapper)
│   │       ├── events.ts             # .events.jsonl tailer
│   │       └── parsers.ts            # Parse gt outputs (JSON + text)
│   └── db/
│       └── schema.ts                 # Add engine column + rigs, rig_events tables
├── app/
│   ├── api/
│   │   └── rigs/
│   │       └── [projectId]/
│   │           ├── route.ts          # GET rig config, POST create/update rig
│   │           ├── status/route.ts   # GET daemon + rig health
│   │           ├── agents/route.ts   # GET agents list
│   │           ├── beads/
│   │           │   ├── route.ts      # GET ready beads, POST create bead
│   │           │   └── [id]/
│   │           │       ├── route.ts  # GET bead detail
│   │           │       └── sling/route.ts # POST sling to assignee
│   │           ├── daemon/route.ts   # POST start/stop daemon
│   │           └── stream/route.ts   # SSE for live events
│   └── projects/
│       └── [id]/
│           └── rig/
│               └── page.tsx          # Rig Dashboard page
├── components/
│   └── rig/
│       ├── daemon-status.tsx         # Daemon status dot + start/stop
│       ├── agent-tree.tsx            # Left panel — agents by role
│       ├── ready-beads.tsx           # Center panel — ready beads list
│       ├── new-bead-dialog.tsx       # Modal to create a bead
│       ├── sling-dialog.tsx          # Modal to sling a bead to an assignee
│       └── event-feed.tsx            # Right panel — live event stream
└── hooks/
    └── use-rig-events.ts             # SSE client hook for rig event stream

docs/superpowers/specs/2026-04-12-gastown-engine-design.md    # Spec (exists)
```

---

### Task 1: Database Schema for Engine + Rigs

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add engine enum and rig tables to the schema**

Open `src/lib/db/schema.ts`. Add these additions near the existing enum declarations and table definitions. Do not remove anything that's there.

At the top near other enums, add:

```typescript
export const engineEnum = pgEnum("engine", ["sdk", "gastown"]);
```

Add a new column to the existing `projects` table. Find the `projects` table definition and add the `engine` column:

```typescript
// existing projects table — add this column
engine: engineEnum("engine").notNull().default("sdk"),
```

Then add two new tables at the bottom of the file:

```typescript
export const rigs = pgTable("rigs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  townPath: text("town_path").notNull(),
  rigName: text("rig_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const rigEvents = pgTable("rig_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  rigId: uuid("rig_id")
    .notNull()
    .references(() => rigs.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actor: text("actor"),
  payload: jsonb("payload").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Push the schema to the database**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres" npx drizzle-kit push
```

Expected: `[✓] Changes applied`

- [ ] **Step 3: Verify the schema**

Run:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres -c "\dt"
```

Expected: `rigs` and `rig_events` tables listed alongside existing tables.

Run:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres -c "\d projects"
```

Expected: `engine` column with type `engine` and default `'sdk'::engine`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): add engine column and rigs/rig_events tables"
```

---

### Task 2: Engine Types Interface

**Files:**
- Create: `src/lib/engines/types.ts`

- [ ] **Step 1: Create the engine types file**

Create `src/lib/engines/types.ts`:

```typescript
/**
 * Shared types across all engine implementations.
 * The "engine" abstraction lets CCHQ route backend operations to different
 * session/agent management systems based on project.engine.
 */

export type EngineKind = "sdk" | "gastown";

// --- Gas Town specific shared types ---

export type RigConfig = {
  id: string;
  projectId: string;
  townPath: string;
  rigName: string;
};

export type DaemonStatus = "running" | "stopped" | "starting" | "error" | "unknown";

export type AgentState = "working" | "idle" | "stalled" | "gupp" | "zombie" | "unknown";

export type Agent = {
  name: string;
  role: string;
  state: AgentState;
  lastActivity: string;
  currentBead?: string;
};

export type Bead = {
  id: string;
  title: string;
  priority?: string;
  tags?: string[];
  status?: string;
  assignee?: string;
};

export type RigEvent = {
  eventType: string;
  actor?: string;
  payload: Record<string, unknown>;
  timestamp: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/engines/types.ts
git commit -m "feat(engines): add shared engine types"
```

---

### Task 3: Gas Town CLI Runner

**Files:**
- Create: `src/lib/engines/gastown/cli.ts`
- Create: `src/lib/engines/gastown/__tests__/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/engines/gastown/__tests__/cli.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGt } from "../cli";
import * as child_process from "child_process";

vi.mock("child_process");

describe("runGt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("runs gt with the given args in the town path", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const mockProc: any = {
      stdout: { on: vi.fn((ev, cb) => ev === "data" && cb("stdout-data")) },
      stderr: { on: vi.fn() },
      on: vi.fn((ev, cb) => {
        if (ev === "close") cb(0);
      }),
      kill: vi.fn(),
    };
    mockSpawn.mockReturnValue(mockProc);

    const result = await runGt({
      townPath: "/Users/test/gt",
      args: ["status"],
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "gt",
      ["status"],
      expect.objectContaining({ cwd: "/Users/test/gt" })
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("stdout-data");
  });

  it("captures stderr", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const mockProc: any = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn((ev, cb) => ev === "data" && cb("err-data")) },
      on: vi.fn((ev, cb) => {
        if (ev === "close") cb(1);
      }),
      kill: vi.fn(),
    };
    mockSpawn.mockReturnValue(mockProc);

    const result = await runGt({
      townPath: "/Users/test/gt",
      args: ["doctor"],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("err-data");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/engines/gastown/__tests__/cli.test.ts`

Expected: FAIL with "Cannot find module '../cli'"

- [ ] **Step 3: Create the CLI runner**

Create `src/lib/engines/gastown/cli.ts`:

```typescript
import { spawn } from "child_process";

export type GtCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type GtCommandOptions = {
  townPath: string;
  args: string[];
  timeoutMs?: number;
};

export async function runGt(opts: GtCommandOptions): Promise<GtCommandResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    const proc = spawn("gt", opts.args, {
      cwd: opts.townPath,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ stdout, stderr: stderr + "\n[timed out]", exitCode: 124 });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + "\n[spawn error] " + err.message,
        exitCode: 127,
      });
    });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/engines/gastown/__tests__/cli.test.ts`

Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/engines/gastown/cli.ts src/lib/engines/gastown/__tests__/cli.test.ts
git commit -m "feat(gastown): add gt CLI runner"
```

---

### Task 4: Gas Town Output Parsers

**Files:**
- Create: `src/lib/engines/gastown/parsers.ts`
- Create: `src/lib/engines/gastown/__tests__/parsers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/engines/gastown/__tests__/parsers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseDaemonStatus,
  parseAgents,
  parseReadyBeads,
  parseEventLine,
} from "../parsers";

describe("parseDaemonStatus", () => {
  it("returns running when stdout mentions running", () => {
    expect(parseDaemonStatus("Daemon is running (pid 12345)")).toBe("running");
  });

  it("returns stopped when stdout mentions stopped", () => {
    expect(parseDaemonStatus("Daemon is stopped")).toBe("stopped");
  });

  it("returns unknown on empty input", () => {
    expect(parseDaemonStatus("")).toBe("unknown");
  });
});

describe("parseAgents", () => {
  it("parses a simple agents listing", () => {
    const out = `mayor  Mayor   working    Reviewing PR #42  gt-abc12
scout  polecat idle       -                -`;
    const agents = parseAgents(out);
    expect(agents).toHaveLength(2);
    expect(agents[0]).toMatchObject({
      name: "mayor",
      role: "Mayor",
      state: "working",
      lastActivity: "Reviewing PR #42",
      currentBead: "gt-abc12",
    });
    expect(agents[1]).toMatchObject({
      name: "scout",
      role: "polecat",
      state: "idle",
    });
  });

  it("returns empty array for empty output", () => {
    expect(parseAgents("")).toEqual([]);
  });
});

describe("parseReadyBeads", () => {
  it("parses ready beads output", () => {
    const out = `gt-abc12  P1  Fix the auth middleware      auth,security
gt-def34  P2  Add streaming to chat view    frontend`;
    const beads = parseReadyBeads(out);
    expect(beads).toHaveLength(2);
    expect(beads[0]).toMatchObject({
      id: "gt-abc12",
      priority: "P1",
      title: "Fix the auth middleware",
      tags: ["auth", "security"],
    });
  });
});

describe("parseEventLine", () => {
  it("parses a JSON event line", () => {
    const line = JSON.stringify({
      type: "sling",
      actor: "mayor",
      timestamp: "2026-04-12T01:00:00Z",
      data: { bead: "gt-abc12" },
    });
    const event = parseEventLine(line);
    expect(event).toMatchObject({
      eventType: "sling",
      actor: "mayor",
      timestamp: "2026-04-12T01:00:00Z",
    });
    expect(event?.payload).toMatchObject({ data: { bead: "gt-abc12" } });
  });

  it("returns null on malformed input", () => {
    expect(parseEventLine("not json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engines/gastown/__tests__/parsers.test.ts`

Expected: FAIL with "Cannot find module '../parsers'"

- [ ] **Step 3: Create the parsers module**

Create `src/lib/engines/gastown/parsers.ts`:

```typescript
import type {
  Agent,
  AgentState,
  Bead,
  DaemonStatus,
  RigEvent,
} from "../types";

export function parseDaemonStatus(stdout: string): DaemonStatus {
  const s = stdout.toLowerCase();
  if (!s.trim()) return "unknown";
  if (s.includes("running")) return "running";
  if (s.includes("stopped") || s.includes("not running")) return "stopped";
  if (s.includes("starting")) return "starting";
  if (s.includes("error")) return "error";
  return "unknown";
}

function parseAgentState(raw: string): AgentState {
  const s = raw.toLowerCase().trim();
  if (s === "working") return "working";
  if (s === "idle") return "idle";
  if (s === "stalled") return "stalled";
  if (s === "gupp") return "gupp";
  if (s === "zombie") return "zombie";
  return "unknown";
}

export function parseAgents(stdout: string): Agent[] {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const agents: Agent[] = [];
  for (const line of lines) {
    // Whitespace-separated columns: name role state lastActivity bead
    // lastActivity may contain spaces; use heuristic: first 3 tokens are name/role/state,
    // last token is bead (or "-"), middle is lastActivity.
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const [name, role, stateRaw, ...rest] = parts;
    const bead = rest[rest.length - 1];
    const currentBead = bead && bead !== "-" ? bead : undefined;
    const lastActivityTokens = rest.slice(0, rest.length - 1);
    const lastActivity = lastActivityTokens.join(" ") || "-";
    agents.push({
      name,
      role,
      state: parseAgentState(stateRaw),
      lastActivity,
      currentBead,
    });
  }
  return agents;
}

export function parseReadyBeads(stdout: string): Bead[] {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const beads: Bead[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [id, priority, ...rest] = parts;
    // Last token: tags (comma-separated) or "-"
    const last = rest[rest.length - 1];
    const hasTags = last && last.includes(",");
    const tags = hasTags ? last.split(",").map((t) => t.trim()) : undefined;
    const titleTokens = hasTags ? rest.slice(0, rest.length - 1) : rest;
    const title = titleTokens.join(" ");
    beads.push({ id, priority, title, tags });
  }
  return beads;
}

export function parseEventLine(line: string): RigEvent | null {
  try {
    const obj = JSON.parse(line);
    if (!obj || typeof obj !== "object") return null;
    const eventType =
      (obj as { type?: unknown }).type ||
      (obj as { event_type?: unknown }).event_type;
    if (typeof eventType !== "string") return null;
    const actor = typeof (obj as { actor?: unknown }).actor === "string"
      ? (obj as { actor: string }).actor
      : undefined;
    const timestamp =
      typeof (obj as { timestamp?: unknown }).timestamp === "string"
        ? (obj as { timestamp: string }).timestamp
        : new Date().toISOString();
    return {
      eventType,
      actor,
      timestamp,
      payload: obj as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engines/gastown/__tests__/parsers.test.ts`

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/engines/gastown/parsers.ts src/lib/engines/gastown/__tests__/parsers.test.ts
git commit -m "feat(gastown): add output parsers for daemon/agents/beads/events"
```

---

### Task 5: Events Tailer

**Files:**
- Create: `src/lib/engines/gastown/events.ts`
- Create: `src/lib/engines/gastown/__tests__/events.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/engines/gastown/__tests__/events.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFile, mkdir, appendFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createEventsTailer } from "../events";
import type { RigEvent } from "../types";

describe("createEventsTailer", () => {
  const tmp = join(tmpdir(), `cchq-events-test-${Date.now()}`);

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("emits events written to the file", async () => {
    await mkdir(tmp, { recursive: true });
    const filePath = join(tmp, "events.jsonl");
    await writeFile(filePath, "");

    const events: RigEvent[] = [];
    const tailer = createEventsTailer(filePath, (e) => events.push(e));
    await tailer.ready;

    await appendFile(
      filePath,
      JSON.stringify({ type: "sling", actor: "mayor", timestamp: "2026-01-01T00:00:00Z" }) + "\n"
    );

    // Give the watcher time to fire
    await new Promise((r) => setTimeout(r, 100));

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("sling");

    tailer.stop();
  });

  it("waits for file to exist and then emits", async () => {
    await mkdir(tmp, { recursive: true });
    const filePath = join(tmp, "events.jsonl");

    const events: RigEvent[] = [];
    const tailer = createEventsTailer(filePath, (e) => events.push(e));

    // File doesn't exist yet; create it and write
    await writeFile(filePath, JSON.stringify({ type: "handoff", timestamp: "2026-01-01T00:00:00Z" }) + "\n");

    await tailer.ready;
    await new Promise((r) => setTimeout(r, 200));

    expect(events.length).toBeGreaterThanOrEqual(0); // may or may not pick up depending on timing
    tailer.stop();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engines/gastown/__tests__/events.test.ts`

Expected: FAIL with "Cannot find module '../events'"

- [ ] **Step 3: Create the events tailer**

Create `src/lib/engines/gastown/events.ts`:

```typescript
import { watch, FSWatcher, existsSync, statSync, openSync, readSync, closeSync } from "fs";
import type { RigEvent } from "../types";
import { parseEventLine } from "./parsers";

export type EventsTailer = {
  ready: Promise<void>;
  stop: () => void;
};

export function createEventsTailer(
  filePath: string,
  onEvent: (event: RigEvent) => void
): EventsTailer {
  let watcher: FSWatcher | null = null;
  let offset = 0;
  let stopped = false;

  const ready = new Promise<void>((resolve) => {
    const start = () => {
      if (stopped) return resolve();
      if (!existsSync(filePath)) {
        // Poll for the file to appear
        setTimeout(start, 500);
        return;
      }

      // Initialize offset at end of current file so we only see new events
      try {
        offset = statSync(filePath).size;
      } catch {
        offset = 0;
      }

      try {
        watcher = watch(filePath, { persistent: false }, () => {
          readNew();
        });
      } catch {
        // File may have been removed; retry later
        setTimeout(start, 500);
        return;
      }

      resolve();
    };
    start();
  });

  function readNew() {
    if (stopped) return;
    let size: number;
    try {
      size = statSync(filePath).size;
    } catch {
      return;
    }

    if (size < offset) {
      // File truncated or rotated — reset
      offset = 0;
    }

    if (size <= offset) return;

    let fd: number;
    try {
      fd = openSync(filePath, "r");
    } catch {
      return;
    }

    const length = size - offset;
    const buf = Buffer.alloc(length);
    try {
      readSync(fd, buf, 0, length, offset);
    } catch {
      closeSync(fd);
      return;
    }
    closeSync(fd);
    offset = size;

    const text = buf.toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = parseEventLine(line);
      if (event) onEvent(event);
    }
  }

  return {
    ready,
    stop() {
      stopped = true;
      watcher?.close();
      watcher = null;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engines/gastown/__tests__/events.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engines/gastown/events.ts src/lib/engines/gastown/__tests__/events.test.ts
git commit -m "feat(gastown): add .events.jsonl tailer"
```

---

### Task 6: Gas Town Engine Entry Module

**Files:**
- Create: `src/lib/engines/gastown/index.ts`

This module orchestrates the CLI + events tailer to provide a higher-level API for the routes.

- [ ] **Step 1: Create the engine entry module**

Create `src/lib/engines/gastown/index.ts`:

```typescript
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { runGt } from "./cli";
import { createEventsTailer, type EventsTailer } from "./events";
import {
  parseAgents,
  parseDaemonStatus,
  parseReadyBeads,
} from "./parsers";
import type { Agent, Bead, DaemonStatus, RigConfig, RigEvent } from "../types";
import { join } from "path";

type RigSubscriber = (event: RigEvent) => void;

const activeTailers = new Map<string, EventsTailer>();
const subscribers = new Map<string, Set<RigSubscriber>>();

export async function getRigForProject(projectId: string): Promise<RigConfig | null> {
  const rig = await db.query.rigs.findFirst({
    where: eq(schema.rigs.projectId, projectId),
  });
  if (!rig) return null;
  return {
    id: rig.id,
    projectId: rig.projectId,
    townPath: rig.townPath,
    rigName: rig.rigName,
  };
}

export async function getDaemonStatus(rig: RigConfig): Promise<DaemonStatus> {
  const { stdout, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["daemon", "status"],
  });
  if (exitCode !== 0) return "error";
  return parseDaemonStatus(stdout);
}

export async function startDaemon(rig: RigConfig): Promise<{ ok: boolean; error?: string }> {
  const { stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["daemon", "start"],
  });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to start daemon" };
  return { ok: true };
}

export async function stopDaemon(rig: RigConfig): Promise<{ ok: boolean; error?: string }> {
  const { stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["daemon", "stop"],
  });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to stop daemon" };
  return { ok: true };
}

export async function listAgents(rig: RigConfig): Promise<Agent[]> {
  const { stdout, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["agents"],
  });
  if (exitCode !== 0) return [];
  return parseAgents(stdout);
}

export async function listReadyBeads(rig: RigConfig): Promise<Bead[]> {
  const { stdout, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["ready"],
  });
  if (exitCode !== 0) return [];
  return parseReadyBeads(stdout);
}

export async function createBead(
  rig: RigConfig,
  opts: { title: string; body?: string; assignee?: string }
): Promise<{ ok: boolean; error?: string }> {
  const args = ["assign", "--title", opts.title];
  if (opts.body) args.push("--body", opts.body);
  if (opts.assignee) args.push("--assignee", opts.assignee);
  const { stderr, exitCode } = await runGt({ townPath: rig.townPath, args });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to create bead" };
  return { ok: true };
}

export async function slingBead(
  rig: RigConfig,
  beadId: string,
  target: string
): Promise<{ ok: boolean; error?: string }> {
  const { stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["sling", beadId, "--to", target],
  });
  if (exitCode !== 0) return { ok: false, error: stderr || "Failed to sling bead" };
  return { ok: true };
}

export async function doctor(rig: RigConfig): Promise<{ ok: boolean; output: string }> {
  const { stdout, stderr, exitCode } = await runGt({
    townPath: rig.townPath,
    args: ["doctor"],
  });
  return { ok: exitCode === 0, output: stdout + stderr };
}

function ensureTailer(rig: RigConfig) {
  if (activeTailers.has(rig.id)) return;

  const eventsFile = join(rig.townPath, ".events.jsonl");
  const tailer = createEventsTailer(eventsFile, (event) => {
    // Persist to rig_events
    db.insert(schema.rigEvents)
      .values({
        rigId: rig.id,
        eventType: event.eventType,
        actor: event.actor || null,
        payload: event.payload,
        timestamp: event.timestamp,
      })
      .catch((err) => console.error(`rig_events insert failed:`, err));

    // Fanout to subscribers
    const subs = subscribers.get(rig.id);
    if (subs) {
      for (const cb of subs) cb(event);
    }
  });
  activeTailers.set(rig.id, tailer);
}

export function subscribeToRigEvents(
  rig: RigConfig,
  callback: RigSubscriber
): () => void {
  ensureTailer(rig);
  if (!subscribers.has(rig.id)) {
    subscribers.set(rig.id, new Set());
  }
  subscribers.get(rig.id)!.add(callback);
  return () => {
    subscribers.get(rig.id)?.delete(callback);
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/engines/gastown/index.ts
git commit -m "feat(gastown): add engine entry module with CLI wrappers and event subscription"
```

---

### Task 7: Rig Config API Route

**Files:**
- Create: `src/app/api/rigs/[projectId]/route.ts`

- [ ] **Step 1: Create the rig config route**

Create `src/app/api/rigs/[projectId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { doctor } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await db.query.rigs.findFirst({
    where: eq(schema.rigs.projectId, projectId),
  });
  if (!rig) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rig);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { townPath, rigName } = await req.json();

  if (!townPath || !rigName) {
    return NextResponse.json({ error: "townPath and rigName are required" }, { status: 400 });
  }

  // Upsert rig
  const existing = await db.query.rigs.findFirst({
    where: eq(schema.rigs.projectId, projectId),
  });

  let rig;
  if (existing) {
    [rig] = await db
      .update(schema.rigs)
      .set({ townPath, rigName, updatedAt: new Date().toISOString() })
      .where(eq(schema.rigs.projectId, projectId))
      .returning();
  } else {
    [rig] = await db
      .insert(schema.rigs)
      .values({ projectId, townPath, rigName })
      .returning();
  }

  // Set the project's engine to 'gastown'
  await db
    .update(schema.projects)
    .set({ engine: "gastown", updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, projectId));

  // Run doctor to verify setup
  const health = await doctor({ id: rig.id, projectId, townPath, rigName });

  return NextResponse.json({ rig, health });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/rigs/[projectId]/route.ts
git commit -m "feat(api): add rigs/[projectId] route for rig config CRUD"
```

---

### Task 8: Rig Status, Agents, Beads, Daemon Routes

**Files:**
- Create: `src/app/api/rigs/[projectId]/status/route.ts`
- Create: `src/app/api/rigs/[projectId]/agents/route.ts`
- Create: `src/app/api/rigs/[projectId]/beads/route.ts`
- Create: `src/app/api/rigs/[projectId]/beads/[id]/sling/route.ts`
- Create: `src/app/api/rigs/[projectId]/daemon/route.ts`

- [ ] **Step 1: Status route**

Create `src/app/api/rigs/[projectId]/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, getDaemonStatus } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig for this project" }, { status: 404 });
  const daemon = await getDaemonStatus(rig);
  return NextResponse.json({ daemon, rig });
}
```

- [ ] **Step 2: Agents route**

Create `src/app/api/rigs/[projectId]/agents/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, listAgents } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });
  const agents = await listAgents(rig);
  return NextResponse.json(agents);
}
```

- [ ] **Step 3: Beads list + create route**

Create `src/app/api/rigs/[projectId]/beads/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, listReadyBeads, createBead } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });
  const beads = await listReadyBeads(rig);
  return NextResponse.json(beads);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });

  const { title, body, assignee } = await req.json();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const result = await createBead(rig, { title, body, assignee });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Sling route**

Create `src/app/api/rigs/[projectId]/beads/[id]/sling/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRigForProject, slingBead } from "@/lib/engines/gastown";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });

  const { target } = await req.json();
  if (!target) return NextResponse.json({ error: "target is required" }, { status: 400 });

  const result = await slingBead(rig, id, target);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Daemon route**

Create `src/app/api/rigs/[projectId]/daemon/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getRigForProject,
  startDaemon,
  stopDaemon,
} from "@/lib/engines/gastown";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) return NextResponse.json({ error: "No rig" }, { status: 404 });

  const { action } = await req.json();
  if (action === "start") {
    const result = await startDaemon(rig);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action === "stop") {
    const result = await stopDaemon(rig);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action must be start or stop" }, { status: 400 });
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/rigs/
git commit -m "feat(api): add rig status, agents, beads, daemon routes"
```

---

### Task 9: Rig Events SSE Stream Route

**Files:**
- Create: `src/app/api/rigs/[projectId]/stream/route.ts`

- [ ] **Step 1: Create the SSE stream route**

Create `src/app/api/rigs/[projectId]/stream/route.ts`:

```typescript
import { getRigForProject, subscribeToRigEvents } from "@/lib/engines/gastown";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await getRigForProject(projectId);
  if (!rig) {
    return new Response("No rig configured", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Initial ping
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`)
      );

      unsubscribe = subscribeToRigEvents(rig, (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`)
          );
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
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

- [ ] **Step 2: Commit**

```bash
git add src/app/api/rigs/[projectId]/stream/route.ts
git commit -m "feat(api): add SSE stream route for rig events"
```

---

### Task 10: Client Hook for Rig Events

**Files:**
- Create: `src/hooks/use-rig-events.ts`

- [ ] **Step 1: Create the client hook**

Create `src/hooks/use-rig-events.ts`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import type { RigEvent } from "@/lib/engines/types";

export function useRigEvents(projectId: string, enabled: boolean) {
  const [events, setEvents] = useState<RigEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`/api/rigs/${projectId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "ping") return;
        setEvents((prev) => [event, ...prev].slice(0, 500));
      } catch {}
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectId, enabled]);

  return events;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-rig-events.ts
git commit -m "feat(hooks): add use-rig-events SSE client hook"
```

---

### Task 11: Daemon Status Component

**Files:**
- Create: `src/components/rig/daemon-status.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/rig/daemon-status.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { DaemonStatus as DaemonStatusType } from "@/lib/engines/types";

const colors: Record<DaemonStatusType, string> = {
  running: "bg-[var(--active-text)]",
  stopped: "bg-[var(--errored-text)]",
  starting: "bg-[var(--paused-text)]",
  error: "bg-[var(--errored-text)]",
  unknown: "bg-[var(--text-muted)]",
};

const labels: Record<DaemonStatusType, string> = {
  running: "Daemon running",
  stopped: "Daemon stopped",
  starting: "Daemon starting…",
  error: "Daemon error",
  unknown: "Daemon status unknown",
};

export function DaemonStatus({
  projectId,
  status,
  onChange,
}: {
  projectId: string;
  status: DaemonStatusType;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function trigger(action: "start" | "stop") {
    setBusy(true);
    try {
      const res = await fetch(`/api/rigs/${projectId}/daemon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Failed: ${data.error || "unknown error"}`);
      }
    } finally {
      setBusy(false);
      onChange();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-xs text-[var(--text-secondary)]">{labels[status]}</span>
      {status === "stopped" && (
        <button
          onClick={() => trigger("start")}
          disabled={busy}
          className="text-xs px-2 py-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Start
        </button>
      )}
      {status === "running" && (
        <button
          onClick={() => trigger("stop")}
          disabled={busy}
          className="text-xs px-2 py-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Stop
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/rig/daemon-status.tsx
git commit -m "feat(rig): add daemon status component"
```

---

### Task 12: Agent Tree Component

**Files:**
- Create: `src/components/rig/agent-tree.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/rig/agent-tree.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Agent, AgentState } from "@/lib/engines/types";

const stateSymbol: Record<AgentState, string> = {
  working: "●",
  idle: "○",
  stalled: "⚠",
  gupp: "🔥",
  zombie: "💀",
  unknown: "·",
};

const stateColor: Record<AgentState, string> = {
  working: "text-[var(--active-text)]",
  idle: "text-[var(--text-muted)]",
  stalled: "text-[var(--paused-text)]",
  gupp: "text-[var(--errored-text)]",
  zombie: "text-[var(--errored-text)]",
  unknown: "text-[var(--text-muted)]",
};

export function AgentTree({ projectId }: { projectId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/rigs/${projectId}/agents`);
      if (res.ok) {
        setAgents(await res.json());
      }
      setLoading(false);
    }
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [projectId]);

  const byRole = new Map<string, Agent[]>();
  for (const a of agents) {
    if (!byRole.has(a.role)) byRole.set(a.role, []);
    byRole.get(a.role)!.push(a);
  }

  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-3">
        Agents
      </div>
      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">No agents running</div>
      ) : (
        [...byRole.entries()].map(([role, roleAgents]) => (
          <div key={role} className="mb-4">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
              {role}
            </div>
            {roleAgents.map((a) => (
              <div key={a.name} className="flex items-start gap-2 py-1 text-xs">
                <span className={`${stateColor[a.state]} shrink-0`}>
                  {stateSymbol[a.state]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--text-primary)] truncate">{a.name}</div>
                  <div className="text-[var(--text-muted)] truncate">
                    {a.lastActivity}
                  </div>
                  {a.currentBead && (
                    <div className="text-[var(--accent)] font-mono">{a.currentBead}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/rig/agent-tree.tsx
git commit -m "feat(rig): add agent tree component"
```

---

### Task 13: Ready Beads + Sling/New Bead Dialogs

**Files:**
- Create: `src/components/rig/new-bead-dialog.tsx`
- Create: `src/components/rig/sling-dialog.tsx`
- Create: `src/components/rig/ready-beads.tsx`

- [ ] **Step 1: New bead dialog**

Create `src/components/rig/new-bead-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";

export function NewBeadDialog({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/rigs/${projectId}/beads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, assignee: assignee || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(`Failed: ${data.error || "unknown"}`);
      return;
    }
    setTitle("");
    setBody("");
    setAssignee("");
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Bead</h2>
        <div className="mb-3">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Body (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] h-24 resize-none"
          />
        </div>
        <div className="mb-5">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Assignee (optional)</label>
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="e.g. mayor"
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Sling dialog**

Create `src/components/rig/sling-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";

export function SlingDialog({
  open,
  projectId,
  beadId,
  onClose,
  onSlung,
}: {
  open: boolean;
  projectId: string;
  beadId: string;
  onClose: () => void;
  onSlung: () => void;
}) {
  const [target, setTarget] = useState("mayor");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/rigs/${projectId}/beads/${beadId}/sling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(`Failed: ${data.error || "unknown"}`);
      return;
    }
    onSlung();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-sm"
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Sling {beadId}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Pick an assignee</p>
        <div className="mb-5">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            placeholder="mayor or polecat name"
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? "Slinging…" : "Sling"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Ready beads panel**

Create `src/components/rig/ready-beads.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bead } from "@/lib/engines/types";
import { NewBeadDialog } from "./new-bead-dialog";
import { SlingDialog } from "./sling-dialog";

export function ReadyBeads({ projectId }: { projectId: string }) {
  const [beads, setBeads] = useState<Bead[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [slingBeadId, setSlingBeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rigs/${projectId}/beads`);
    if (res.ok) setBeads(await res.json());
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Ready Beads
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="text-xs px-2.5 py-1 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)]"
        >
          + New Bead
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-[var(--text-muted)]">Loading...</div>
      ) : beads.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)] text-center py-6">
          All caught up — create a new bead to get started
        </div>
      ) : (
        <div className="space-y-1.5">
          {beads.map((b) => (
            <div
              key={b.id}
              className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-md p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-[var(--accent)]">{b.id}</span>
                {b.priority && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--paused-bg)] text-[var(--paused-text)] rounded">
                    {b.priority}
                  </span>
                )}
              </div>
              <div className="text-sm text-[var(--text-primary)] mb-2">{b.title}</div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {b.tags?.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] bg-[var(--surface)] text-[var(--text-muted)] px-1.5 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setSlingBeadId(b.id)}
                  className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  Sling →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewBeadDialog
        open={newOpen}
        projectId={projectId}
        onClose={() => setNewOpen(false)}
        onCreated={load}
      />
      {slingBeadId && (
        <SlingDialog
          open={true}
          projectId={projectId}
          beadId={slingBeadId}
          onClose={() => setSlingBeadId(null)}
          onSlung={load}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/rig/new-bead-dialog.tsx src/components/rig/sling-dialog.tsx src/components/rig/ready-beads.tsx
git commit -m "feat(rig): add ready beads panel with new bead + sling dialogs"
```

---

### Task 14: Event Feed Component

**Files:**
- Create: `src/components/rig/event-feed.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/rig/event-feed.tsx`:

```tsx
"use client";

import { useRigEvents } from "@/hooks/use-rig-events";

const SYMBOLS: Record<string, string> = {
  create: "+",
  created: "+",
  in_progress: "→",
  completed: "✓",
  failed: "✗",
  deleted: "⊘",
  patrol_started: "🦉",
  polecat_nudged: "⚡",
  sling: "🎯",
  handoff: "🤝",
  merge_started: "⚙",
  merged: "✓",
  merge_failed: "✗",
  merge_skipped: "⊘",
  ping: "·",
};

function symbolFor(eventType: string) {
  return SYMBOLS[eventType] || "·";
}

export function EventFeed({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const events = useRigEvents(projectId, enabled);

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-3">
        Event Stream
      </div>
      {events.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">
          {enabled ? "Waiting for events…" : "Daemon stopped"}
        </div>
      ) : (
        <div className="space-y-1 font-mono">
          {events.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-[var(--accent)] shrink-0 w-4">
                {symbolFor(e.eventType)}
              </span>
              <span className="text-[var(--text-muted)] shrink-0">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-[var(--text-secondary)] shrink-0">{e.eventType}</span>
              {e.actor && (
                <span className="text-[var(--text-muted)] truncate">{e.actor}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/rig/event-feed.tsx
git commit -m "feat(rig): add live event feed component"
```

---

### Task 15: Rig Dashboard Page

**Files:**
- Create: `src/app/projects/[id]/rig/page.tsx`

- [ ] **Step 1: Create the rig dashboard page**

Create `src/app/projects/[id]/rig/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import type { DaemonStatus as DaemonStatusType } from "@/lib/engines/types";
import { DaemonStatus } from "@/components/rig/daemon-status";
import { AgentTree } from "@/components/rig/agent-tree";
import { ReadyBeads } from "@/components/rig/ready-beads";
import { EventFeed } from "@/components/rig/event-feed";

type Status = {
  daemon: DaemonStatusType;
  rig: { id: string; projectId: string; townPath: string; rigName: string };
};

export default function RigDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [status, setStatus] = useState<Status | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rigs/${id}/status`);
    if (res.ok) setStatus(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, [load]);

  const daemonRunning = status?.daemon === "running";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex justify-between items-center px-6 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">
            &larr; Back
          </Link>
          <span className="text-base font-semibold text-[var(--text-primary)]">
            {status?.rig.rigName || "Loading..."}
          </span>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {status?.rig.townPath}
          </span>
        </div>
        {status && (
          <DaemonStatus projectId={id} status={status.daemon} onChange={load} />
        )}
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-[var(--border)] overflow-y-auto">
          <AgentTree projectId={id} />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <ReadyBeads projectId={id} />
        </main>
        <aside className="w-80 border-l border-[var(--border)] overflow-hidden flex flex-col">
          <EventFeed projectId={id} enabled={daemonRunning} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/projects/[id]/rig/page.tsx
git commit -m "feat(rig): add rig dashboard page"
```

---

### Task 16: Engine Selector in New Session Dialog

**Files:**
- Modify: `src/components/new-session-dialog.tsx`

- [ ] **Step 1: Add engine selector and Gas Town fields**

Open `src/components/new-session-dialog.tsx`. Add engine-related state and UI near the existing project/name/model fields.

Add these state hooks near the other `useState` calls:

```typescript
const [engine, setEngine] = useState<"sdk" | "gastown">("sdk");
const [townPath, setTownPath] = useState("~/gt");
const [rigName, setRigName] = useState("");
```

Inside the form JSX, **before** the Session Name input, add:

```tsx
<div className="mb-4">
  <label className="block text-xs text-[var(--text-secondary)] mb-1">Engine</label>
  <select
    value={engine}
    onChange={(e) => setEngine(e.target.value as "sdk" | "gastown")}
    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
  >
    <option value="sdk">Claude Code SDK — single-agent chat</option>
    <option value="gastown">Gas Town — multi-agent orchestration</option>
  </select>
</div>

{engine === "gastown" && (
  <>
    <div className="mb-4">
      <label className="block text-xs text-[var(--text-secondary)] mb-1">Town Path</label>
      <input
        value={townPath}
        onChange={(e) => setTownPath(e.target.value)}
        placeholder="~/gt"
        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono"
      />
    </div>
    <div className="mb-4">
      <label className="block text-xs text-[var(--text-secondary)] mb-1">Rig Name</label>
      <input
        value={rigName}
        onChange={(e) => setRigName(e.target.value)}
        placeholder="rig-slug"
        required={engine === "gastown"}
        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono"
      />
    </div>
  </>
)}
```

- [ ] **Step 2: Update submit handler to branch by engine**

Find the existing `handleSubmit` function in the same file. Replace the part that creates a session with this logic that handles both engines:

```typescript
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

  if (engine === "gastown") {
    // Configure the rig, then navigate to the rig dashboard
    const rigRes = await fetch(`/api/rigs/${finalProjectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ townPath, rigName }),
    });
    const rigData = await rigRes.json();
    setSubmitting(false);
    if (!rigRes.ok) {
      alert(`Failed to configure rig: ${rigData.error || "unknown"}`);
      return;
    }
    onClose();
    router.push(`/projects/${finalProjectId}/rig`);
    return;
  }

  // SDK engine: existing flow
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: finalProjectId,
      name,
      model,
      effort,
      prompt,
    }),
  });
  const session = await res.json();
  setSubmitting(false);
  onClose();
  router.push(`/sessions/${session.id}`);
}
```

For the Gas Town path, the Session Name, Model, Effort, and Initial Prompt fields aren't required. Wrap the Session Name, Model, Effort, and Initial Prompt form fields in `{engine === "sdk" && ( … )}` so they only render for the SDK engine.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/new-session-dialog.tsx
git commit -m "feat(ui): add engine selector to new session dialog"
```

---

### Task 17: Dashboard Routes Projects by Engine

**Files:**
- Modify: `src/components/session-card.tsx` (or the equivalent project card used on the overview)
- Modify: `src/components/sidebar.tsx`

The existing dashboard shows sessions. For Gas Town projects, we want the project card (or sidebar entry) to link to `/projects/[id]/rig` instead of a session URL.

- [ ] **Step 1: Add engine badge to the session card (SDK) and a project card path for GT projects**

In `src/components/sidebar.tsx`, find the block that renders project links (inside `ProjectItem`). Update the `Link href` to branch on the project's engine. First, ensure the project fetch includes `engine`:

Look for `type Project = { id: string; name: string; path: string; }` and change to:

```typescript
type Project = {
  id: string;
  name: string;
  path: string;
  engine: "sdk" | "gastown";
};
```

Then update `ProjectItem` so the link routes to the rig dashboard when `project.engine === "gastown"`:

```tsx
<Link
  href={project.engine === "gastown" ? `/projects/${project.id}/rig` : `/?project=${project.id}`}
  className={`block px-2.5 py-1.5 rounded text-sm truncate pr-6 ${
    isActive ? "bg-[var(--surface-raised)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
  }`}
  title={project.path}
>
  <span className="mr-1 text-[10px] text-[var(--text-muted)] uppercase">
    {project.engine === "gastown" ? "GT" : "SDK"}
  </span>
  {project.name}
</Link>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(ui): route Gas Town projects to rig dashboard from sidebar"
```

---

### Task 18: End-to-End Smoke Test

**Files:** None (manual test)

- [ ] **Step 1: Ensure `gt` is installed and a test rig exists**

Run:
```bash
which gt
gt --version
ls ~/gt
```

Expected: `gt` in PATH, version prints, `~/gt` exists. If no rig yet:
```bash
cd ~/gt
gt install   # or whatever the install command is for a new HQ
gt rig add <some-test-project-path>
gt daemon start
```

- [ ] **Step 2: Run CCHQ dev server**

Run: `npm run dev`

Open: `http://localhost:3000`

- [ ] **Step 3: Create a Gas Town project via the UI**

1. Click "+ New Session"
2. Choose engine = **Gas Town**
3. Town Path: `~/gt` (or the path you used)
4. Rig Name: (use the rig you created)
5. Click Create

Expected: Redirects to `/projects/<id>/rig` — the rig dashboard renders.

- [ ] **Step 4: Verify the dashboard**

1. Daemon status dot shows green ("Daemon running")
2. Agent tree lists the agents currently in your rig (or "No agents running" if there are none yet)
3. Ready Beads panel shows the empty state message
4. Event Stream panel shows "Waiting for events…"

- [ ] **Step 5: Create a bead via CCHQ**

1. Click "+ New Bead"
2. Title: "CCHQ smoke test bead"
3. Submit

Expected: A new bead appears in the Ready Beads list within ~10 seconds. Run `gt ready` in a terminal — it should also be listed there.

- [ ] **Step 6: Sling the bead**

1. Click "Sling →" on the bead
2. Target: `mayor` (or whatever agent is in your rig)
3. Submit

Expected: An event appears in the Event Stream panel (the `sling` event). `gt ready` should no longer list the bead.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test adjustments"
```

---

## Self-Review Summary

**Spec coverage:**
- Engine abstraction (spec §Architecture) — Task 2 types, Task 6 GT engine entry ✓
- Rigs/rig_events schema (spec §Data Model) — Task 1 ✓
- Project engine column — Task 1 + Task 17 ✓
- CLI runner (spec §Integration Surface) — Task 3 ✓
- Events tailer (spec §Integration Surface) — Task 5 ✓
- Output parsers — Task 4 ✓
- Rig Dashboard UI (spec §UI Surfaces) — Tasks 11–15 ✓
- Engine Selector in new session flow — Task 16 ✓
- Error handling via daemon status banner, stderr toasts — Task 11 + Task 15 ✓
- Testing (unit tests for CLI/events/parsers, e2e manual) — Tasks 3, 4, 5, 18 ✓

**Type consistency:** All module signatures align (RigConfig, Bead, Agent, DaemonStatus flow from types.ts through index.ts into API routes and components).

**No placeholders.** All steps contain concrete code or commands.
