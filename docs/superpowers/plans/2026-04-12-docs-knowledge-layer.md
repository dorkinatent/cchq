# Docs Panel & Knowledge Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Docs tab (repo markdown files) and Notes tab (CCHQ-managed markdown) to the session sidebar, refactor the knowledge layer to actually populate via manual + incremental + pause triggers, and add a Project Settings page with doc glob configuration, auto-inject toggle, and on-demand/on-creation ingestion.

**Architecture:** Three slices. Slice 1 builds the read/write surfaces for docs and notes. Slice 2 wires up three new extraction triggers. Slice 3 adds the settings page, per-session auto-injection into the SDK system prompt, and one-time ingestion prompt on project creation.

**Tech Stack:** Next.js 15, React, Tailwind, Supabase/Drizzle (existing), `fast-glob` (new), `fs/promises` (Node built-in), existing theme system + SSE event bus + Claude Agent SDK.

---

## File Structure

```
src/
├── lib/
│   ├── db/schema.ts                    # MODIFY: add engine columns + project_notes table + origin enum
│   ├── docs/
│   │   ├── scanner.ts                  # NEW: glob-matching file scanner + path-escape guard
│   │   ├── notes.ts                    # NEW: project_notes CRUD
│   │   └── __tests__/
│   │       ├── scanner.test.ts
│   │       └── notes.test.ts
│   └── sessions/
│       └── knowledge-extractor.ts      # MODIFY: add extractIncremental + extractFromMessages + dedup
├── app/
│   └── api/
│       ├── projects/
│       │   ├── route.ts                # MODIFY: return docGlobs/autoInjectDocs in GET/POST
│       │   └── [id]/
│       │       ├── route.ts            # MODIFY: PATCH accepts docGlobs/autoInjectDocs
│       │       ├── docs/
│       │       │   ├── route.ts        # NEW: list matching doc files
│       │       │   └── content/route.ts # NEW: read a single doc's content
│       │       ├── notes/
│       │       │   ├── route.ts        # NEW: list, create notes
│       │       │   └── [noteId]/route.ts # NEW: update, delete note
│       │       └── ingest/route.ts     # NEW: ingest selected doc files into knowledge
│       └── sessions/[id]/
│           └── remember/route.ts       # NEW: trigger manual knowledge extraction from recent N messages
├── components/
│   ├── chat/
│   │   └── session-context-panel.tsx   # MODIFY: add tab switcher (Context / Docs / Notes)
│   ├── docs/
│   │   ├── docs-tab.tsx                # NEW: file tree + markdown viewer
│   │   └── notes-tab.tsx               # NEW: list + editor
│   └── message-input.tsx               # MODIFY: add "Remember" button
├── app/projects/[id]/settings/
│   └── page.tsx                        # MODIFY: add Doc Patterns, Auto-Inject, Doc Ingestion sections
└── components/project/
    └── ingestion-prompt.tsx            # NEW: one-time dialog after project creation

docs/superpowers/specs/2026-04-12-docs-knowledge-layer-design.md  # (spec, exists)
```

---

## Slice 1 — Schema + Docs/Notes Backend + UI Panels

### Task 1: Database Schema Changes

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add `origin` enum for knowledge entries**

Open `src/lib/db/schema.ts`. Near the existing enums, add:

```typescript
export const knowledgeOriginEnum = pgEnum("knowledge_origin", [
  "session_extract",
  "manual",
  "doc_seed",
]);
```

- [ ] **Step 2: Add columns to `projects` table**

Find the `projects` table definition. Add three columns right before `createdAt`:

```typescript
docGlobs: jsonb("doc_globs").$type<string[]>().notNull().default(sql`
  '["README.md", "CHANGELOG.md", "AGENTS.md", "CLAUDE.md", "docs/**/*.md", ".github/**/*.md", "doc/**/*.md"]'::jsonb
`),
autoInjectDocs: boolean("auto_inject_docs").notNull().default(true),
hasBeenIngestionPrompted: boolean("has_been_ingestion_prompted").notNull().default(false),
```

Make sure `boolean` and `jsonb` and `sql` are imported at the top of the file if they aren't already:

```typescript
import { pgTable, uuid, text, timestamp, jsonb, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
```

- [ ] **Step 3: Add `origin` column to `knowledge` table**

Find the `knowledge` table definition. Add:

```typescript
origin: knowledgeOriginEnum("origin").notNull().default("session_extract"),
```

- [ ] **Step 4: Add new `projectNotes` table**

At the bottom of the file, add:

```typescript
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
```

- [ ] **Step 5: Push the schema**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres" npx drizzle-kit push
```

Expected output: `[✓] Changes applied`

- [ ] **Step 6: Verify**

Run:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres -c "\d projects" | head -20
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres -c "\d project_notes"
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres -c "\d knowledge" | grep origin
```

Expected:
- `projects` shows `doc_globs`, `auto_inject_docs`, `has_been_ingestion_prompted`
- `project_notes` table exists
- `knowledge.origin` exists with default `'session_extract'`

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): add docGlobs/autoInjectDocs/hasBeenIngestionPrompted to projects, origin to knowledge, project_notes table"
```

---

### Task 2: Install `fast-glob` dependency

**Files:** `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install fast-glob
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fast-glob for doc scanning"
```

---

### Task 3: Docs Scanner

**Files:**
- Create: `src/lib/docs/scanner.ts`
- Create: `src/lib/docs/__tests__/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/docs/__tests__/scanner.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { scanDocs, resolveDocPath } from "../scanner";

describe("scanDocs", () => {
  const tmp = join(tmpdir(), `cchq-scanner-test-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(tmp, { recursive: true });
    await writeFile(join(tmp, "README.md"), "# readme");
    await writeFile(join(tmp, "CHANGELOG.md"), "# changelog");
    await writeFile(join(tmp, "random.txt"), "not markdown");
    await mkdir(join(tmp, "docs"), { recursive: true });
    await writeFile(join(tmp, "docs", "guide.md"), "# guide");
    await mkdir(join(tmp, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(tmp, "node_modules", "pkg", "README.md"), "# excluded");
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("matches top-level markdown by pattern", async () => {
    const result = await scanDocs(tmp, ["README.md", "CHANGELOG.md"]);
    const names = result.map((r) => r.relativePath).sort();
    expect(names).toEqual(["CHANGELOG.md", "README.md"]);
  });

  it("supports nested glob patterns", async () => {
    const result = await scanDocs(tmp, ["docs/**/*.md"]);
    expect(result.map((r) => r.relativePath)).toEqual(["docs/guide.md"]);
  });

  it("excludes node_modules by default", async () => {
    const result = await scanDocs(tmp, ["**/*.md"]);
    const paths = result.map((r) => r.relativePath);
    expect(paths).not.toContain("node_modules/pkg/README.md");
  });

  it("returns file metadata", async () => {
    const result = await scanDocs(tmp, ["README.md"]);
    expect(result[0]).toMatchObject({
      relativePath: "README.md",
      name: "README.md",
    });
    expect(typeof result[0].size).toBe("number");
    expect(typeof result[0].mtime).toBe("string");
  });
});

describe("resolveDocPath", () => {
  const tmp = join(tmpdir(), `cchq-resolve-test-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(tmp, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns absolute path for valid relative paths", () => {
    const result = resolveDocPath(tmp, "README.md");
    expect(result).toBe(join(tmp, "README.md"));
  });

  it("rejects path traversal attempts", () => {
    expect(() => resolveDocPath(tmp, "../etc/passwd")).toThrow();
    expect(() => resolveDocPath(tmp, "../../secrets")).toThrow();
    expect(() => resolveDocPath(tmp, "/etc/passwd")).toThrow();
  });

  it("rejects paths escaping via symlinks or complex traversal", () => {
    expect(() => resolveDocPath(tmp, "foo/../../escape")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/docs/__tests__/scanner.test.ts`

Expected: FAIL with "Cannot find module '../scanner'"

- [ ] **Step 3: Create the scanner**

Create `src/lib/docs/scanner.ts`:

```typescript
import fg from "fast-glob";
import { stat } from "fs/promises";
import { join, resolve, relative } from "path";

export type DocFile = {
  relativePath: string;
  name: string;
  size: number;
  mtime: string;
};

const ALWAYS_EXCLUDE = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.turbo/**",
  "**/coverage/**",
];

export async function scanDocs(
  projectPath: string,
  patterns: string[]
): Promise<DocFile[]> {
  const matches = await fg(patterns, {
    cwd: projectPath,
    ignore: ALWAYS_EXCLUDE,
    dot: false,
    onlyFiles: true,
    absolute: false,
    unique: true,
  });

  const results: DocFile[] = [];
  for (const rel of matches) {
    try {
      const abs = join(projectPath, rel);
      const st = await stat(abs);
      const segments = rel.split("/");
      results.push({
        relativePath: rel,
        name: segments[segments.length - 1],
        size: st.size,
        mtime: st.mtime.toISOString(),
      });
    } catch {
      // File may have been deleted between glob and stat — skip
    }
  }

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

/**
 * Resolve a relative doc path to an absolute path, guarding against
 * path traversal attacks. Throws if the resolved path escapes projectPath.
 */
export function resolveDocPath(projectPath: string, relativePath: string): string {
  const absProject = resolve(projectPath);
  const absCandidate = resolve(absProject, relativePath);
  const rel = relative(absProject, absCandidate);

  // If `rel` starts with ".." or is absolute, the path escapes the project
  if (rel.startsWith("..") || rel.startsWith("/") || rel === "") {
    throw new Error(`Path '${relativePath}' escapes project directory`);
  }

  return absCandidate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/docs/__tests__/scanner.test.ts`

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docs/scanner.ts src/lib/docs/__tests__/scanner.test.ts
git commit -m "feat(docs): add doc scanner with glob matching and path traversal guard"
```

---

### Task 4: Notes CRUD Module

**Files:**
- Create: `src/lib/docs/notes.ts`
- Create: `src/lib/docs/__tests__/notes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/docs/__tests__/notes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { listNotes, createNote, updateNote, deleteNote, getNote } from "../notes";

const TEST_PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const TEST_PROJECT_PATH = "/tmp/notes-test-project";

describe("notes CRUD", () => {
  beforeEach(async () => {
    // Clean state: remove any notes + project with the test id
    await db.delete(schema.projectNotes).where(eq(schema.projectNotes.projectId, TEST_PROJECT_ID));
    await db.delete(schema.projects).where(eq(schema.projects.id, TEST_PROJECT_ID));
    await db.insert(schema.projects).values({
      id: TEST_PROJECT_ID,
      name: "notes-test",
      path: TEST_PROJECT_PATH,
    });
  });

  afterAll(async () => {
    await db.delete(schema.projectNotes).where(eq(schema.projectNotes.projectId, TEST_PROJECT_ID));
    await db.delete(schema.projects).where(eq(schema.projects.id, TEST_PROJECT_ID));
  });

  it("creates and lists a note", async () => {
    const created = await createNote(TEST_PROJECT_ID, "My Note", "hello");
    expect(created.title).toBe("My Note");
    expect(created.content).toBe("hello");

    const notes = await listNotes(TEST_PROJECT_ID);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(created.id);
  });

  it("updates an existing note", async () => {
    const n = await createNote(TEST_PROJECT_ID, "Original", "old");
    const updated = await updateNote(n.id, { title: "New Title", content: "new content" });
    expect(updated?.title).toBe("New Title");
    expect(updated?.content).toBe("new content");
  });

  it("deletes a note", async () => {
    const n = await createNote(TEST_PROJECT_ID, "Temp", "x");
    await deleteNote(n.id);
    const notes = await listNotes(TEST_PROJECT_ID);
    expect(notes).toHaveLength(0);
  });

  it("returns null for missing note", async () => {
    const n = await getNote("00000000-0000-0000-0000-000000000000");
    expect(n).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/docs/__tests__/notes.test.ts`

Expected: FAIL (`../notes` not found).

- [ ] **Step 3: Implement the notes module**

Create `src/lib/docs/notes.ts`:

```typescript
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export type ProjectNote = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function toProjectNote(row: typeof schema.projectNotes.$inferSelect): ProjectNote {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listNotes(projectId: string): Promise<ProjectNote[]> {
  const rows = await db.query.projectNotes.findMany({
    where: eq(schema.projectNotes.projectId, projectId),
    orderBy: [desc(schema.projectNotes.updatedAt)],
  });
  return rows.map(toProjectNote);
}

export async function getNote(id: string): Promise<ProjectNote | null> {
  const row = await db.query.projectNotes.findFirst({
    where: eq(schema.projectNotes.id, id),
  });
  return row ? toProjectNote(row) : null;
}

export async function createNote(
  projectId: string,
  title: string,
  content: string
): Promise<ProjectNote> {
  const [row] = await db
    .insert(schema.projectNotes)
    .values({ projectId, title, content })
    .returning();
  return toProjectNote(row);
}

export async function updateNote(
  id: string,
  patch: { title?: string; content?: string }
): Promise<ProjectNote | null> {
  const [row] = await db
    .update(schema.projectNotes)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(schema.projectNotes.id, id))
    .returning();
  return row ? toProjectNote(row) : null;
}

export async function deleteNote(id: string): Promise<void> {
  await db.delete(schema.projectNotes).where(eq(schema.projectNotes.id, id));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/docs/__tests__/notes.test.ts`

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docs/notes.ts src/lib/docs/__tests__/notes.test.ts
git commit -m "feat(docs): add notes CRUD module"
```

---

### Task 5: Docs API Routes

**Files:**
- Create: `src/app/api/projects/[id]/docs/route.ts`
- Create: `src/app/api/projects/[id]/docs/content/route.ts`

- [ ] **Step 1: Docs list route**

Create `src/app/api/projects/[id]/docs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { scanDocs } from "@/lib/docs/scanner";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const files = await scanDocs(project.path, project.docGlobs);
    return NextResponse.json(files);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Docs content route**

Create `src/app/api/projects/[id]/docs/content/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveDocPath } from "@/lib/docs/scanner";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) {
    return NextResponse.json({ error: "path query param required" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const absPath = resolveDocPath(project.path, relPath);
    const content = await readFile(absPath, "utf8");
    return NextResponse.json({ path: relPath, content });
  } catch (err: any) {
    if (err.message?.includes("escapes project")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (err.code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Smoke test the docs endpoint**

With the dev server running, run:

```bash
# Pick an existing project id
PROJECT_ID=$(curl -s http://localhost:3000/api/projects | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')
curl -s "http://localhost:3000/api/projects/$PROJECT_ID/docs" | python3 -m json.tool | head -20
```

Expected: JSON array of doc files with `relativePath`, `name`, `size`, `mtime`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/[id]/docs/
git commit -m "feat(api): add docs list + content routes"
```

---

### Task 6: Notes API Routes

**Files:**
- Create: `src/app/api/projects/[id]/notes/route.ts`
- Create: `src/app/api/projects/[id]/notes/[noteId]/route.ts`

- [ ] **Step 1: Notes list + create route**

Create `src/app/api/projects/[id]/notes/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listNotes, createNote } from "@/lib/docs/notes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const notes = await listNotes(id);
  return NextResponse.json(notes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const note = await createNote(id, title, content);
  return NextResponse.json(note, { status: 201 });
}
```

- [ ] **Step 2: Note detail route**

Create `src/app/api/projects/[id]/notes/[noteId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getNote, updateNote, deleteNote } from "@/lib/docs/notes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  const note = await getNote(noteId);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(note);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  const body = await req.json();
  const patch: { title?: string; content?: string } = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.content === "string") patch.content = body.content;
  const updated = await updateNote(noteId, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  await deleteNote(noteId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds; new routes listed in output.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/projects/[id]/notes/
git commit -m "feat(api): add project notes CRUD routes"
```

---

### Task 7: Docs Tab Component

**Files:**
- Create: `src/components/docs/docs-tab.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/docs/docs-tab.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type DocFile = {
  relativePath: string;
  name: string;
  size: number;
  mtime: string;
};

export function DocsTab({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/docs`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setFiles(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    setContentLoading(true);
    fetch(`/api/projects/${projectId}/docs/content?path=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(typeof data.content === "string" ? data.content : null);
        setContentLoading(false);
      })
      .catch(() => setContentLoading(false));
  }, [projectId, selected]);

  // Group files by top-level folder
  const grouped: Record<string, DocFile[]> = {};
  for (const f of files) {
    const segments = f.relativePath.split("/");
    const group = segments.length > 1 ? segments[0] : "(root)";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(f);
  }

  function openInEditor(relPath: string) {
    const abs = `${projectPath}/${relPath}`;
    window.open(`vscode://file${abs}`, "_blank");
  }

  if (loading) {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Loading docs...</div>;
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--text-muted)]">
        No doc files match the configured glob patterns.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="overflow-y-auto border-b border-[var(--border)] max-h-60 shrink-0">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="mb-2">
            <div className="eyebrow px-4 pt-2 pb-1">{group}</div>
            {items.map((f) => (
              <button
                key={f.relativePath}
                onClick={() => setSelected(f.relativePath)}
                className={`w-full text-left px-4 py-1 text-xs font-mono truncate ${
                  selected === f.relativePath
                    ? "bg-[var(--surface-raised)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                }`}
                title={f.relativePath}
              >
                {f.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                {selected}
              </div>
              <button
                onClick={() => openInEditor(selected)}
                className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] shrink-0 ml-2"
                title="Open in VS Code"
              >
                ↗ Open
              </button>
            </div>
            {contentLoading ? (
              <div className="text-xs text-[var(--text-muted)]">Loading…</div>
            ) : content ? (
              <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-xs text-[var(--errored-text)]">Failed to load content.</div>
            )}
          </>
        ) : (
          <div className="text-xs text-[var(--text-muted)]">Pick a file to preview.</div>
        )}
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
git add src/components/docs/docs-tab.tsx
git commit -m "feat(docs): add DocsTab component with file tree + markdown preview"
```

---

### Task 8: Notes Tab Component

**Files:**
- Create: `src/components/docs/notes-tab.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/docs/notes-tab.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

export function NotesTab({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/notes`);
    if (res.ok) {
      setNotes(await res.json());
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("__new__");
    setDraftTitle("");
    setDraftContent("");
    setShowPreview(false);
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setDraftTitle(note.title);
    setDraftContent(note.content);
    setShowPreview(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftTitle("");
    setDraftContent("");
  }

  async function save() {
    if (!draftTitle.trim()) return;
    setSaving(true);
    if (editingId === "__new__") {
      await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, content: draftContent }),
      });
    } else if (editingId) {
      await fetch(`/api/projects/${projectId}/notes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, content: draftContent }),
      });
    }
    setSaving(false);
    cancelEdit();
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/projects/${projectId}/notes/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return <div className="p-4 text-xs text-[var(--text-muted)]">Loading notes...</div>;
  }

  if (editingId) {
    return (
      <div className="flex flex-col h-full overflow-hidden p-4">
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Note title"
          className="mb-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <div className="flex items-center gap-2 mb-2 text-xs">
          <button
            onClick={() => setShowPreview(false)}
            className={showPreview ? "text-[var(--text-muted)]" : "text-[var(--accent)]"}
          >
            Edit
          </button>
          <span className="text-[var(--text-muted)]">·</span>
          <button
            onClick={() => setShowPreview(true)}
            className={showPreview ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}
          >
            Preview
          </button>
        </div>
        {showPreview ? (
          <div className="flex-1 overflow-y-auto prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--accent)] prose-strong:text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border)] rounded p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder="Markdown..."
            className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] font-mono resize-none"
          />
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={cancelEdit} className="text-xs px-3 py-1.5 text-[var(--text-secondary)]">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !draftTitle.trim()}
            className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Notes</div>
        <button
          onClick={startNew}
          className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          + New note
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">
          No notes yet. Use these for cross-session scratch thoughts.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="bg-[var(--surface-raised)] border border-[var(--border)] rounded p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="text-sm text-[var(--text-primary)] font-medium">{n.title}</div>
                <div className="flex gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => startEdit(n)}
                    className="text-[11px] text-[var(--accent)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(n.id)}
                    className="text-[11px] text-[var(--errored-text)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-xs text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap">
                {n.content || "(empty)"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/docs/notes-tab.tsx
git commit -m "feat(docs): add NotesTab component with inline editor + markdown preview"
```

---

### Task 9: Integrate Tabs into Session Context Panel

**Files:**
- Modify: `src/components/chat/session-context-panel.tsx`

- [ ] **Step 1: Read current file to understand structure**

Read `src/components/chat/session-context-panel.tsx`. Note that it currently takes props for `projectId`, `projectPath`, `model`, `effort`, `messageCount`, `usage`, and renders a single "Context" view with working directory + stats + injected knowledge.

- [ ] **Step 2: Refactor to support tabs**

Replace the entire contents of `src/components/chat/session-context-panel.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { DocsTab } from "@/components/docs/docs-tab";
import { NotesTab } from "@/components/docs/notes-tab";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
};

type TabKey = "context" | "docs" | "notes";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[12px] text-[var(--text-secondary)] tabular-nums text-right truncate">{value}</span>
    </div>
  );
}

function ContextView({
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
}: {
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
}) {
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  useEffect(() => {
    if (projectId) {
      fetch(`/api/knowledge?projectId=${projectId}`)
        .then((r) => r.json())
        .then((entries) => setKnowledge(entries.slice(0, 10)));
    }
  }, [projectId]);

  const shortPath = projectPath.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

  return (
    <div className="px-5 pt-5 pb-4 overflow-y-auto rail-scroll flex-1">
      <div className="mb-6">
        <div className="eyebrow mb-1.5">Working directory</div>
        <div
          className="font-mono text-[12px] text-[var(--text-primary)] break-all leading-snug"
          title={projectPath}
        >
          {shortPath}
        </div>
      </div>

      <div className="mb-6">
        <div className="eyebrow mb-2">Session</div>
        <div className="divide-y divide-[var(--border)]/40">
          <DefRow label="Model" value={<span className="font-mono">{model}</span>} />
          <DefRow label="Effort" value={effort || "high"} />
          <DefRow label="Messages" value={messageCount.toLocaleString()} />
          {usage && (
            <>
              <DefRow label="Turns" value={usage.numTurns.toLocaleString()} />
              <DefRow label="Tokens" value={formatTokens(usage.totalTokens)} />
              <DefRow label="Cost" value={`$${usage.totalCostUsd.toFixed(2)}`} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="eyebrow mb-2 flex items-center justify-between">
          <span>Injected knowledge</span>
          {knowledge.length > 0 && (
            <span className="text-[var(--text-muted)] tabular-nums normal-case tracking-normal">
              {knowledge.length}
            </span>
          )}
        </div>
        {knowledge.length === 0 ? (
          <div className="text-[12px] text-[var(--text-muted)] leading-relaxed">
            Nothing injected for this project yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {knowledge.map((k) => (
              <li key={k.id} className="text-[12px] leading-relaxed">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--accent)] mb-0.5">
                  {k.type}
                </div>
                <div className="text-[var(--text-secondary)]">{k.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SessionContextPanel({
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
}: {
  sessionId: string;
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
}) {
  const [tab, setTab] = useState<TabKey>("context");

  return (
    <aside className="w-72 shrink-0 border-l border-[var(--border)] bg-[color-mix(in_oklch,var(--surface)_50%,transparent)] flex flex-col overflow-hidden">
      <nav className="flex border-b border-[var(--border)] px-2">
        {(
          [
            { key: "context", label: "Context" },
            { key: "docs", label: "Docs" },
            { key: "notes", label: "Notes" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-[11px] uppercase tracking-[0.08em] py-2.5 ${
              tab === t.key
                ? "text-[var(--accent)] border-b border-[var(--accent)] -mb-px"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "context" && (
        <ContextView
          projectId={projectId}
          projectPath={projectPath}
          model={model}
          effort={effort}
          messageCount={messageCount}
          usage={usage}
        />
      )}
      {tab === "docs" && (
        <div className="flex-1 overflow-hidden">
          <DocsTab projectId={projectId} projectPath={projectPath} />
        </div>
      )}
      {tab === "notes" && (
        <div className="flex-1 overflow-hidden">
          <NotesTab projectId={projectId} />
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev`
2. Open an existing session
3. Verify the right sidebar has three tabs: Context / Docs / Notes
4. Click Docs — verify `.md` files from the project appear, and clicking one renders the markdown
5. Click Notes — create a new note, save it, verify it persists after refresh

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/session-context-panel.tsx
git commit -m "feat(ui): add Docs + Notes tabs to session context panel"
```

---

## Slice 2 — Knowledge Layer Refactor

### Task 10: Update Knowledge Extractor

**Files:**
- Modify: `src/lib/sessions/knowledge-extractor.ts`

- [ ] **Step 1: Read the current extractor**

Read `src/lib/sessions/knowledge-extractor.ts` to understand what's already there.

- [ ] **Step 2: Replace with extended version**

Replace the entire contents of `src/lib/sessions/knowledge-extractor.ts` with:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, gt, and, asc } from "drizzle-orm";

export type ExtractedKnowledge = {
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags?: string[];
};

async function fetchExistingKnowledge(projectId: string) {
  return db.query.knowledge.findMany({
    where: eq(schema.knowledge.projectId, projectId),
    columns: { type: true, content: true },
    limit: 200,
  });
}

function formatExistingForPrompt(existing: { type: string; content: string }[]): string {
  if (existing.length === 0) return "(none yet)";
  return existing.map((k) => `- [${k.type}] ${k.content}`).join("\n");
}

async function callExtractor(
  conversationSummary: string,
  existing: { type: string; content: string }[]
): Promise<ExtractedKnowledge[]> {
  const prompt = `Review this conversation and extract NEW decisions, facts, and context that would be useful in future sessions on this project.

EXISTING MEMORIES (do not re-extract these or anything equivalent):
${formatExistingForPrompt(existing)}

Return ONLY a JSON array of objects with fields:
- type: "decision" | "fact" | "context" | "summary"
- content: string (one concise sentence)
- tags: string[] (optional)

Return [] if nothing new is worth remembering.

Conversation:
${conversationSummary}`;

  let resultText = "";
  try {
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
  } catch (err) {
    console.error("Knowledge extractor failed:", err);
    return [];
  }

  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.content === "string" &&
        ["decision", "fact", "context", "summary"].includes(e.type)
    );
  } catch {
    return [];
  }
}

async function persist(
  projectId: string,
  sessionId: string | null,
  entries: ExtractedKnowledge[],
  origin: "session_extract" | "manual" | "doc_seed"
) {
  for (const e of entries) {
    await db.insert(schema.knowledge).values({
      projectId,
      sessionId,
      type: e.type,
      content: e.content,
      tags: e.tags || [],
      origin,
    });
  }
}

/**
 * Original: extract from every message in the session. Called on complete.
 */
export async function extractKnowledge(sessionId: string): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return;

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: [asc(schema.messages.createdAt)],
  });
  if (messages.length === 0) return;

  const existing = await fetchExistingKnowledge(session.projectId);
  const conversationSummary = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const entries = await callExtractor(conversationSummary, existing);
  await persist(session.projectId, sessionId, entries, "session_extract");
}

/**
 * Background incremental: extract from messages since sinceTimestamp.
 * If sinceTimestamp is null, treat as "last 20 messages".
 */
export async function extractIncremental(
  sessionId: string,
  sinceTimestamp: string | null
): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return;

  const conditions = [eq(schema.messages.sessionId, sessionId)];
  if (sinceTimestamp) {
    conditions.push(gt(schema.messages.createdAt, sinceTimestamp));
  }
  const messages = await db.query.messages.findMany({
    where: and(...conditions),
    orderBy: [asc(schema.messages.createdAt)],
    limit: 50,
  });
  if (messages.length === 0) return;

  const existing = await fetchExistingKnowledge(session.projectId);
  const conversationSummary = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const entries = await callExtractor(conversationSummary, existing);
  await persist(session.projectId, sessionId, entries, "session_extract");
}

/**
 * Manual: extract from the last `count` messages in a session.
 * Returns the created entries so the API can respond with them.
 */
export async function extractFromRecentMessages(
  sessionId: string,
  count: number
): Promise<ExtractedKnowledge[]> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return [];

  const recent = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit: count,
  });
  if (recent.length === 0) return [];

  const ordered = recent.reverse();
  const existing = await fetchExistingKnowledge(session.projectId);
  const conversationSummary = ordered
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const entries = await callExtractor(conversationSummary, existing);
  await persist(session.projectId, sessionId, entries, "manual");
  return entries;
}

/**
 * Ingest the content of a doc file as knowledge entries.
 */
export async function extractFromDoc(
  projectId: string,
  filePath: string,
  fileContent: string
): Promise<number> {
  const existing = await fetchExistingKnowledge(projectId);

  const prompt = `This is project documentation from file: ${filePath}

Extract stable facts, decisions, and conventions as knowledge entries. Prefer 'fact' and 'decision' types. Avoid duplicating existing memories (listed below).

EXISTING MEMORIES:
${formatExistingForPrompt(existing)}

Return ONLY a JSON array of objects with fields: type, content, tags (optional).

Document content:
${fileContent}`;

  let resultText = "";
  try {
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
  } catch {
    return 0;
  }

  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return 0;

  let entries: ExtractedKnowledge[] = [];
  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return 0;
    entries = arr.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.content === "string" &&
        ["decision", "fact", "context", "summary"].includes(e.type)
    );
  } catch {
    return 0;
  }

  await persist(projectId, null, entries, "doc_seed");
  return entries.length;
}
```

- [ ] **Step 3: Verify compilation**

Run: `npm run build`

Expected: Build succeeds. If there's a type error about `origin` being required, it means step 2 works correctly and the `origin` enum from Task 1 is present.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sessions/knowledge-extractor.ts
git commit -m "feat(knowledge): add incremental, manual, and doc extraction functions with dedup"
```

---

### Task 11: Manual "Remember" API Route

**Files:**
- Create: `src/app/api/sessions/[id]/remember/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/sessions/[id]/remember/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { extractFromRecentMessages } from "@/lib/sessions/knowledge-extractor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const count = typeof body.count === "number" && body.count > 0 ? Math.min(body.count, 30) : 6;

  try {
    const entries = await extractFromRecentMessages(id, count);
    return NextResponse.json({ entries, count: entries.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/[id]/remember/route.ts
git commit -m "feat(api): add /sessions/[id]/remember route for manual knowledge extraction"
```

---

### Task 12: Remember Button in MessageInput

**Files:**
- Modify: `src/components/chat/message-input.tsx`

- [ ] **Step 1: Read current file**

Read `src/components/chat/message-input.tsx` to understand the current button layout (Send button on the right, file attach button on the left).

- [ ] **Step 2: Add `sessionId` prop + Remember button**

Add `sessionId` prop support. Just before the Send button in the button row, add a Remember button. Find the props type declaration near the top of the component and add to it:

```typescript
sessionId?: string;
```

Find the action buttons row (it contains the Send button). Insert this button immediately before the Send button:

```tsx
{sessionId && (
  <button
    type="button"
    onClick={async () => {
      const res = await fetch(`/api/sessions/${sessionId}/remember`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 6 }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Extracted ${data.count} new ${data.count === 1 ? "memory" : "memories"}`);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Remember failed: ${data.error || "unknown"}`);
      }
    }}
    disabled={disabled}
    className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 shrink-0"
    title="Extract memories from the last few messages"
  >
    🧠 Remember
  </button>
)}
```

Note: if the existing button row uses `flex items-end gap-2` or similar, the button will fit naturally.

- [ ] **Step 3: Pass sessionId from the session page**

Open `src/app/sessions/[id]/page.tsx`. Find the `<MessageInput ... />` usage. Make sure `sessionId={id}` is passed (it may already be passed — if so, no change needed).

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/message-input.tsx src/app/sessions/[id]/page.tsx
git commit -m "feat(ui): add Remember button to message input for manual knowledge extraction"
```

---

### Task 13: Incremental Extraction Trigger in Manager

**Files:**
- Modify: `src/lib/sessions/manager.ts`

- [ ] **Step 1: Add counter fields to ActiveSession**

Find the `type ActiveSession = { ... }` declaration. Add two fields:

```typescript
messagesSinceExtract: number;
lastExtractionTimestamp: string | null;
```

- [ ] **Step 2: Initialize fields in startSession and sendMessage**

Find the `activeSessions.set(sessionId, { ... })` call in `startSession`. Add:

```typescript
messagesSinceExtract: 0,
lastExtractionTimestamp: null,
```

Find the `activeSessions.set(sessionId, { ... })` call in `sendMessage`. Do the same — add the two fields copying from the existing active entry:

```typescript
messagesSinceExtract: active?.messagesSinceExtract ?? 0,
lastExtractionTimestamp: active?.lastExtractionTimestamp ?? null,
```

Do the same in `resumeSession`.

- [ ] **Step 3: Add counter increment + trigger**

Find the block in `processMessages` where a persisted assistant message is followed by `message_complete` emission. Right AFTER that block (still inside the `for await` loop), add:

```typescript
// Incremental extraction: every 10 persisted user+assistant messages,
// trigger a background extraction for memories.
{
  const entry = activeSessions.get(sessionId);
  if (entry) {
    entry.messagesSinceExtract += 1;
    if (entry.messagesSinceExtract >= 10) {
      const since = entry.lastExtractionTimestamp;
      entry.messagesSinceExtract = 0;
      entry.lastExtractionTimestamp = new Date().toISOString();
      // Fire-and-forget
      import("./knowledge-extractor").then(({ extractIncremental }) =>
        extractIncremental(sessionId, since).catch((err) =>
          console.error(`Incremental extract failed for ${sessionId}:`, err)
        )
      );
    }
  }
}
```

Also add the same increment when a user message is persisted. In `sendMessage`, find `await db.insert(schema.messages).values({ sessionId, role: "user", content, ... })`. Immediately after, add:

```typescript
const active = activeSessions.get(sessionId);
if (active) active.messagesSinceExtract += 1;
```

- [ ] **Step 4: Trigger extraction on pause**

Find the `pauseSession` function. After setting the session status to "paused", trigger extraction:

```typescript
// Extract knowledge on pause (previously only on complete).
import("./knowledge-extractor").then(({ extractKnowledge }) =>
  extractKnowledge(sessionId).catch((err) =>
    console.error(`Pause-time extraction failed for ${sessionId}:`, err)
  )
);
```

- [ ] **Step 5: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sessions/manager.ts
git commit -m "feat(knowledge): trigger incremental extraction every 10 msgs + extract on pause"
```

---

## Slice 3 — Auto-Ingestion & Project Settings

### Task 14: Ingest API Route

**Files:**
- Create: `src/app/api/projects/[id]/ingest/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/projects/[id]/ingest/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveDocPath } from "@/lib/docs/scanner";
import { extractFromDoc } from "@/lib/sessions/knowledge-extractor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "paths array required" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const byFile: Record<string, number> = {};
  let total = 0;
  for (const rel of paths) {
    try {
      const abs = resolveDocPath(project.path, rel);
      const content = await readFile(abs, "utf8");
      const n = await extractFromDoc(project.id, rel, content);
      byFile[rel] = n;
      total += n;
    } catch (err: any) {
      byFile[rel] = -1;
      console.error(`Ingest failed for ${rel}:`, err);
    }
  }

  return NextResponse.json({ entriesCreated: total, byFile });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/projects/[id]/ingest/route.ts
git commit -m "feat(api): add POST /projects/[id]/ingest for doc-seeded knowledge extraction"
```

---

### Task 15: Auto-Injection in startSession

**Files:**
- Modify: `src/lib/sessions/manager.ts`

- [ ] **Step 1: Add doc-injection helper at top of manager.ts**

Near the top of `src/lib/sessions/manager.ts`, right after the imports, add a helper function:

```typescript
import { scanDocs } from "@/lib/docs/scanner";
import { readFile } from "fs/promises";
import { join } from "path";

const MAX_DOC_INJECTION_CHARS = 20_000;

async function buildDocInjection(
  projectPath: string,
  docGlobs: string[]
): Promise<string> {
  let files;
  try {
    files = await scanDocs(projectPath, docGlobs);
  } catch {
    return "";
  }
  if (files.length === 0) return "";

  // Rank: shallower path first, then more recent mtime first
  files.sort((a, b) => {
    const depthA = a.relativePath.split("/").length;
    const depthB = b.relativePath.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return b.mtime.localeCompare(a.mtime);
  });

  const parts: string[] = [];
  let total = 0;
  let truncated = 0;
  for (const f of files) {
    try {
      const content = await readFile(join(projectPath, f.relativePath), "utf8");
      const block = `\n--- ${f.relativePath} ---\n${content}\n`;
      if (total + block.length > MAX_DOC_INJECTION_CHARS) {
        truncated = files.length - parts.length;
        break;
      }
      parts.push(block);
      total += block.length;
    } catch {
      // Skip files we can't read
    }
  }

  if (parts.length === 0) return "";

  const header = "\n\n--- Project Docs ---\nThe following are docs from this project, injected as context:\n";
  const footer = truncated > 0 ? `\n[${truncated} more doc files available — ask to see them]\n` : "";
  return header + parts.join("") + footer;
}
```

- [ ] **Step 2: Call the helper in startSession**

Find `startSession`. After the knowledge injection block (where `systemAppend` is built from knowledge entries), add doc injection:

```typescript
// If enabled, append matched doc content to the system prompt.
if (project.autoInjectDocs) {
  const docInjection = await buildDocInjection(projectPath, project.docGlobs);
  if (docInjection) {
    systemAppend += docInjection;
  }
}
```

Note: you'll need to look up the full project row (the current code only has `session.projectId`). Modify the existing session lookup or add a projects lookup. The cleanest way is:

```typescript
const project = await db.query.projects.findFirst({
  where: eq(schema.projects.id, session.projectId),
});
```

Use `project.autoInjectDocs` and `project.docGlobs` from there.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sessions/manager.ts
git commit -m "feat(knowledge): auto-inject matched project docs into session system prompt"
```

---

### Task 16: Projects PATCH to support doc settings

**Files:**
- Modify: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Read the current file**

Read `src/app/api/projects/[id]/route.ts`. It should already have a PATCH handler.

- [ ] **Step 2: Whitelist new fields in PATCH**

In the PATCH handler, find where the body is destructured/used. Ensure that `docGlobs`, `autoInjectDocs`, and `hasBeenIngestionPrompted` are allowed through. If the handler currently spreads the whole body or only allows `name`, you'll need to add these explicitly. Example pattern:

```typescript
const body = await req.json();
const patch: {
  name?: string;
  path?: string;
  docGlobs?: string[];
  autoInjectDocs?: boolean;
  hasBeenIngestionPrompted?: boolean;
} = {};
if (typeof body.name === "string") patch.name = body.name;
if (typeof body.path === "string") patch.path = body.path;
if (Array.isArray(body.docGlobs)) {
  patch.docGlobs = body.docGlobs.filter((g: unknown) => typeof g === "string");
}
if (typeof body.autoInjectDocs === "boolean") patch.autoInjectDocs = body.autoInjectDocs;
if (typeof body.hasBeenIngestionPrompted === "boolean") {
  patch.hasBeenIngestionPrompted = body.hasBeenIngestionPrompted;
}

const [updated] = await db
  .update(schema.projects)
  .set({ ...patch, updatedAt: new Date().toISOString() })
  .where(eq(schema.projects.id, id))
  .returning();

return NextResponse.json(updated);
```

Keep the rest of the handler's existing behavior intact.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/projects/[id]/route.ts
git commit -m "feat(api): allow docGlobs/autoInjectDocs/hasBeenIngestionPrompted in project PATCH"
```

---

### Task 17: Project Settings Page — Doc Config + Ingestion

**Files:**
- Modify: `src/app/projects/[id]/settings/page.tsx`

- [ ] **Step 1: Read the current settings page**

Read `src/app/projects/[id]/settings/page.tsx` to understand its current structure.

- [ ] **Step 2: Add doc glob list editor**

Inside the main component, add state for `docGlobs`, `autoInjectDocs`, and `matchCount`:

```typescript
const [docGlobs, setDocGlobs] = useState<string[]>([]);
const [autoInjectDocs, setAutoInjectDocs] = useState(true);
const [matchCount, setMatchCount] = useState<number | null>(null);
const [newPattern, setNewPattern] = useState("");
```

In the effect that loads the project:

```typescript
setDocGlobs(project.docGlobs || []);
setAutoInjectDocs(project.autoInjectDocs ?? true);
```

Add a helper to refresh match count:

```typescript
const refreshMatchCount = useCallback(async () => {
  const res = await fetch(`/api/projects/${id}/docs`);
  if (res.ok) {
    const data = await res.json();
    setMatchCount(Array.isArray(data) ? data.length : 0);
  }
}, [id]);

useEffect(() => {
  refreshMatchCount();
}, [refreshMatchCount, docGlobs]);
```

Add a section to the page JSX (after Project Info, before Danger Zone):

```tsx
<section className="mb-8">
  <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Doc Patterns</h2>
  <p className="text-xs text-[var(--text-muted)] mb-3">
    Glob patterns for markdown files to surface in the Docs tab.
    {matchCount !== null && ` Matches ${matchCount} file${matchCount === 1 ? "" : "s"}.`}
  </p>
  <div className="space-y-1 mb-3">
    {docGlobs.map((g, i) => (
      <div key={i} className="flex items-center gap-2">
        <span className="flex-1 font-mono text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1 text-[var(--text-primary)]">
          {g}
        </span>
        <button
          onClick={async () => {
            const next = docGlobs.filter((_, idx) => idx !== i);
            setDocGlobs(next);
            await savePatch({ docGlobs: next });
          }}
          className="text-xs text-[var(--errored-text)] hover:text-[var(--errored-text)]"
        >
          Remove
        </button>
      </div>
    ))}
  </div>
  <div className="flex items-center gap-2">
    <input
      value={newPattern}
      onChange={(e) => setNewPattern(e.target.value)}
      placeholder="docs/**/*.md"
      className="flex-1 font-mono text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1.5 text-[var(--text-primary)]"
    />
    <button
      onClick={async () => {
        const trimmed = newPattern.trim();
        if (!trimmed) return;
        const next = [...docGlobs, trimmed];
        setDocGlobs(next);
        setNewPattern("");
        await savePatch({ docGlobs: next });
      }}
      className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)]"
    >
      Add
    </button>
  </div>
</section>

<section className="mb-8">
  <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Auto-Inject Docs</h2>
  <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
    <input
      type="checkbox"
      checked={autoInjectDocs}
      onChange={async (e) => {
        setAutoInjectDocs(e.target.checked);
        await savePatch({ autoInjectDocs: e.target.checked });
      }}
    />
    <span>Inject matched doc file contents into every new session's system prompt.</span>
  </label>
</section>

<section className="mb-8">
  <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Doc Ingestion</h2>
  <p className="text-xs text-[var(--text-muted)] mb-3">
    Extract stable facts from matched docs and add them to the knowledge base.
  </p>
  <button
    onClick={async () => setIngestModalOpen(true)}
    className="text-xs px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
  >
    Scan & Ingest Docs
  </button>
</section>
```

Add a `savePatch` helper in the component:

```typescript
async function savePatch(patch: Record<string, unknown>) {
  await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
```

Add ingestion modal state:

```typescript
const [ingestModalOpen, setIngestModalOpen] = useState(false);
const [availableDocs, setAvailableDocs] = useState<{ relativePath: string; name: string }[]>([]);
const [ingestSelected, setIngestSelected] = useState<Set<string>>(new Set());
const [ingesting, setIngesting] = useState(false);
```

When `ingestModalOpen` flips to true, fetch the docs list:

```typescript
useEffect(() => {
  if (!ingestModalOpen) return;
  fetch(`/api/projects/${id}/docs`)
    .then((r) => r.json())
    .then((data) => {
      setAvailableDocs(Array.isArray(data) ? data : []);
      setIngestSelected(new Set((data || []).map((f: any) => f.relativePath)));
    });
}, [ingestModalOpen, id]);
```

Add the modal to the JSX (anywhere at the end of the component):

```tsx
{ingestModalOpen && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">
        Ingest Docs
      </h3>
      <div className="flex-1 overflow-y-auto mb-4 space-y-1.5">
        {availableDocs.map((d) => (
          <label key={d.relativePath} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ingestSelected.has(d.relativePath)}
              onChange={(e) => {
                const next = new Set(ingestSelected);
                if (e.target.checked) next.add(d.relativePath);
                else next.delete(d.relativePath);
                setIngestSelected(next);
              }}
            />
            <span className="font-mono text-[var(--text-secondary)] truncate">{d.relativePath}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setIngestModalOpen(false)}
          className="text-xs px-3 py-1.5 text-[var(--text-secondary)]"
        >
          Cancel
        </button>
        <button
          disabled={ingesting || ingestSelected.size === 0}
          onClick={async () => {
            setIngesting(true);
            const res = await fetch(`/api/projects/${id}/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paths: [...ingestSelected] }),
            });
            setIngesting(false);
            if (res.ok) {
              const data = await res.json();
              alert(`Ingested ${data.entriesCreated} entries across ${Object.keys(data.byFile).length} files.`);
              setIngestModalOpen(false);
            } else {
              alert("Ingestion failed");
            }
          }}
          className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {ingesting ? "Ingesting…" : `Ingest ${ingestSelected.size}`}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/projects/[id]/settings/page.tsx
git commit -m "feat(ui): add doc patterns editor, auto-inject toggle, and ingestion modal to project settings"
```

---

### Task 18: Ingestion Prompt on Project Creation

**Files:**
- Create: `src/components/project/ingestion-prompt.tsx`
- Modify: `src/components/new-session-dialog.tsx`

- [ ] **Step 1: Create the prompt component**

Create `src/components/project/ingestion-prompt.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IngestionPrompt({
  projectId,
  fileCount,
  onClose,
}: {
  projectId: string;
  fileCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPrompted() {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasBeenIngestionPrompted: true }),
    });
  }

  async function importAll() {
    setBusy(true);
    const docsRes = await fetch(`/api/projects/${projectId}/docs`);
    const files: { relativePath: string }[] = docsRes.ok ? await docsRes.json() : [];
    const paths = files.map((f) => f.relativePath);
    if (paths.length > 0) {
      await fetch(`/api/projects/${projectId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
    }
    await markPrompted();
    setBusy(false);
    onClose();
  }

  async function reviewFirst() {
    await markPrompted();
    onClose();
    router.push(`/projects/${projectId}/settings`);
  }

  async function skip() {
    await markPrompted();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          Import project docs as knowledge?
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Found {fileCount} markdown file{fileCount === 1 ? "" : "s"} in this project (README,
          docs/, etc.). CCHQ can extract stable facts into this project's knowledge base so they're
          auto-injected into future sessions.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={skip}
            disabled={busy}
            className="text-xs px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={reviewFirst}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Review first
          </button>
          <button
            onClick={importAll}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import all"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into new-session-dialog**

Open `src/components/new-session-dialog.tsx`. Add an import at the top:

```typescript
import { IngestionPrompt } from "@/components/project/ingestion-prompt";
```

Add state near the top of the component:

```typescript
const [ingestionPromptProject, setIngestionPromptProject] = useState<{
  id: string;
  fileCount: number;
} | null>(null);
```

Find the handler that runs after a new project is created (where `finalProjectId` becomes known and we call `/api/projects`). Right AFTER a brand-new project is created (not the "pick existing" path), check for docs:

```typescript
// After creating a brand-new project, check for ingestable docs
if (showNewProject && finalProjectId) {
  try {
    const docsRes = await fetch(`/api/projects/${finalProjectId}/docs`);
    if (docsRes.ok) {
      const files = await docsRes.json();
      if (Array.isArray(files) && files.length > 0) {
        // Check that we haven't already prompted (safety; new projects default to false anyway)
        const projRes = await fetch(`/api/projects/${finalProjectId}`);
        if (projRes.ok) {
          const proj = await projRes.json();
          if (!proj.hasBeenIngestionPrompted) {
            setIngestionPromptProject({ id: finalProjectId, fileCount: files.length });
            return; // pause here — user decides, then we close and route
          }
        }
      }
    }
  } catch {
    // fail silently — don't block session creation
  }
}
```

Note: since `/api/projects/[id]` currently returns just the project row, you may need to verify that endpoint exists (Task 16's PATCH means GET likely already exists or is trivial to add). If a GET route doesn't exist, add a minimal one in `src/app/api/projects/[id]/route.ts`:

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}
```

Render the prompt at the end of the dialog JSX:

```tsx
{ingestionPromptProject && (
  <IngestionPrompt
    projectId={ingestionPromptProject.id}
    fileCount={ingestionPromptProject.fileCount}
    onClose={() => {
      setIngestionPromptProject(null);
      onClose();
      // After dismissal, continue with session creation or navigation
    }}
  />
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/project/ingestion-prompt.tsx src/components/new-session-dialog.tsx src/app/api/projects/[id]/route.ts
git commit -m "feat(ui): one-time ingestion prompt on project creation"
```

---

### Task 19: End-to-End Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Ensure dev server is running**

Run: `npm run dev`

Open http://localhost:3000.

- [ ] **Step 2: Test Docs tab**

1. Open any existing session
2. Click the **Docs** tab in the right sidebar
3. Verify at least `README.md`, `AGENTS.md`, `CLAUDE.md`, and files under `docs/` appear
4. Click one — markdown content renders inline
5. Click the "↗ Open" link — verify VS Code opens (if installed)

- [ ] **Step 3: Test Notes tab**

1. Click the **Notes** tab
2. Click "+ New note"
3. Enter a title and content
4. Click Save
5. Refresh the page — the note persists

- [ ] **Step 4: Test manual Remember**

1. In an active session, send a message like "Remember: we use Next.js 15 App Router with Drizzle ORM."
2. Wait for Claude to respond
3. Click the **🧠 Remember** button
4. An alert should say "Extracted N memories"
5. Navigate to `/knowledge` — the extracted entries should appear

- [ ] **Step 5: Test incremental extraction**

1. In an active session, send at least 10 message exchanges
2. Check the server logs for `[knowledge] incremental extract` activity (or just verify no errors)
3. Check `/knowledge` — new entries should appear

- [ ] **Step 6: Test auto-inject**

1. Create a new session on an existing project with `README.md`
2. Before sending, modify `README.md` to include a memorable sentence like "The magic number is 42."
3. Send a message like "What's the magic number?"
4. Claude should reference 42 — proving the doc was injected

- [ ] **Step 7: Test ingestion on project creation**

1. Create a new project pointing at a directory with multiple markdown files
2. On project creation, the ingestion prompt should appear
3. Click "Import all"
4. Verify new `origin=doc_seed` entries appear in `/knowledge`

- [ ] **Step 8: Test Project Settings**

1. Open `/projects/[id]/settings`
2. Add a new doc glob pattern, remove one, toggle Auto-Inject
3. Click "Scan & Ingest Docs", pick a subset, run ingestion
4. Verify entries created

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test adjustments"
```

---

## Self-Review Summary

**Spec coverage:**
- Slice 1 — Docs/Notes panels: Tasks 1–9 ✓
- Slice 2 — Knowledge extraction (manual, incremental, on-pause): Tasks 10–13 ✓
- Slice 3 — Ingestion, auto-inject, Project Settings: Tasks 14–18 ✓
- Data model (docGlobs, autoInjectDocs, hasBeenIngestionPrompted, origin enum, projectNotes): Task 1 ✓
- Path traversal guard: Task 3 (resolveDocPath) ✓
- Dedup in extraction: Task 10 (fetchExistingKnowledge + prompt template) ✓
- Auto-injection with char budget + ranking: Task 15 ✓

**Placeholders:** None in final pass. Every step has concrete code or commands.

**Type consistency:**
- `DocFile` type defined in scanner.ts, consumed by docs routes, DocsTab
- `ProjectNote` type defined in notes.ts, consumed by notes routes, NotesTab
- `ExtractedKnowledge` type defined in knowledge-extractor.ts, consumed throughout
- `origin` enum values consistent: `"session_extract" | "manual" | "doc_seed"` in schema + extractor

**E2E smoke test:** Task 19 covers all three slices end-to-end.
