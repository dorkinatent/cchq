# Session Diff Viewer — Design Spec

**Date:** 2026-04-13
**Branch:** `feature/session-diff-viewer`
**Feature:** Git diff viewer for CCHQ sessions — see what Claude changed, live and after the fact.

---

## Problem

When a session completes, you see a summary (duration, tokens, cost, files touched, tool calls) but not *what actually changed* in the code. To review the diff, you leave CCHQ and run `git diff` in a terminal. That's a context switch that breaks the review-then-ship flow.

Conductor (the closest competitor) has a dedicated diff viewer + merge flow as its core UX. CCHQ's knowledge system and session continuity are its moat, but the absence of a diff viewer is the biggest functional gap.

## Users

Developers who leave CCHQ open all day, running 4–6+ sessions. After a session ends (or while one is running), they want to glance at what's changed without switching to a terminal or VS Code.

## Solution overview

Two complementary surfaces sharing one diff API:

1. **Changes tab** in the context panel (right sidebar) — live file list during active sessions, with inline accordion diffs per file and an "Expand ↗" to the full-width overlay.
2. **"Review changes" button** in the session summary card — opens the full-width diff overlay for completed sessions, using saved SHA snapshots.

Both render **unified diffs** (v1) — no side-by-side, no syntax highlighting.

---

## Data layer

### DB migration

Add two nullable columns to the `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN start_sha text;
ALTER TABLE sessions ADD COLUMN end_sha text;
```

Drizzle schema addition in `src/lib/db/schema.ts`:

```typescript
startSha: text("start_sha"),
endSha: text("end_sha"),
```

Both are nullable because:
- Existing sessions predate the feature.
- Non-git projects won't have them.
- Sessions created without an initial prompt haven't started yet (cold-start).

### SHA capture

In `src/lib/sessions/manager.ts`:

**`startSession()`** — after resolving the project path, before kicking off the SDK query:
```
git rev-parse HEAD
```
Store the 40-char SHA as `startSha` on the session row. If the command fails (not a git repo, no commits), store `null`.

**`completeSession()` and `pauseSession()`** — before cleaning up:
```
git rev-parse HEAD
```
Store as `endSha`. Paused sessions also get a snapshot so you can see changes before pausing.

**Implementation:** `child_process.execFile("git", ["rev-parse", "HEAD"], { cwd: projectPath })`. No new npm dependencies.

### Git helper module

New file: `src/lib/git/diff-parser.ts`

Responsibilities:
1. Run `git diff` commands via `execFile` with the project path as `cwd`.
2. Parse unified diff output into structured JSON.
3. Handle edge cases: binary files, renames, empty diffs, non-git repos.

~80–120 lines. Pure string parsing — split on `diff --git`, `@@`, `+`/`-` markers.

---

## API

### `GET /api/sessions/[id]/diff`

Single endpoint, two modes:

| Query params | Behavior |
|---|---|
| (none) | Live working-tree diff: `git diff` |
| `?mode=saved` | Historical diff: `git diff startSha...endSha` |
| `?file=<relative-path>` | Filter to a single file (works with either mode) |

**Response shape:**

```typescript
type DiffResponse = {
  mode: "live" | "saved";
  startSha: string | null;
  endSha: string | null;
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  files: Array<{
    path: string;                    // relative to project root
    status: "M" | "A" | "D" | "R";  // modified, added, deleted, renamed
    insertions: number;
    deletions: number;
    hunks: Array<{
      header: string;                // @@ -10,7 +10,9 @@
      lines: Array<{
        type: "context" | "add" | "delete";
        content: string;
        oldLineNo?: number;
        newLineNo?: number;
      }>;
    }>;
  }>;
};
```

**Error cases:**
- Not a git repo → `200 { error: "not-git", message: "This project is not a git repository" }`
- No startSha/endSha for `mode=saved` → falls back to live diff
- Git command fails → `500 { error: "git-error", message: "..." }`
- Session not found → `404`

---

## UI components

### ChangesTab

**File:** `src/components/docs/changes-tab.tsx`
**Location:** 4th tab in `SessionContextPanel`, alongside Context / Docs / Notes.

**Behavior:**
- Fetches `GET /api/sessions/{id}/diff` (live mode) on mount.
- Polls every 10s while the session is active. Stops polling when completed/paused.
- Renders a file list: each row shows a status badge (`M`/`A`/`D`/`R` in monospace, color-coded), relative path, and `+N −N` counts.
- Clicking a file row → fetches that file's diff (`?file=path`) and expands an inline `DiffBlock` below the row (accordion, one file at a time in the narrow panel).
- "Expand ↗" button at top → triggers `onExpandToMain({ kind: "diff" })`.

**Empty states:**
- Active session, no changes: "No changes yet"
- Not a git repo: "Not a git repository"

**Tab label:** "Changes"

### DiffOverlay

**File:** `src/components/chat/main-overlay.tsx` (add alongside existing `DocOverlay` / `NoteOverlay`)
**Triggered by:** "Expand ↗" from ChangesTab OR "Review changes ↗" from SessionSummary.

**Layout:**
- `BackBar` pattern (same as DocOverlay): `← Back` + breadcrumb showing `Changes · abc1234..def5678` (7-char short SHAs).
- Two-column layout inside `max-w-[1100px] mx-auto`:
  - Left: scrollable file list (~220px), same file rows as the tab but with full path room.
  - Right: unified diff for the selected file, rendered via `DiffBlock`.
- Hides the context panel (same `!mainOverlay` pattern established for DocOverlay).

**Modes:**
- Opened from ChangesTab → live mode (no SHAs in breadcrumb, shows "live" badge).
- Opened from SessionSummary → saved mode (shows short SHA range in breadcrumb).

### DiffBlock

**File:** `src/components/chat/diff-block.tsx`
**Shared between:** ChangesTab inline accordion + DiffOverlay right column.

**Rendering:**
- Takes a single file's `hunks` array.
- Each hunk: gray `@@` header line, then diff lines.
- Line coloring (all via CSS variables, theme-aware):
  - Context lines: `--text-secondary` on transparent
  - Additions: `--active-text` on `--active-bg`
  - Deletions: `--errored-text` on `--errored-bg`
  - Hunk headers: `--text-muted` on transparent
- Line numbers: two gutter columns (old + new), `tabular-nums`, `--text-muted`.
- Font: Recursive Mono (`font-variation-settings: "CASL" 0, "MONO" 1`), 12px.
- Horizontally scrollable if lines exceed container width.
- No syntax highlighting (v1).
- Binary files: "Binary file, not shown" placeholder.

### SessionSummary modification

**File:** `src/components/chat/session-summary.tsx`

Add a "Review changes" row between the existing Files row and the footer, only when the session has a `startSha`:

```
  FILES    4 touched · 8 read · 4 edited                    show
  CHANGES  4 files · +42 −18                    Review changes ↗
```

The "Review changes ↗" button opens the DiffOverlay with `mode=saved`.

For legacy sessions without SHAs: the row doesn't appear. Graceful degradation.

### MainOverlay type extension

Extend the `MainOverlay` union in `session-context-panel.tsx`:

```typescript
export type MainOverlay =
  | null
  | { kind: "doc"; relativePath: string }
  | { kind: "note"; id: string }
  | { kind: "diff"; mode: "live" | "saved" };
```

- ChangesTab "Expand ↗" dispatches `{ kind: "diff", mode: "live" }`.
- SessionSummary "Review changes ↗" dispatches `{ kind: "diff", mode: "saved" }`.
- The DiffOverlay reads `overlay.mode` to decide which query param to pass to the API.

---

## File status color mapping

| Status | Badge | Badge color | Background |
|---|---|---|---|
| Modified | `M` | `--active-text` (green) | — |
| Added | `A` | `--active-text` (green) | — |
| Deleted | `D` | `--errored-text` (red) | — |
| Renamed | `R` | `--accent` (amber) | — |

---

## Polling behavior (ChangesTab)

- **Active session:** Poll every 10s. Each poll replaces the file list. If a file's accordion is open, the inline diff refreshes too.
- **Completed/paused session:** Fetch once on mount, no polling. Use `mode=saved` if SHAs exist, else live.
- **Tab not visible:** Don't poll (check if "changes" tab is active before scheduling).

---

## Out of scope (v1)

| Feature | Reason |
|---|---|
| Syntax highlighting | Needs shiki/prism, significant bundle + complexity. v2. |
| Side-by-side view | Unified only. Toggle deferred. |
| Commit / revert actions | This is a viewer, not a git client. |
| Cross-session diffs | Each session's diff is isolated to its own SHA range. |
| Non-git alternative | Graceful degradation only — no tool-use reconstruction. |
| Per-pause snapshots | `startSha` captures once at initial start. Full-span diff even across pause/resume cycles. |

---

## Implementation order

1. **Migration + SHA capture** — schema change, `startSession`/`completeSession`/`pauseSession` git calls
2. **Git diff parser** — `src/lib/git/diff-parser.ts`
3. **API endpoint** — `GET /api/sessions/[id]/diff`
4. **DiffBlock component** — shared renderer
5. **ChangesTab** — 4th tab in context panel
6. **DiffOverlay** — full-width reader
7. **SessionSummary hook** — "Review changes" row
8. **Polish** — empty states, error handling, theme testing across Fossil/Midnight/Arctic/Terminal
