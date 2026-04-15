# Session Diff Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a git diff viewer to CCHQ so users can see what files Claude changed during a session — live while it's running, and historically after it completes.

**Architecture:** Capture git HEAD SHA at session start/end, shell out to `git diff` on demand via a new API endpoint, parse unified diff output into structured JSON, render with a shared `DiffBlock` component in two surfaces (Changes tab in the right panel + Review overlay from the session summary).

**Tech Stack:** Node `child_process.execFile` for git, Drizzle schema migration, React components with existing theme tokens. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-04-13-session-diff-viewer-design.md`

---

## File map

| Action | Path | Purpose |
|---|---|---|
| Modify | `src/lib/db/schema.ts` | Add `startSha`, `endSha` columns to sessions |
| Create | `drizzle/0001_add_session_shas.sql` | Migration SQL |
| Create | `src/lib/git/diff-parser.ts` | Run `git diff`, parse output to structured JSON |
| Create | `src/lib/git/sha.ts` | Capture HEAD SHA from a project path |
| Modify | `src/lib/sessions/manager.ts` | Call SHA capture in startSession/completeSession/pauseSession |
| Create | `src/app/api/sessions/[id]/diff/route.ts` | Diff API endpoint |
| Create | `src/components/chat/diff-block.tsx` | Shared unified diff renderer |
| Create | `src/components/docs/changes-tab.tsx` | Changes tab for context panel |
| Modify | `src/components/chat/session-context-panel.tsx` | Add "changes" tab, extend MainOverlay type |
| Modify | `src/components/chat/main-overlay.tsx` | Add DiffOverlay |
| Modify | `src/components/chat/session-summary.tsx` | Add "Review changes" row |
| Modify | `src/app/sessions/[id]/page.tsx` | Wire DiffOverlay into mainOverlay switch + pass sessionId/startSha to summary |

---

### Task 1: Schema migration — add SHA columns

**Files:**
- Modify: `src/lib/db/schema.ts:60-74`
- Create: `drizzle/0001_add_session_shas.sql`

- [ ] **Step 1: Add columns to Drizzle schema**

In `src/lib/db/schema.ts`, add two fields to the `sessions` table, after `usage` and before `createdAt`:

```typescript
startSha: text("start_sha"),
endSha: text("end_sha"),
```

- [ ] **Step 2: Create the migration SQL**

Create `drizzle/0001_add_session_shas.sql`:

```sql
ALTER TABLE sessions ADD COLUMN start_sha text;
ALTER TABLE sessions ADD COLUMN end_sha text;
```

- [ ] **Step 3: Run the migration**

Run: `npx drizzle-kit push`

Expected: Migration applied, no errors. Existing sessions get `null` for both columns.

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors (the fields are nullable so all existing code still compiles).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0001_add_session_shas.sql
git commit -m "feat(db): add startSha + endSha columns to sessions table"
```

---

### Task 2: Git SHA helper

**Files:**
- Create: `src/lib/git/sha.ts`

- [ ] **Step 1: Create the SHA capture module**

Create `src/lib/git/sha.ts`:

```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Capture the current HEAD commit SHA for a git repo.
 * Returns null if the path is not a git repo, has no commits,
 * or git is not installed.
 */
export async function captureHeadSha(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: projectPath,
      timeout: 5000,
    });
    const sha = stdout.trim();
    // Sanity check: should be a 40-char hex string.
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    return null;
  } catch {
    // Not a git repo, no commits, git not installed — all fine.
    return null;
  }
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/git/sha.ts
git commit -m "feat(git): add captureHeadSha helper"
```

---

### Task 3: Wire SHA capture into session lifecycle

**Files:**
- Modify: `src/lib/sessions/manager.ts:670-700` (startSession)
- Modify: `src/lib/sessions/manager.ts:879-902` (completeSession)
- Modify: `src/lib/sessions/manager.ts:942-971` (pauseSession)

- [ ] **Step 1: Add import at top of manager.ts**

Add near the other imports at the top of `src/lib/sessions/manager.ts`:

```typescript
import { captureHeadSha } from "@/lib/git/sha";
```

- [ ] **Step 2: Capture startSha in startSession**

In `startSession()`, after the session DB lookup (`const session = await db.query.sessions.findFirst(...)`) and before the `if (session.status === "errored")` block, add:

```typescript
  // Capture git HEAD so we can diff later.
  const startSha = await captureHeadSha(projectPath);
  if (startSha && !session.startSha) {
    await db
      .update(schema.sessions)
      .set({ startSha })
      .where(eq(schema.sessions.id, sessionId));
  }
```

The `!session.startSha` guard ensures we don't overwrite the SHA on resume (sendMessage cold-start calls startSession too).

- [ ] **Step 3: Capture endSha in completeSession**

In `completeSession()`, before the final `db.update` that sets `status: "completed"`, look up the project path and capture the SHA:

```typescript
  // Capture end SHA for historical diff.
  const sessionRow = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
    columns: { projectId: true },
    with: { project: { columns: { path: true } } },
  });
```

Wait — sessions don't have a `project` relation defined in Drizzle. Use a join or two-step lookup. Simpler: look up the project separately.

```typescript
  const sessionRow = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
    columns: { projectId: true },
  });
  if (sessionRow) {
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, sessionRow.projectId),
      columns: { path: true },
    });
    if (project) {
      const endSha = await captureHeadSha(project.path);
      if (endSha) {
        await db
          .update(schema.sessions)
          .set({ endSha })
          .where(eq(schema.sessions.id, sessionId));
      }
    }
  }
```

Place this code right before the existing `await db.update(...).set({ status: "completed" ...})` call.

- [ ] **Step 4: Capture endSha in pauseSession**

Same pattern as completeSession. Add the same project-lookup + captureHeadSha block right before the existing `await db.update(...).set({ status: "paused" ...})` call in `pauseSession()`.

Copy the exact same block from Step 3 (lookup sessionRow → lookup project → captureHeadSha → update endSha).

- [ ] **Step 5: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors. The `startSha` and `endSha` fields exist on the schema from Task 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sessions/manager.ts
git commit -m "feat(sessions): capture git HEAD SHA at session start/end/pause"
```

---

### Task 4: Git diff parser

**Files:**
- Create: `src/lib/git/diff-parser.ts`

- [ ] **Step 1: Create the diff parser module**

Create `src/lib/git/diff-parser.ts`:

```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type DiffLine = {
  type: "context" | "add" | "delete";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type DiffFile = {
  path: string;
  status: "M" | "A" | "D" | "R";
  insertions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
};

export type DiffResult = {
  files: DiffFile[];
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
};

/**
 * Run git diff and return structured output.
 *
 * @param cwd - The project directory (must be a git repo).
 * @param startSha - If provided with endSha, diffs between two commits.
 * @param endSha - End commit SHA.
 * @param filePath - Optional single-file filter (relative to cwd).
 */
export async function getGitDiff(
  cwd: string,
  startSha?: string | null,
  endSha?: string | null,
  filePath?: string | null
): Promise<DiffResult> {
  const args = ["diff", "--unified=3", "--no-color"];

  if (startSha && endSha) {
    args.push(`${startSha}...${endSha}`);
  }

  if (filePath) {
    args.push("--", filePath);
  }

  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024, // 10MB — large diffs
  });

  return parseDiff(stdout);
}

/**
 * Check whether a directory is a git repository.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse unified diff output into structured data.
 */
function parseDiff(raw: string): DiffResult {
  const files: DiffFile[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  if (!raw.trim()) {
    return { files, summary: { filesChanged: 0, insertions: 0, deletions: 0 } };
  }

  // Split into per-file sections.
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");

    // Extract file path from the first line: "a/path b/path"
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    const path = headerMatch?.[2] ?? headerMatch?.[1] ?? "unknown";

    // Detect status from the diff header lines.
    let status: DiffFile["status"] = "M";
    let binary = false;
    for (const line of lines.slice(0, 6)) {
      if (line.startsWith("new file")) status = "A";
      else if (line.startsWith("deleted file")) status = "D";
      else if (line.startsWith("rename from")) status = "R";
      else if (line.startsWith("Binary files")) binary = true;
    }

    // Parse hunks.
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;
    let fileInsertions = 0;
    let fileDeletions = 0;

    for (const line of lines) {
      const hunkHeaderMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
      if (hunkHeaderMatch) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        oldLine = parseInt(hunkHeaderMatch[1], 10);
        newLine = parseInt(hunkHeaderMatch[2], 10);
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          content: line.slice(1),
          newLineNo: newLine,
        });
        newLine++;
        fileInsertions++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "delete",
          content: line.slice(1),
          oldLineNo: oldLine,
        });
        oldLine++;
        fileDeletions++;
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({
          type: "context",
          content: line.slice(1),
          oldLineNo: oldLine,
          newLineNo: newLine,
        });
        oldLine++;
        newLine++;
      }
      // Skip "\ No newline at end of file" and other noise.
    }

    totalInsertions += fileInsertions;
    totalDeletions += fileDeletions;

    files.push({
      path,
      status,
      insertions: fileInsertions,
      deletions: fileDeletions,
      binary,
      hunks,
    });
  }

  return {
    files,
    summary: {
      filesChanged: files.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
    },
  };
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/git/diff-parser.ts
git commit -m "feat(git): add diff parser — runs git diff, parses to structured JSON"
```

---

### Task 5: Diff API endpoint

**Files:**
- Create: `src/app/api/sessions/[id]/diff/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `src/app/api/sessions/[id]/diff/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGitDiff, isGitRepo } from "@/lib/git/diff-parser";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mode = req.nextUrl.searchParams.get("mode"); // "saved" or null (live)
  const file = req.nextUrl.searchParams.get("file"); // optional file filter

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, session.projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Check if this is a git repo.
  const gitRepo = await isGitRepo(project.path);
  if (!gitRepo) {
    return NextResponse.json({
      error: "not-git",
      message: "This project is not a git repository",
    });
  }

  try {
    const useSaved = mode === "saved" && session.startSha && session.endSha;

    const result = await getGitDiff(
      project.path,
      useSaved ? session.startSha : null,
      useSaved ? session.endSha : null,
      file || null
    );

    return NextResponse.json({
      mode: useSaved ? "saved" : "live",
      startSha: session.startSha ?? null,
      endSha: session.endSha ?? null,
      summary: result.summary,
      files: result.files,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "git-error", message: err?.message ?? "Git diff failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors. `session.startSha` and `session.endSha` should resolve from the schema.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/\[id\]/diff/route.ts
git commit -m "feat(api): add GET /api/sessions/[id]/diff endpoint"
```

---

### Task 6: DiffBlock component — shared unified diff renderer

**Files:**
- Create: `src/components/chat/diff-block.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/chat/diff-block.tsx`:

```typescript
"use client";

import type { DiffHunk } from "@/lib/git/diff-parser";

export function DiffBlock({ hunks }: { hunks: DiffHunk[] }) {
  if (hunks.length === 0) {
    return (
      <div className="text-[12px] text-[var(--text-muted)] py-3 px-4 font-mono">
        No diff content
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto text-[12px] leading-[1.6] font-mono"
      style={{ fontVariationSettings: '"CASL" 0, "MONO" 1, "slnt" 0' }}
    >
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          {/* Hunk header */}
          <div className="px-4 py-1 text-[var(--text-muted)] bg-[color-mix(in_oklch,var(--surface-raised)_40%,transparent)] select-none">
            {hunk.header}
          </div>
          {/* Lines */}
          {hunk.lines.map((line, lineIdx) => {
            const bgClass =
              line.type === "add"
                ? "bg-[var(--active-bg)]"
                : line.type === "delete"
                  ? "bg-[var(--errored-bg)]"
                  : "";
            const textClass =
              line.type === "add"
                ? "text-[var(--active-text)]"
                : line.type === "delete"
                  ? "text-[var(--errored-text)]"
                  : "text-[var(--text-secondary)]";
            const prefix =
              line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";

            return (
              <div key={lineIdx} className={`flex ${bgClass}`}>
                {/* Old line number */}
                <span className="w-10 shrink-0 text-right pr-1 text-[var(--text-muted)] select-none tabular-nums opacity-60">
                  {line.oldLineNo ?? ""}
                </span>
                {/* New line number */}
                <span className="w-10 shrink-0 text-right pr-2 text-[var(--text-muted)] select-none tabular-nums opacity-60">
                  {line.newLineNo ?? ""}
                </span>
                {/* Prefix */}
                <span className={`w-4 shrink-0 text-center select-none ${textClass}`}>
                  {prefix}
                </span>
                {/* Content */}
                <span className={`flex-1 pr-4 whitespace-pre ${textClass}`}>
                  {line.content}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BinaryFilePlaceholder() {
  return (
    <div className="text-[12px] text-[var(--text-muted)] py-6 px-4 text-center font-mono">
      Binary file — not shown
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors. The `DiffHunk` type is imported from `diff-parser.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/diff-block.tsx
git commit -m "feat(ui): add DiffBlock — shared unified diff renderer"
```

---

### Task 7: ChangesTab — 4th tab in the context panel

**Files:**
- Create: `src/components/docs/changes-tab.tsx`
- Modify: `src/components/chat/session-context-panel.tsx` (add tab + extend types)

- [ ] **Step 1: Create ChangesTab component**

Create `src/components/docs/changes-tab.tsx`:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import { DiffBlock, BinaryFilePlaceholder } from "@/components/chat/diff-block";
import type { MainOverlay } from "@/components/chat/session-context-panel";

type FileSummary = {
  path: string;
  status: "M" | "A" | "D" | "R";
  insertions: number;
  deletions: number;
  binary: boolean;
  hunks: any[];
};

type DiffData = {
  mode: "live" | "saved";
  startSha: string | null;
  endSha: string | null;
  summary: { filesChanged: number; insertions: number; deletions: number };
  files: FileSummary[];
  error?: string;
};

const STATUS_COLOR: Record<string, string> = {
  M: "text-[var(--active-text)]",
  A: "text-[var(--active-text)]",
  D: "text-[var(--errored-text)]",
  R: "text-[var(--accent)]",
};

export function ChangesTab({
  sessionId,
  sessionStatus,
  startSha,
  endSha,
  onExpandToMain,
}: {
  sessionId: string;
  sessionStatus: string;
  startSha?: string | null;
  endSha?: string | null;
  onExpandToMain?: (payload: MainOverlay) => void;
}) {
  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileSummary | null>(null);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = sessionStatus === "active";
  const useSaved = !isActive && startSha && endSha;

  // Fetch diff summary (file list only, no per-file hunks needed for the list).
  useEffect(() => {
    let cancelled = false;

    async function fetchDiff() {
      try {
        const modeParam = useSaved ? "?mode=saved" : "";
        const res = await fetch(`/api/sessions/${sessionId}/diff${modeParam}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDiff();

    // Poll every 10s while active.
    if (isActive) {
      intervalRef.current = setInterval(fetchDiff, 10000);
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, isActive, useSaved]);

  // Fetch single-file diff when accordion opens.
  useEffect(() => {
    if (!expandedFile) {
      setFileDiff(null);
      return;
    }

    let cancelled = false;
    setFileDiffLoading(true);

    const modeParam = useSaved ? "&mode=saved" : "";
    fetch(
      `/api/sessions/${sessionId}/diff?file=${encodeURIComponent(expandedFile)}${modeParam}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.files?.[0]) {
          setFileDiff(json.files[0]);
        }
        setFileDiffLoading(false);
      })
      .catch(() => {
        if (!cancelled) setFileDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expandedFile, sessionId, useSaved]);

  if (loading) {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Loading changes…</div>;
  }

  if (data?.error === "not-git") {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Not a git repository</div>;
  }

  if (!data || data.files.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--text-muted)]">
        {isActive ? "No changes yet" : "No changes recorded"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
          <span className="text-[var(--active-text)]">+{data.summary.insertions}</span>
          {" "}
          <span className="text-[var(--errored-text)]">−{data.summary.deletions}</span>
          <span className="text-[var(--text-muted)] ml-2">
            {data.summary.filesChanged} file{data.summary.filesChanged !== 1 ? "s" : ""}
          </span>
        </div>
        {onExpandToMain && (
          <button
            onClick={() => {
              const mode = useSaved ? "saved" : "live";
              onExpandToMain({ kind: "diff", mode } as MainOverlay);
            }}
            className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            Expand ↗
          </button>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto rail-scroll">
        {data.files.map((f) => (
          <div key={f.path}>
            <button
              onClick={() =>
                setExpandedFile((prev) => (prev === f.path ? null : f.path))
              }
              className={`w-full text-left px-4 py-1.5 text-[12px] font-mono flex items-center gap-2 hover:bg-[var(--surface-raised)] ${
                expandedFile === f.path
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              <span className={`font-semibold w-3 shrink-0 ${STATUS_COLOR[f.status] ?? "text-[var(--text-muted)]"}`}>
                {f.status}
              </span>
              <span className="truncate flex-1">{f.path}</span>
              <span className="text-[10px] tabular-nums text-[var(--text-muted)] shrink-0">
                <span className="text-[var(--active-text)]">+{f.insertions}</span>
                {" "}
                <span className="text-[var(--errored-text)]">−{f.deletions}</span>
              </span>
            </button>
            {/* Inline diff accordion */}
            {expandedFile === f.path && (
              <div className="border-t border-b border-[var(--border)] bg-[var(--bg)]">
                {fileDiffLoading ? (
                  <div className="py-3 px-4 text-[11px] text-[var(--text-muted)]">Loading diff…</div>
                ) : fileDiff?.binary ? (
                  <BinaryFilePlaceholder />
                ) : fileDiff ? (
                  <DiffBlock hunks={fileDiff.hunks} />
                ) : (
                  <div className="py-3 px-4 text-[11px] text-[var(--text-muted)]">No diff available</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "changes" tab to SessionContextPanel**

In `src/components/chat/session-context-panel.tsx`:

1. Update the `TabKey` type:
```typescript
type TabKey = "context" | "docs" | "notes" | "changes";
```

2. Update the `MainOverlay` type:
```typescript
export type MainOverlay =
  | null
  | { kind: "doc"; relativePath: string }
  | { kind: "note"; id: string }
  | { kind: "diff"; mode: "live" | "saved" };
```

3. Add `sessionId` and `sessionStatus` to the component's props usage (they should already be passed — `sessionId` is in the type, and `sessionStatus` may need adding).

4. Add the tab entry to the `tabs` array:
```typescript
const tabs = [
  { key: "context", label: "Context" },
  { key: "docs", label: "Docs" },
  { key: "notes", label: "Notes" },
  { key: "changes", label: "Changes" },
] as const;
```

5. Add the tab refs entry:
```typescript
const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
  context: null,
  docs: null,
  notes: null,
  changes: null,
});
```

6. Add the tab panel render (after the notes panel):
```tsx
{tab === "changes" && (
  <div
    role="tabpanel"
    id="panel-changes"
    aria-labelledby="tab-changes"
    className="flex-1 overflow-hidden"
  >
    <ChangesTab
      sessionId={sessionId}
      sessionStatus={sessionStatus}
      startSha={startSha}
      endSha={endSha}
      onExpandToMain={onExpandToMain}
    />
  </div>
)}
```

This requires `sessionId`, `sessionStatus`, `startSha`, and `endSha` to be accessible inside the component. The `sessionId` is already in the props type. Add `sessionStatus`, `startSha`, `endSha` to the props:

```typescript
export function SessionContextPanel({
  sessionId,    // already exists
  sessionStatus, // NEW
  startSha,      // NEW
  endSha,        // NEW
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
  onExpandToMain,
}: {
  sessionId: string;
  sessionStatus: string;  // NEW
  startSha?: string | null; // NEW
  endSha?: string | null;   // NEW
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  onExpandToMain?: (payload: MainOverlay) => void;
}) {
```

Import `ChangesTab` at the top of the file:
```typescript
import { ChangesTab } from "@/components/docs/changes-tab";
```

- [ ] **Step 3: Pass new props from the session page**

In `src/app/sessions/[id]/page.tsx`, where `SessionContextPanel` is rendered, add the new props:

```tsx
<SessionContextPanel
  sessionId={id}
  sessionStatus={session.status}   // NEW
  startSha={session.startSha}       // NEW
  endSha={session.endSha}           // NEW
  projectId={session.projectId}
  projectPath={session.projectPath || ""}
  model={session.model}
  effort={session.effort}
  messageCount={messages.length}
  usage={session.usage}
  onExpandToMain={setMainOverlay}
/>
```

Also add `startSha` and `endSha` to the `SessionDetail` type at the top of page.tsx:

```typescript
type SessionDetail = {
  // ... existing fields ...
  startSha?: string | null;
  endSha?: string | null;
};
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/docs/changes-tab.tsx src/components/chat/session-context-panel.tsx src/app/sessions/\[id\]/page.tsx
git commit -m "feat(ui): add Changes tab to context panel with live polling"
```

---

### Task 8: DiffOverlay — full-width diff reader

**Files:**
- Modify: `src/components/chat/main-overlay.tsx`

- [ ] **Step 1: Add DiffOverlay component**

In `src/components/chat/main-overlay.tsx`, add a new export after the existing `NoteOverlay`:

```typescript
export function DiffOverlay({
  sessionId,
  mode,
  onClose,
}: {
  sessionId: string;
  mode: "live" | "saved";
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const modeParam = mode === "saved" ? "?mode=saved" : "";
    fetch(`/api/sessions/${sessionId}/diff${modeParam}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
        // Auto-select first file.
        if (json.files?.length > 0) {
          setSelectedFile(json.files[0].path);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, mode]);

  const selectedFileData = data?.files?.find((f: any) => f.path === selectedFile);

  const shortStart = data?.startSha?.slice(0, 7);
  const shortEnd = data?.endSha?.slice(0, 7);
  const crumbDetail =
    mode === "saved" && shortStart && shortEnd
      ? `${shortStart}..${shortEnd}`
      : "live";

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">
      <BackBar
        crumb={
          <>
            <span className="text-[var(--text-muted)]">Changes · </span>
            <span className="text-[var(--text-primary)]">{crumbDetail}</span>
            {data?.summary && (
              <span className="ml-3 text-[var(--text-muted)]">
                {data.summary.filesChanged} file{data.summary.filesChanged !== 1 ? "s" : ""}
                {" · "}
                <span className="text-[var(--active-text)]">+{data.summary.insertions}</span>
                {" "}
                <span className="text-[var(--errored-text)]">−{data.summary.deletions}</span>
              </span>
            )}
          </>
        }
        onClose={onClose}
      />
      <div className="flex-1 flex overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
            Loading diff…
          </div>
        ) : !data || data.files?.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
            No changes
          </div>
        ) : (
          <>
            {/* File list sidebar */}
            <div className="w-[220px] shrink-0 border-r border-[var(--border)] overflow-y-auto rail-scroll">
              {data.files.map((f: any) => (
                <button
                  key={f.path}
                  onClick={() => setSelectedFile(f.path)}
                  className={`w-full text-left px-3 py-1.5 text-[12px] font-mono flex items-center gap-2 ${
                    selectedFile === f.path
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  <span
                    className={`font-semibold w-3 shrink-0 ${
                      f.status === "D"
                        ? "text-[var(--errored-text)]"
                        : f.status === "R"
                          ? "text-[var(--accent)]"
                          : "text-[var(--active-text)]"
                    }`}
                  >
                    {f.status}
                  </span>
                  <span className="truncate flex-1">{f.path}</span>
                </button>
              ))}
            </div>
            {/* Diff content */}
            <div className="flex-1 overflow-y-auto rail-scroll">
              {selectedFileData ? (
                selectedFileData.binary ? (
                  <BinaryFilePlaceholder />
                ) : (
                  <DiffBlock hunks={selectedFileData.hunks} />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
                  Select a file
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Add the imports at the top of main-overlay.tsx:
```typescript
import { DiffBlock, BinaryFilePlaceholder } from "@/components/chat/diff-block";
```

- [ ] **Step 2: Wire DiffOverlay into SessionMainOverlay**

In the same file, update the `SessionMainOverlay` component to handle the `"diff"` kind:

```typescript
export function SessionMainOverlay({
  overlay,
  projectId,
  sessionId,   // ADD this prop
  onClose,
}: {
  overlay: MainOverlay;
  projectId: string;
  sessionId: string;  // ADD this
  onClose: () => void;
}) {
  // ... existing useEffect for Escape ...

  if (!overlay) return null;
  if (overlay.kind === "doc") {
    return <DocOverlay projectId={projectId} relativePath={overlay.relativePath} onClose={onClose} />;
  }
  if (overlay.kind === "diff") {
    return <DiffOverlay sessionId={sessionId} mode={overlay.mode} onClose={onClose} />;
  }
  return <NoteOverlay projectId={projectId} noteId={overlay.id} onClose={onClose} />;
}
```

- [ ] **Step 3: Pass sessionId to SessionMainOverlay in page.tsx**

In `src/app/sessions/[id]/page.tsx`, where `SessionMainOverlay` is rendered, add the `sessionId` prop:

```tsx
<SessionMainOverlay
  overlay={mainOverlay}
  projectId={session.projectId}
  sessionId={id}               // ADD
  onClose={() => setMainOverlay(null)}
/>
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/main-overlay.tsx src/app/sessions/\[id\]/page.tsx
git commit -m "feat(ui): add DiffOverlay — full-width diff reader with file sidebar"
```

---

### Task 9: SessionSummary — "Review changes" row

**Files:**
- Modify: `src/components/chat/session-summary.tsx`

- [ ] **Step 1: Add props for SHA and diff trigger**

The `SessionSummary` component needs `startSha` and a callback to open the diff overlay. Add to the props:

```typescript
export function SessionSummary({
  sessionId,
  model,
  usage,
  createdAt,
  endedAt,
  startSha,                    // NEW
  onReviewChanges,             // NEW
}: {
  sessionId: string;
  model: string;
  usage: Usage;
  createdAt: string;
  endedAt: string;
  startSha?: string | null;     // NEW
  onReviewChanges?: () => void; // NEW
}) {
```

- [ ] **Step 2: Add the "Review changes" row**

Inside the component's JSX, add a new row between the Files row and the footer. This row only renders when `startSha` exists (so it won't show for legacy sessions):

```tsx
{/* Review changes row — only for sessions with git tracking */}
{startSha && (
  <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="eyebrow pt-[3px]">Changes</div>
      <div className="text-[13px] text-[var(--text-primary)]">
        {stats ? (
          <>
            <span className="tabular-nums font-semibold">{stats.filesTouched.length}</span>
            <span className="text-[var(--text-secondary)]">
              {" "}file{stats.filesTouched.length !== 1 ? "s" : ""}
            </span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">…</span>
        )}
      </div>
    </div>
    {onReviewChanges && (
      <button
        onClick={onReviewChanges}
        className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] border border-[var(--accent)]/30 rounded px-2 py-0.5"
      >
        Review changes ↗
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Pass the new props from page.tsx**

In `src/app/sessions/[id]/page.tsx`, update the `SessionSummary` render:

```tsx
<SessionSummary
  sessionId={id}
  model={session.model}
  usage={session.usage}
  createdAt={session.createdAt || session.updatedAt || new Date().toISOString()}
  endedAt={session.updatedAt || new Date().toISOString()}
  startSha={session.startSha}
  onReviewChanges={() => setMainOverlay({ kind: "diff", mode: "saved" })}
/>
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/session-summary.tsx src/app/sessions/\[id\]/page.tsx
git commit -m "feat(ui): add 'Review changes' button to session summary"
```

---

### Task 10: End-to-end test + polish

- [ ] **Step 1: Manual test — live diff**

1. Start a new session on a git-tracked project.
2. Send a message that causes file edits.
3. Click the "Changes" tab in the context panel.
4. Verify: file list appears with status badges and +/- counts.
5. Click a file → inline diff expands.
6. Click "Expand ↗" → full-width overlay opens with file sidebar + diff.

- [ ] **Step 2: Manual test — historical diff**

1. End the session (or wait for it to complete).
2. Scroll to the session summary card.
3. Verify: "Review changes ↗" button appears.
4. Click it → overlay opens with saved SHA range in the breadcrumb.

- [ ] **Step 3: Theme test**

Switch between Fossil, Midnight, Arctic, and Terminal themes. Verify:
- Addition lines use `--active-bg` / `--active-text`
- Deletion lines use `--errored-bg` / `--errored-text`
- Line numbers are readable in all themes
- File list badges are colored correctly

- [ ] **Step 4: Edge case test**

- Test on a non-git project → "Not a git repository" empty state
- Test a session with no changes → "No changes yet" empty state
- Test a completed session created before the migration → no "Review changes" row (graceful degradation)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: polish diff viewer — edge cases, theme consistency"
```
