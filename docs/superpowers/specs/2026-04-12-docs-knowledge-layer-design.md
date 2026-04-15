# Docs Panel, Notes, and Knowledge Layer Refactor

**Date:** 2026-04-12
**Status:** Approved

## Problem

The knowledge base is empty in practice. Extraction only runs on session **Complete**, which most sessions never reach. There's also no way for Claude (or the user) to reference existing project documentation (README, AGENTS.md, CLAUDE.md, `docs/**/*.md`) from inside a session — all that knowledge lives outside CCHQ. Finally, users want a place to take cross-session notes that aren't part of the repo.

## Solution

Three tightly coupled subsystems, built as ordered slices:

1. **Docs Panel** — read-only view of repo markdown files + editable CCHQ-managed notes, both surfaced in a new tab in the session sidebar.
2. **Knowledge Layer Refactor** — manual "Remember this" button, incremental background extraction every N messages, extraction also on pause (not just complete).
3. **Auto-Ingestion & Project Settings** — on project creation, offer to seed the knowledge base from repo markdown; new Project Settings page for doc glob patterns, auto-inject toggle, and on-demand ingestion.

## Architecture

```
Project (has ingestion settings + doc glob patterns)
  │
  ├── Docs (filesystem-backed)
  │   ├── Repo docs — read via fs, matched by configurable globs
  │   └── CCHQ notes — new table `project_notes` (markdown, editable)
  │
  ├── Knowledge (DB — existing `knowledge` table, extended `origin` column)
  │   ├── Auto-extracted from session activity (incremental + final)
  │   ├── Manually added via "Remember this" button
  │   └── Seeded from repo docs on project creation (if opted in)
  │
  └── Session Context
      ├── Knowledge entries auto-injected (existing)
      └── Repo doc content auto-injected (new, if toggle on)
```

**Engine is a property of a project** (from earlier spec); these new features apply primarily to SDK engine projects. Gas Town engine projects will see the Docs tab but not the injection or extraction behaviors (since those happen inside CCHQ's session pipeline, not Gas Town's).

## Data Model

### projects — add columns

| Column | Type | Description |
|--------|------|-------------|
| `docGlobs` | jsonb | Array of glob patterns. Default: `["README.md", "CHANGELOG.md", "AGENTS.md", "CLAUDE.md", "docs/**/*.md", ".github/**/*.md", "doc/**/*.md"]` |
| `autoInjectDocs` | boolean | Default `true`. If true, matched doc content is injected into every session's system prompt. |
| `hasBeenIngestionPrompted` | boolean | Default `false`. Tracks whether the one-time "import markdown as knowledge" prompt has been shown. |

### project_notes — new table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `projectId` | uuid | FK → projects (cascade delete) |
| `title` | text | Display title |
| `content` | text | Full markdown content |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### knowledge — add column

| Column | Type | Description |
|--------|------|-------------|
| `origin` | enum `'session_extract' \| 'manual' \| 'doc_seed'` | Default `session_extract`. |

Existing `type` enum (`decision/fact/context/summary`) unchanged. Existing rows get `origin = 'session_extract'` on migration.

## Slice 1 — Docs Panel & Notes

### New API routes

- `GET /api/projects/[id]/docs` — scans `projectPath` using the project's `docGlobs`, returns `[{ relativePath, name, size, mtime }]`
- `GET /api/projects/[id]/docs/content?path=<rel>` — returns raw markdown content. Server validates that the resolved absolute path stays inside `projectPath`; rejects with 400 otherwise.
- `GET /api/projects/[id]/notes` — list notes
- `POST /api/projects/[id]/notes` — create note (`{ title, content }`)
- `PATCH /api/projects/[id]/notes/[noteId]` — update note
- `DELETE /api/projects/[id]/notes/[noteId]` — delete note

### New service modules

- `src/lib/docs/scanner.ts` — given a project path and glob list, returns matching files using a glob library (picomatch or fast-glob, whichever is already in deps; otherwise add `fast-glob` as a dep). Excludes `node_modules`, `.next`, `dist`, `build`, `.git`. Path validation helper for content reads.
- `src/lib/docs/notes.ts` — CRUD for `project_notes` table.

### UI changes

- `src/components/chat/session-context-panel.tsx` — add a tab switcher at the top: **Context** (existing content), **Docs**, **Notes**.
- New component `src/components/docs/docs-tab.tsx` — file tree grouped by folder. Click opens inline markdown viewer using react-markdown. Small "↗" button that opens `vscode://file/<absolute-path>` in a new tab; if that fails (no protocol handler), copy the path to clipboard and show a toast.
- New component `src/components/docs/notes-tab.tsx` — list of notes with previews, "+ New Note" button, simple textarea editor with a "Preview" toggle that renders markdown. No fancy markdown editor in Phase 1.

## Slice 2 — Knowledge Layer Refactor

### Three extraction triggers

1. **Manual "Remember this"**
   - New button in `MessageInput` (brain icon, left of Send)
   - Takes last 6 messages by default from current session
   - Calls `POST /api/sessions/[id]/remember` — runs extractor synchronously, returns created entries
   - Frontend shows toast: "Extracted N memories"
   - Entries created with `origin: "manual"`

2. **Incremental background extraction**
   - After every 10 user+assistant messages persisted by `processMessages`, trigger extraction in the background (fire-and-forget async IIFE, same pattern as session manager processing)
   - "Every 10 messages" means: keep an in-memory counter on the `ActiveSession` entry; increment per persisted user/assistant message; when it hits 10, run extraction and reset to 0. System and tool messages don't count.
   - Only extracts from messages since `lastExtractionMessageId` (also tracked on the `ActiveSession` entry; lost on restart, which is fine — next trigger extracts everything since startup)
   - Extraction prompt includes existing knowledge entries for the project and instructs Claude **not to re-extract** what's already known (dedup at the model level)
   - Entries created with `origin: "session_extract"`

3. **On pause (new) + on complete (existing)**
   - `pauseSession` in the manager now also triggers `extractKnowledge` (currently only `completeSession` does)
   - Complete still runs a final extraction pass

### Updated module: `src/lib/sessions/knowledge-extractor.ts`

Add new functions alongside the existing `extractKnowledge`:
- `extractIncremental(sessionId: string, sinceMessageId: string | null): Promise<void>` — for the background trigger
- `extractFromMessages(sessionId: string, limit: number, origin: 'manual' | 'session_extract'): Promise<KnowledgeEntry[]>` — for the manual button; returns created entries so the API can respond with them

Dedup approach: before running the model extraction, load current knowledge for the project. Pass a compact list (`type: content`) into the extraction prompt with an instruction like: "Here are existing memories. Do not extract any of these again. Only extract NEW knowledge."

### New API route

- `POST /api/sessions/[id]/remember` — body `{ sinceMessageId?: string, count?: number }` — runs extractor synchronously, returns `{ entries: KnowledgeEntry[] }`

### UI changes

- `src/components/chat/message-input.tsx` — add Remember button with brain emoji/icon. Click calls the API, shows toast with count of extracted entries.
- No UI changes for pause — it's a backend behavior change.
- No changes to the existing knowledge base page; entries just show up with their origin visible (small badge: "session" / "manual" / "doc").

## Slice 3 — Auto-Ingestion & Project Settings

### New page: `/projects/[id]/settings`

Sections:
- **Project Info** — name (editable via existing PATCH /api/projects/[id]), path (editable), engine (display-only)
- **Doc Patterns** — list editor for `docGlobs`. Add/remove patterns. Next to the list shows "Matches N files" by calling the docs scan API.
- **Auto-Inject Docs** — toggle bound to `autoInjectDocs`.
- **Doc Ingestion** — button "Scan & Ingest Docs" opens a modal showing all matched doc files with checkboxes. User picks; CCHQ posts selected paths to `POST /api/projects/[id]/ingest` which runs extraction on each file's content.
- **Danger Zone** — delete project button.

### Project creation flow

After `POST /api/projects` returns, the frontend checks `hasBeenIngestionPrompted`. If false, calls the docs scan endpoint. If there are matched files, shows a one-time modal: "Found N markdown files. Import as knowledge?"

Options:
- **Import All** → posts all paths to `/ingest`, shows progress, sets `hasBeenIngestionPrompted = true`
- **Review First** → opens Project Settings → Doc Ingestion modal, sets flag
- **Skip** → sets flag, closes

### Auto-injection implementation

When `startSession` runs, if `project.autoInjectDocs` is true:
1. Scan docs with the project's globs
2. Concatenate content, respecting a rough budget of 20,000 characters (token-budget proxy; SDK will reject if too big)
3. Rank files by: frontmatter priority if present, then path depth (shallower first — README before `docs/deep/nested.md`), then mtime (fresher first)
4. Include files until budget is hit. If truncated, append a footer: `[N more doc files available — ask to see them]`
5. Inject as additional `systemPrompt.append` alongside knowledge (separated by a clear header like `--- Project Docs ---`)

### New API routes

- `POST /api/projects/[id]/ingest` — body `{ paths: string[] }` — for each path, reads content, runs extractor, creates `origin: "doc_seed"` knowledge entries. Returns `{ entriesCreated: number, byFile: Record<string, number> }`.

### Ingestion extractor behavior

Different prompt from session extraction — doc content is structured narrative, not conversation. Prompt:
"This is project documentation. Extract stable facts, decisions, and conventions as knowledge entries. Prefer 'fact' and 'decision' types. Avoid duplicating existing memories (listed below)."

## Error Handling

- **Glob doesn't match anything** — Docs tab: empty state with link to Project Settings. Settings: "Matches 0 files" indicator.
- **File read fails** (file deleted between list and read) — inline error in viewer, refetch file list.
- **Auto-inject exceeds budget** — truncate with footer note; log warning.
- **Extraction fails** — keep session running, log, toast on manual button failure.
- **Path escape attempt** (`?path=../../../etc/passwd`) — backend resolves and verifies path is inside `projectPath`; returns 400 if not.
- **Note save conflicts** — last-write-wins, no locking (single-user tool).

## Testing

- **Unit**
  - Docs scanner: glob matching, exclusion lists, path validation rejects escapes
  - Extractor dedup: given existing entries, doesn't re-create equivalents
  - Notes CRUD: happy paths + not-found cases
- **Integration**
  - Project creation → ingestion prompt → ingest → knowledge entries created
  - Manual Remember round-trip
  - Auto-injection: verify doc content appears in system prompt of next session
  - Pause triggers extraction
- **Manual smoke**
  - Create project with `~/Code/CCHQ`
  - Verify README, AGENTS.md, CLAUDE.md, docs/superpowers/specs/* appear in Docs tab
  - Click "Scan & Ingest", verify entries appear in `/knowledge`
  - Create a note, refresh, verify it persists

## Tech Stack Additions

| Addition | Why |
|----------|-----|
| `fast-glob` (if not already present) | Doc pattern matching |

No other dependencies added. `react-markdown` + `remark-gfm` already installed.

## Out of Scope (Future)

- Full markdown editor with inline preview (textarea + preview toggle is enough for Phase 1)
- Editing repo `.md` files from CCHQ (read-only in Phase 1)
- Notes search
- Knowledge entry editing (already exists via the knowledge API)
- Syncing notes to a file in the repo
