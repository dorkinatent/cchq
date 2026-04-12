# Session Experience Hardening — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Harden the session chat experience from happy-path demo to production-quality tool

## Problem

The CCUI MVP has the core skeleton — dashboard, chat view, knowledge base, real-time updates, SDK integration — but the session experience only works on the happy path. No streaming feedback, raw JSON tool displays, no error recovery, unclear resume flow, no pagination, and auto-accept-everything permissions. This makes it unusable for real daily-driver work.

## Approach

Vertical slices, each delivering end-to-end (API through UI) improvements. Each slice builds on the previous one. Order matters — streaming infrastructure enables tool rendering, which enables error handling, which enables permissions, etc.

**Build order:**
1. Streaming & thinking states
2. Rich tool rendering
3. Error recovery
4. Permission system
5. Session resume
6. Pagination & search

---

## Slice 1: Streaming & Thinking States

### Problem
You send a message and stare at nothing until the full response appears. No indication if Claude is thinking, reading files, or stuck.

### Architecture

Three-layer streaming pipeline:

**1. SDK event stream** — The Claude Agent SDK emits events as they happen (thinking, tool calls, text tokens). The session manager forwards these to a server-sent events (SSE) endpoint instead of only writing finished messages to the DB.

**2. SSE endpoint** (`/api/sessions/[id]/stream`) — Long-lived connection the client subscribes to. Emits typed events:
- `thinking_start` — Claude has begun processing
- `thinking_end` — Thinking phase complete
- `tool_start` — A tool call has begun (includes tool name + input)
- `tool_progress` — Incremental tool output (for streaming bash, etc.)
- `tool_end` — Tool call complete (includes full output)
- `text_delta` — A chunk of response text
- `message_complete` — Full message finalized, written to DB
- `ping` — Heartbeat every 15s (used by error recovery in Slice 3)

**3. Client state machine** — A `useSessionStream` hook manages the SSE connection and exposes the current phase. States: `idle` → `thinking` → `responding` (with optional `tool_use` sub-states) → `idle`.

### User Experience

- **Thinking phase** — Pulsing "Claude is thinking..." indicator in the message list with elapsed timer ("12s...").
- **Tool use phase** — Tool calls appear inline in real-time: "Reading `src/lib/db.ts`..." with a spinner, then result appears on completion. Parallel tool calls show simultaneously.
- **Text streaming** — Response text streams token-by-token. Markdown renders progressively.
- **Completion** — Streaming indicator disappears, message gets final timestamp, written to DB as permanent record.

### Key Files
- Refactor: `src/lib/sessions/manager.ts` — Emit events instead of batch-writing
- New: `src/app/api/sessions/[id]/stream/route.ts` — SSE endpoint
- New: `src/hooks/useSessionStream.ts` — Client-side stream consumer + state machine
- Refactor: `src/components/chat/MessageList.tsx` — Render streaming state at bottom
- New: `src/components/chat/StreamingIndicator.tsx` — Thinking/streaming UI component

---

## Slice 2: Rich Tool Rendering

### Problem
Tool calls show as collapsed JSON blobs. Can't see what actually happened without expanding raw JSON.

### Purpose-Built Components

**ReadTool** — File path header with file icon, syntax-highlighted code block with line numbers. Language detection from file extension. Partial ranges shown in header (e.g. "lines 50-100"). Long files truncated with "expand" button.

**EditTool** — File path header, proper diff view. Default: unified diff (red/green lines) with toggle to split view (side-by-side). Line numbers on both sides. Syntax highlighting within the diff. "Context" slider for surrounding lines.

**WriteTool** — Similar to Edit but shows full new file content with "NEW FILE" badge. For overwrites, shows diff against previous content if available.

**BashTool** — Terminal-style rendering: dark background, monospace font, command as prompt line (`$ npm test`), stdout/stderr below with ANSI color support. Exit code badge (green for 0, red for non-zero). Long output truncated with "Show full output" expander.

**GrepTool / GlobTool** — Results as file list with match counts. Each file expandable to show matching lines with highlighted search terms and line numbers.

**GenericTool** — Fallback for unrecognized tools. Structured key/value display with collapsible raw JSON.

### Shared Patterns
- Collapsible by default when output is long, expanded when short
- Copy button on any code block
- File paths displayed as breadcrumbs (`src / lib / db.ts`)
- Duration badge showing how long the tool call took
- Common props interface: `{ toolName, input, output, duration, status }`

### Dependencies
- `shiki` for syntax highlighting (tree-shakeable, all languages)
- Custom diff component using a simple line-by-line comparison of old/new strings (split on newlines, compare line equality, group into change hunks). No external diff library needed — keeps bundle lean. For edge cases where the SDK provides pre-computed diffs, render those directly.

### Key Files
- New: `src/components/chat/tools/ReadTool.tsx`
- New: `src/components/chat/tools/EditTool.tsx`
- New: `src/components/chat/tools/WriteTool.tsx`
- New: `src/components/chat/tools/BashTool.tsx`
- New: `src/components/chat/tools/GrepTool.tsx`
- New: `src/components/chat/tools/GenericTool.tsx`
- Refactor: `src/components/chat/ToolUseBlock.tsx` — Router that picks the right component by tool name

---

## Slice 3: Error Recovery

### Problem
If something fails — SDK disconnects, message doesn't send, rate limit hits — the UI gives no feedback. Messages vanish.

### Three Layers of Defense

**Layer 1: Message queue with persistence**

Every message goes into a client-side queue (persisted to `localStorage`) before hitting the API. Each message has a status: `queued` → `sending` → `sent` → `failed`.

- Refresh the page before confirmation → message still in queue, retried on load
- API call fails → message stays visible with "failed" state, never disappears
- Input field shows unsent message for edit and retry

**Layer 2: Auto-retry with exponential backoff**

Transient failures (network errors, 5xx, rate limits) trigger automatic retries: 1s → 3s → 9s, max 3 attempts. Status bar at top of chat:
- "Sending..." (normal)
- "Connection lost — reconnecting (attempt 2/3)..." (yellow, progress indicator)
- "Failed to send — Retry" (red, manual retry button after auto-retry exhausts)
- Rate limits show retry-after time: "Rate limited — retrying in 45s"

**Layer 3: SSE connection health**

- **Heartbeat** — Server sends `ping` every 15s. Client tracks last heartbeat. 30s with no heartbeat = dead connection.
- **Auto-reconnect** — On disconnect, reconnect with backoff (1s/3s/9s). On reconnect, fetch missed messages from DB using timestamps.
- **Connection status indicator** — Small dot in session header: green (connected), yellow (reconnecting), red (disconnected).

### Optimistic UI with Rollback

Message appears immediately on send (optimistic). On final failure after retries:
- Message stays with red border and "Failed to send" label
- "Retry" and "Delete" buttons appear on the message
- Input repopulates with failed content if dismissed

### Key Files
- New: `src/lib/message-queue.ts` — Client-side persistent queue with retry logic
- New: `src/hooks/useMessageQueue.ts` — React hook wrapping the queue
- New: `src/components/chat/ConnectionStatus.tsx` — Green/yellow/red dot
- New: `src/components/chat/MessageStatus.tsx` — Per-message send state indicator
- Refactor: `src/components/chat/MessageInput.tsx` — Integrates with queue instead of calling API directly
- Refactor: `src/hooks/useSessionStream.ts` — Heartbeat monitoring and auto-reconnect
- Refactor: `src/app/api/sessions/[id]/stream/route.ts` — Heartbeat ping events

---

## Slice 4: Permission System

### Problem
`persistenceMode: "acceptEdits"` auto-accepts everything. No visibility or control over what Claude does.

### Two-Layer Architecture

**Layer 1: Session trust levels**

Set when starting a session in `NewSessionDialog`:
- **Full auto** — Accept everything, no prompts. Current behavior.
- **Auto with logging** — Accept everything, but every auto-approved action appears as a compact log entry in the chat: "✓ Auto-approved: Edit `src/lib/db.ts`"
- **Ask me** — Every action matching a permission-required rule surfaces as an inline approval prompt. Claude pauses until you respond.

Default for new sessions: **Auto with logging**.

**Layer 2: Project-level rules**

Rules per project in `permission_rules` table:
- `tool_pattern` — which tool: `"Read"`, `"Edit"`, `"Bash"`, `"Write"`, or `"*"`
- `action_pattern` — optional regex on action content: `"rm.*-rf"`, `"sudo.*"`, or `null` for any action
- `decision` — `"allow"`, `"deny"`, `"ask"`
- Evaluated most-specific-first. No match falls back to session trust level.
- Managed through project settings page (`/projects/[id]/settings`).

### Inline Permission UX

When an action requires approval, a **permission card** appears in the chat stream:

- **Header**: tool icon + action description ("Claude wants to edit `src/lib/db.ts`")
- **Preview**: diffs for edits, file content for writes, command + working directory for bash
- **Batch grouping**: parallel tool calls grouped ("Claude wants to read 5 files — Allow all / Review individually")
- **Actions**:
  - "Allow" — approve this action
  - "Allow all like this" — creates a project rule auto-allowing this tool+pattern
  - "Deny" — with optional feedback text field
  - "Instead, do..." — text field to suggest alternative action
- **Timeout**: 5 minutes with no response → auto-deny with note to Claude

### Denial Handling

Claude receives structured message: `{ denied: true, reason: "user feedback", alternative: "suggested alternative" }`. Session manager translates to a system message the SDK understands.

### Auto-Logging UX

For "Auto with logging" mode: compact inline bar (not a full message bubble): `✓ Edit src/lib/db.ts (3 lines changed)` with timestamp. Clickable to expand full tool details. Visually muted and smaller to avoid cluttering conversation.

### Database Changes

New table:
```
permission_rules
├── id (uuid, PK)
├── project_id (uuid, FK → projects)
├── tool_pattern (text)
├── action_pattern (text, nullable)
├── decision (enum: allow, deny, ask)
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

New column on `sessions`: `trust_level` (enum: `full_auto`, `auto_log`, `ask_me`, default `auto_log`).

### Key Files
- New: `src/components/chat/PermissionCard.tsx` — Inline approval with preview, batch grouping, deny+feedback
- New: `src/components/chat/AutoApprovalLog.tsx` — Compact log entry for auto-approved actions
- New: `src/app/projects/[id]/settings/page.tsx` — Project settings with permission rules
- New: `src/lib/permissions/engine.ts` — Rule evaluation: tool call → allow/deny/ask
- New: `src/lib/permissions/rules.ts` — CRUD for permission rules
- Refactor: `src/lib/sessions/manager.ts` — Integrate permission engine into tool execution pipeline
- Refactor: `src/components/NewSessionDialog.tsx` — Add trust level picker
- Refactor: `src/lib/db/schema.ts` — Add `permission_rules` table, `trust_level` to sessions
- Refactor: `src/app/api/sessions/[id]/stream/route.ts` — Emit `permission_request` events, accept `permission_response`

---

## Slice 5: Session Resume

### Problem
You can pause a session but the resume path is unclear — no visual cues, no context about where you left off, knowledge may be stale.

### Three-Stage Resume Flow

**Stage 1: Surfacing paused sessions**

- **Dashboard** — Paused cards show "Resume" button directly on card, plus "Paused 2h ago" and last message preview.
- **Sidebar** — "Paused (3)" section above completed sessions with session names for quick access.
- **Session chat view** — Navigating to a paused session loads message history but replaces input area with a resume panel.

**Stage 2: Resume with context**

The **resume panel** shows:
- **Context summary** — Last 3 messages in compact format, time since paused, tools that were active when paused.
- **Knowledge delta** — New knowledge entries added to the project since pause (from other completed sessions): "3 new knowledge entries since you paused". Expandable. Re-injected on resume.
- **Resumption note** — Text area: "What's changed since you paused? (optional)" for context like "I manually fixed the auth bug".
- **Resume button** — Primary action, big and clear.

**Stage 3: What happens on resume**

1. Session status flips to `active`
2. System constructs resume payload for SDK:
   - Re-injects latest top-20 knowledge entries (may include new ones since pause)
   - Resumption note sent as system message: "The user paused this session [duration] ago and is now resuming. They noted: [note]"
3. SSE stream reconnects
4. Input area switches to normal message input
5. Resume panel slides away

### Key Files
- New: `src/components/chat/ResumePanel.tsx` — Context summary + resumption note + resume button
- New: `src/components/chat/KnowledgeDelta.tsx` — New knowledge entries since pause
- Refactor: `src/components/SessionCard.tsx` — Resume button and paused duration
- Refactor: `src/components/Sidebar.tsx` — Paused sessions section
- Refactor: `src/app/sessions/[id]/page.tsx` — Conditionally render ResumePanel vs MessageInput
- Refactor: `src/lib/sessions/manager.ts` — Resume logic: re-inject knowledge, send resumption context
- Refactor: `src/app/api/sessions/[id]/route.ts` — PATCH to support resume with optional note and knowledge re-injection

---

## Slice 6: Pagination & Search

### Problem
All messages load at once. 200+ message sessions mean slow initial load and unnavigable walls of content.

### Three Capabilities

**Capability 1: Infinite scroll with lazy loading**

- **Initial load** — Fetch latest 50 messages, scroll to bottom. Fast first paint.
- **Scroll-up loading** — Within 200px of top triggers next 50 older messages. Spinner at top during load. Scroll position anchored (no content jump).
- **API** — `GET /api/sessions/[id]/messages?before=[timestamp]&limit=50` — cursor-based pagination using `created_at`.

**Capability 2: Smart collapsing**

- **Auto-collapse** — 3+ consecutive tool calls with no assistant text between them collapse into summary: "6 tool calls — Read 3 files, Edited 2 files, Ran 1 command" with expand button.
- **User control** — "Collapse all tool blocks" / "Expand all" toggle in session header.
- **Preserved** — Collapse state tracked client-side per session in `sessionStorage`.

**Capability 3: Search and jump**

- **Full-text search** — `GET /api/sessions/[id]/messages/search?q=auth+bug` — PostgreSQL `ILIKE` search. Good enough for session-length content.
- **Results panel** — Slides down below search bar. Matching messages as compact cards: role icon, timestamp, content snippet with highlighted match. Click to jump.
- **Jump-to shortcuts** — Quick filter buttons: "Errors" (error/fail/exception), "Tool heavy" (5+ tool calls), "Start" / "End". Pre-built search queries.
- **Keyboard shortcut** — `Cmd+F` within session view focuses search bar (with hint on first use).

### Key Files
- New: `src/app/api/sessions/[id]/messages/route.ts` — Paginated message endpoint with cursor
- New: `src/app/api/sessions/[id]/messages/search/route.ts` — Search endpoint
- New: `src/hooks/useMessagePagination.ts` — Infinite scroll, scroll anchoring, page fetching
- New: `src/components/chat/CollapsedToolGroup.tsx` — Summary line for consecutive tool calls
- New: `src/components/chat/SessionSearch.tsx` — Search bar, results panel, jump-to shortcuts
- Refactor: `src/components/chat/MessageList.tsx` — Integrate pagination, tool collapsing, scroll-to-message
- Refactor: `src/app/sessions/[id]/page.tsx` — Search bar in session header

---

## Cross-Cutting Concerns

### New Dependencies
- `shiki` — Syntax highlighting for tool rendering (tree-shakeable)

### Database Migrations
- Add `permission_rules` table
- Add `trust_level` column to `sessions`

### No New External Services
Everything runs against the existing Supabase/Postgres instance. SSE is native to Next.js API routes. No new infrastructure needed.
