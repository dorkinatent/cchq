# CCUI × Gas Town Integration — Engine Abstraction

**Date:** 2026-04-12
**Status:** Approved (Phase 1 vertical slice)

## Problem

CCUI today has a single session engine — it spawns Claude Code SDK sessions directly and renders them as chats. Gas Town (gastownhall/gastown) is a CLI-first multi-agent orchestration system for running swarms of AI agents. It has overlapping and complementary concepts: persistent work state, agent health monitoring, cross-session context. Rather than reimplement Gas Town's ideas inside CCUI, **CCUI becomes a pluggable cockpit** that can drive either engine per project.

## Goals

- Make CCUI a UI for Gas Town when the user prefers multi-agent orchestration
- Keep the existing single-agent SDK flow working for users who just want a chat-based session
- Avoid reimplementing Gas Town's ideas; surface them through a clean engine abstraction
- Start with a vertical slice (Phase 1) that proves the pipeline works end-to-end with the minimum set of UI surfaces

## Non-Goals (Phase 1)

- Convoy kanban, Formula library, Escalation inbox, Polecat peek viewer, Worktree visualizer, Mayor chat UI, Seance integration — captured as future phases but not built in Phase 1.
- Replacing `gt dashboard` — CCUI complements it, doesn't try to do everything Gas Town's own web UI does.
- Querying Dolt SQL directly — start with CLI + events.jsonl; move to direct SQL only if CLI proves too slow for specific reads.

## Architecture

Three layers, same as CCUI today, with an engine abstraction inserted at the backend:

```
┌─────────────────────────────────────────────┐
│  Frontend (Next.js App Router)              │
│  Routes branch by project.engine            │
│  - sdk    → existing session chat pages     │
│  - gastown → new Rig Dashboard page          │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│  Backend (Next.js API routes)               │
│  ┌───────────────┐   ┌───────────────────┐  │
│  │  SDK Engine   │   │  Gas Town Engine  │  │
│  │  (existing)   │   │                   │  │
│  │               │   │  • gt CLI runner  │  │
│  │               │   │  • events tailer  │  │
│  │               │   │  • parsers        │  │
│  └───────────────┘   └───────────────────┘  │
└─────────────────────────────────────────────┘
                  │
                  ▼ (child_process + file I/O)
      ┌─────────────────────────┐
      │  Gas Town (external)    │
      │  ~/gt/ (or custom path) │
      │  ├── .events.jsonl      │
      │  ├── rigs/              │
      │  └── daemon (process)   │
      └─────────────────────────┘
```

**Engine is a property of a Project**, not a session. Chosen once at project creation; CCUI routes to engine-appropriate UI and backend code.

## Integration Surface (Gas Town)

Based on `gt --help` exploration:

- **All operations via `gt` CLI** (shell out from Node.js `child_process`). Examples we care about:
  - `gt daemon status|start|stop`
  - `gt doctor` (verify setup)
  - `gt agents` (list agents)
  - `gt ready` (list ready beads)
  - `gt bead list`, `gt show <id>`
  - `gt assign` (create bead)
  - `gt sling` (dispatch work)
  - `gt status`, `gt vitals`
- **Real-time event stream** via tailing `.events.jsonl` at the town root. Same file that `gt feed --plain` reads.
- **Daemon** is a "dumb scheduler"; we don't connect to it, we just start/stop it and reflect its status.
- **Dolt SQL server** is available (`gt dolt` commands) but we don't use it in Phase 1. Reserved for future phases if CLI reads are too slow.

## Data Model Changes

### projects (add column)

| Column | Type | Description |
|--------|------|-------------|
| `engine` | enum `'sdk' \| 'gastown'` | Default `'sdk'`. Existing projects are backfilled to `'sdk'` — no UI changes for them. |

### rigs (new table) — only populated for `engine = 'gastown'` projects

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `projectId` | uuid | FK → projects (unique) |
| `townPath` | text | Path to Gas Town HQ (e.g., `/Users/me/gt`) |
| `rigName` | text | Rig slug |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### rig_events (new table) — cached from `.events.jsonl` for query/search

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `rigId` | uuid | FK → rigs |
| `eventType` | text | `sling`, `handoff`, `patrol_started`, etc. |
| `actor` | text | Agent name |
| `payload` | jsonb | Full event data |
| `timestamp` | timestamptz | Event timestamp |

Existing tables (`sessions`, `messages`, `knowledge`) remain unchanged and serve the SDK engine path.

## Engine Abstraction (Backend)

New directory `src/lib/engines/`:

```
src/lib/engines/
├── types.ts           # Engine interface
├── sdk/
│   └── index.ts       # Thin wrapper around existing manager.ts
└── gastown/
    ├── index.ts       # Engine implementation
    ├── cli.ts         # Runs gt commands, returns stdout/stderr/exitCode
    ├── events.ts      # Tails .events.jsonl, emits StreamEvents
    └── parsers.ts     # Parses gt command outputs (JSON when available, text fallback)
```

### Engine interface (conceptual)

```typescript
interface Engine {
  // Called when user navigates to a project using this engine
  startProject(projectId: string): Promise<{ ok: true } | { ok: false; error: string }>;

  // Real-time event subscription — hooks into existing SSE infrastructure
  subscribeEvents(projectId: string, onEvent: (event: any) => void): () => void;
}
```

Gas Town engine adds methods beyond the interface:
- `getDaemonStatus(rig)` → running | stopped | error
- `listAgents(rig)` → `{ name, role, status, lastActivity }[]`
- `listReadyBeads(rig)` → `{ id, title, priority, tags }[]`
- `getBead(rig, id)` → full bead detail
- `assignBead(rig, { title, body, assignee? })` → created bead
- `slingBead(rig, beadId, target)` → dispatched
- `startDaemon(rig)` / `stopDaemon(rig)`
- `doctor(rig)` → health check output

Each maps 1:1 to a `gt` CLI invocation with args derived from the rig config.

### CLI runner (`cli.ts`)

Wraps `child_process.spawn` with:
- Working directory = rig's town path
- Timeout (default 30s, configurable per command)
- Returns `{ stdout, stderr, exitCode }`
- Preferred flags like `--json` when supported, fallback to text parsing
- Error surfaced up to the route handler; routes translate to `{ error }` JSON responses

### Events tailer (`events.ts`)

- Uses Node's `fs.watch` on the `.events.jsonl` file
- On change, reads from last known offset, parses each newly-appended JSON line
- Emits parsed events to:
  1. In-process event bus (per-rig keyed, reusing the existing `SessionEventBus` pattern)
  2. Inserts into `rig_events` table for history / search
- Survives file truncation/rotation (if inode changes, resets offset)

## UI Surfaces (Phase 1)

### 1. Project Settings — Engine Selector

In the New Session Dialog (and a new Edit Project UI), add an Engine dropdown:

- **Claude Code SDK** (default)
- **Gas Town**

If `gastown` is selected, show additional fields:
- **Town Path** (input, defaults to `~/gt`, validated on submit)
- **Rig Name** (input, validated against `gt rig list` output)

On submit, backend runs `gt doctor` in the town path. If it fails (daemon not running, rig missing, etc.), surface the error. Offer a "Start Daemon" button inline when that's the specific failure.

### 2. Rig Dashboard Page

Replaces the session chat page for `engine = 'gastown'` projects. Route: `/projects/[id]/rig`.

**Top bar:**
- Rig name + town path
- Daemon status dot (green = running, yellow = starting, red = stopped, gray = unknown)
- "Start Daemon" / "Stop Daemon" button based on status
- Link to open Gas Town's built-in dashboard in a new tab (`gt dashboard`)

**Three-panel layout below the top bar:**

- **Left panel — Agent tree**
  Grouped by role (Mayor at top, polecats below). Each agent row shows:
  - Status dot (● working, ○ idle, ⚠ stalled, 🔥 GUPP, 💀 zombie)
  - Name
  - Latest activity (truncated)
  - Current bead (if any)
  Refreshed every 10s via `gt agents` and updated in real-time from event feed.

- **Center panel — Ready beads**
  List from `gt ready`. Each row:
  - Bead ID (short form)
  - Title
  - Priority indicator
  - Tags
  - "Sling" button → modal to pick assignee (Mayor or a specific polecat)
  Top of panel: "+ New Bead" button → modal with Title, Body, optional Assignee, runs `gt assign`.

- **Right panel — Live event stream**
  Scrollable chronological feed. Each event rendered with Gas Town's symbols (`+`, `→`, `✓`, `✗`, `🎯`, `🤝`, etc.) and a short human-readable summary. Colored by event type. Sourced from the events tailer in real time.

**Empty states:**
- No ready beads → "All caught up — create a new bead to get started"
- No agents → "No agents running in this rig — check daemon status"
- Daemon stopped → banner above everything: "Daemon is stopped. Start it to see live data."

### 3. Sidebar

Projects list in the sidebar shows an engine badge (SDK or GT) next to each project name for quick visual distinction.

## Error Handling

- `gt` command fails → surface stderr in UI as a toast or inline error in the relevant panel.
- Daemon not running → banner replaces dashboard content with a "Start Daemon" button.
- `.events.jsonl` missing or unreadable → retry every 5s, show "Waiting for events..." placeholder. Log the reason to server console.
- Rig not found at configured path → error in project settings, block navigation to Rig Dashboard until fixed.
- Gas Town CLI not installed / not on PATH → detect on first project creation attempt, show install instructions with a link to Gas Town docs.
- All `gt` command invocations time out at 30 seconds by default. If a command times out, show a timeout error and a Retry button.

## Testing

- **Unit tests** for `cli.ts` — mock `child_process`, verify correct args passed, output parsed correctly.
- **Unit tests** for `events.ts` — write events to a temp file, verify subscribers receive them. Verify rotation/truncation handling.
- **Unit tests** for `parsers.ts` — pin against fixture outputs captured from the real `gt` CLI (saved to `test/fixtures/gt/`).
- **Integration test** — against a real Gas Town install:
  1. Create a test rig
  2. Start daemon
  3. Create a CCUI project pointing at it
  4. Assign a bead via CCUI
  5. Verify the bead appears in `gt ready`
  6. Verify the event shows up in our rig_events table

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 App Router, Tailwind, existing theme system |
| Backend | Next.js API routes, `child_process` for CLI, `fs.watch` for events tailing |
| Database | Existing Supabase + Drizzle — adds `rigs`, `rig_events` tables + `engine` column on projects |
| External | Gas Town CLI (`gt`), daemon, `.events.jsonl` |

## Future Phases (Out of Scope for Phase 1)

- **Phase 2: Bead/Convoy enrichment** — Convoy kanban view; bead detail side panel with full history
- **Phase 3: Mayor chat** — embedded chat UI that pipes through to `gt mayor attach` (pty bridge or SDK wiring)
- **Phase 4: Escalation inbox + Polecat peek** — dedicated surfaces for stuck agents and live output viewing
- **Phase 5: Formula library + Worktree visualizer**
- **Phase 6: Seance ↔ Knowledge Base integration** — pull session events from seance into CCUI's knowledge base, and vice versa
