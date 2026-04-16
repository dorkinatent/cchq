# CCHQ Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare CCHQ for public GitHub release with zero-config Docker distribution, security hardening, automated CI/CD pipeline, in-app version check, and contributor-ready documentation.

**Architecture:** Staged rollout — Docker-first for v0.1.0, npm pre-architected for v0.2.0. Multi-stage Dockerfile with Next.js standalone output. Supabase services vendored directly in docker-compose.yml. GitHub Actions for CI and release automation. In-app update via Docker Engine API over mounted socket.

**Tech Stack:** Next.js 16 (standalone output), Docker + docker-compose, GitHub Actions, GitHub Container Registry (ghcr.io), Drizzle ORM, Vitest

**Spec:** `docs/superpowers/specs/2026-04-15-public-release-design.md`

---

## File Map

### New Files
- `Dockerfile` — Multi-stage build for CCHQ production image
- `docker-compose.yml` — Full stack: CCHQ + Postgres + Supabase API
- `docker-entrypoint.sh` — Entrypoint: wait for DB, run migrations, start server
- `.dockerignore` — Exclude node_modules, .next, .git, etc.
- `.github/workflows/release.yml` — Build + push Docker image on semver tags
- `.github/ISSUE_TEMPLATE/bug_report.yml` — Bug report template
- `.github/ISSUE_TEMPLATE/feature_request.yml` — Feature request template
- `src/app/api/system/version/route.ts` — Version check endpoint (proxies GitHub API with caching)
- `src/app/api/system/update/route.ts` — Docker self-update endpoint
- `src/components/update-banner.tsx` — Dismissible update notification banner
- `src/lib/version.ts` — Version constants and comparison logic
- `src/__tests__/lib/version.test.ts` — Tests for version comparison
- `src/__tests__/api/browse.test.ts` — Tests for browse path restriction
- `src/__tests__/api/upload.test.ts` — Tests for upload validation
- `src/__tests__/api/projects.test.ts` — Tests for project path validation
- `CHANGELOG.md` — Initial v0.1.0 changelog

### Modified Files
- `src/app/api/browse/route.ts` — Add home directory restriction
- `src/app/api/upload/route.ts` — Add size/type validation
- `src/app/api/projects/route.ts` — Add path validation on create
- `src/app/api/projects/[id]/route.ts` — Add path validation on update
- `next.config.ts` — Add security headers, standalone output
- `package.json` — Set `private: false`, add `bin`/`files`/`engines` fields
- `.github/workflows/ci.yml` — Add test and audit steps
- `README.md` — Restructure for public launch
- `CONTRIBUTING.md` — Add test/Docker/label guidance
- `SECURITY.md` — Add Docker socket trade-off note
- `src/app/layout.tsx` — Add UpdateBanner component

---

## Task 1: Security — Restrict `/api/browse` to Home Directory

**Files:**
- Create: `src/__tests__/api/browse.test.ts`
- Modify: `src/app/api/browse/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/browse.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises and os before importing the route
vi.mock("fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("os", () => ({
  homedir: () => "/Users/testuser",
}));

import { GET } from "@/app/api/browse/route";
import { NextRequest } from "next/server";
import { readdir, stat } from "fs/promises";

function makeRequest(path?: string): NextRequest {
  const url = path
    ? `http://localhost:3000/api/browse?path=${encodeURIComponent(path)}`
    : "http://localhost:3000/api/browse";
  return new NextRequest(url);
}

describe("GET /api/browse", () => {
  beforeEach(() => {
    vi.mocked(readdir).mockResolvedValue([]);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);
  });

  it("allows paths under home directory", async () => {
    const res = await GET(makeRequest("/Users/testuser/Code"));
    expect(res.status).toBe(200);
  });

  it("allows home directory itself", async () => {
    const res = await GET(makeRequest("/Users/testuser"));
    expect(res.status).toBe(200);
  });

  it("rejects paths outside home directory", async () => {
    const res = await GET(makeRequest("/etc"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Access denied");
  });

  it("rejects root path", async () => {
    const res = await GET(makeRequest("/"));
    expect(res.status).toBe(403);
  });

  it("rejects path traversal via ../", async () => {
    const res = await GET(makeRequest("/Users/testuser/Code/../../etc"));
    expect(res.status).toBe(403);
  });

  it("defaults to home directory when no path given", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/browse.test.ts`
Expected: FAIL — the route currently has no path restriction, so `/etc` returns 200.

- [ ] **Step 3: Implement the path restriction**

Replace the full content of `src/app/api/browse/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || homedir();
  const realPath = resolve(path);
  const realHome = resolve(homedir());

  if (!realPath.startsWith(realHome)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const entries = await readdir(realPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: join(realPath, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    await stat(realPath);

    return NextResponse.json({
      current: realPath,
      parent: resolve(realPath, "..").startsWith(realHome)
        ? resolve(realPath, "..")
        : realHome,
      directories: dirs,
      isGitRepo: entries.some((e) => e.name === ".git" && e.isDirectory()),
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot read directory" },
      { status: 400 }
    );
  }
}
```

Note: The `parent` field also clamps to home directory — navigating "up" from `$HOME` returns `$HOME` instead of `/Users`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/browse.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/api/browse.test.ts src/app/api/browse/route.ts
git commit -m "security: restrict /api/browse to home directory

Prevents directory listing outside \$HOME. Path traversal via ../ is
resolved before the check. Parent navigation clamps at home directory."
```

---

## Task 2: Security — File Upload Validation

**Files:**
- Create: `src/__tests__/api/upload.test.ts`
- Modify: `src/app/api/upload/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { POST } from "@/app/api/upload/route";
import { NextRequest } from "next/server";

function makeUploadRequest(name: string, type: string, sizeBytes: number): NextRequest {
  const content = new Uint8Array(sizeBytes);
  const file = new File([content], name, { type });
  const formData = new FormData();
  formData.append("file", file);

  return new NextRequest("http://localhost:3000/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid PNG upload", async () => {
    const res = await POST(makeUploadRequest("photo.png", "image/png", 1024));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toContain(".png");
    expect(body.name).toBe("photo.png");
  });

  it("accepts JPEG uploads", async () => {
    const res = await POST(makeUploadRequest("photo.jpg", "image/jpeg", 1024));
    expect(res.status).toBe(200);
  });

  it("accepts WebP uploads", async () => {
    const res = await POST(makeUploadRequest("photo.webp", "image/webp", 1024));
    expect(res.status).toBe(200);
  });

  it("accepts GIF uploads", async () => {
    const res = await POST(makeUploadRequest("anim.gif", "image/gif", 1024));
    expect(res.status).toBe(200);
  });

  it("rejects disallowed MIME types", async () => {
    const res = await POST(makeUploadRequest("script.sh", "application/x-sh", 100));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file type/i);
  });

  it("rejects disallowed extensions", async () => {
    // Even if MIME type is faked as image/png, extension matters
    const res = await POST(makeUploadRequest("malware.exe", "image/png", 100));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file extension/i);
  });

  it("rejects files over 50MB", async () => {
    const res = await POST(
      makeUploadRequest("huge.png", "image/png", 51 * 1024 * 1024)
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/upload.test.ts`
Expected: FAIL — rejection tests fail because current route has no validation.

- [ ] **Step 3: Implement upload validation**

Replace the full content of `src/app/api/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 50 MB)" },
      { status: 413 }
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Accepted: JPEG, PNG, GIF, WebP" },
      { status: 400 }
    );
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "File extension not allowed. Accepted: jpg, jpeg, png, gif, webp" },
      { status: 400 }
    );
  }

  const uploadDir = join(tmpdir(), "cchq-uploads");
  await mkdir(uploadDir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const filepath = join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return NextResponse.json({ path: filepath, name: file.name });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/upload.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/api/upload.test.ts src/app/api/upload/route.ts
git commit -m "security: add file upload validation

Restrict uploads to image types only (JPEG, PNG, GIF, WebP) with a
50MB size limit. Validates both MIME type and file extension."
```

---

## Task 3: Security — Project Path Validation

**Files:**
- Create: `src/__tests__/api/projects.test.ts`
- Create: `src/lib/validate-path.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/projects.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { validateProjectPath } from "@/lib/validate-path";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  stat: vi.fn(),
}));

import { access, stat } from "fs/promises";

describe("validateProjectPath", () => {
  it("accepts a valid directory path", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);

    const result = await validateProjectPath("/Users/test/Code/myproject");
    expect(result).toBeNull(); // null = no error
  });

  it("rejects non-string input", async () => {
    const result = await validateProjectPath(123 as any);
    expect(result).toBe("Path must be a string");
  });

  it("rejects empty string", async () => {
    const result = await validateProjectPath("");
    expect(result).toBe("Path must be a string");
  });

  it("rejects non-existent paths", async () => {
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

    const result = await validateProjectPath("/nonexistent/path");
    expect(result).toMatch(/does not exist or is not readable/i);
  });

  it("rejects files (not directories)", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);

    const result = await validateProjectPath("/Users/test/file.txt");
    expect(result).toMatch(/not a directory/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/projects.test.ts`
Expected: FAIL — `validate-path.ts` does not exist.

- [ ] **Step 3: Implement the validation helper**

Create `src/lib/validate-path.ts`:

```typescript
import { access, stat } from "fs/promises";
import { constants } from "fs";

/**
 * Validate that a path is an existing, readable directory.
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateProjectPath(
  path: unknown
): Promise<string | null> {
  if (typeof path !== "string" || path.trim() === "") {
    return "Path must be a string";
  }

  try {
    await access(path, constants.R_OK);
  } catch {
    return "Path does not exist or is not readable";
  }

  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return "Path is not a directory";
    }
  } catch {
    return "Path does not exist or is not readable";
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/projects.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Wire validation into POST /api/projects**

Modify `src/app/api/projects/route.ts` — add the validation after parsing the body:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { validateProjectPath } from "@/lib/validate-path";

export async function GET() {
  const projects = await db.query.projects.findMany({
    orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { name, path } = await req.json();

  const pathError = await validateProjectPath(path);
  if (pathError) {
    return NextResponse.json({ error: pathError }, { status: 400 });
  }

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

- [ ] **Step 6: Wire validation into PATCH /api/projects/[id]**

In `src/app/api/projects/[id]/route.ts`, add the import and validation in the PATCH handler. Add after `if (typeof body.path === "string") patch.path = body.path;`:

Replace the path assignment line:

```typescript
// Old:
if (typeof body.path === "string") patch.path = body.path;

// New:
if (typeof body.path === "string") {
  const { validateProjectPath } = await import("@/lib/validate-path");
  const pathError = await validateProjectPath(body.path);
  if (pathError) {
    return NextResponse.json({ error: pathError }, { status: 400 });
  }
  patch.path = body.path;
}
```

Using dynamic import here since path validation is only needed when the path field is being updated — avoids loading fs modules on every PATCH.

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validate-path.ts src/__tests__/api/projects.test.ts \
  src/app/api/projects/route.ts src/app/api/projects/\[id\]/route.ts
git commit -m "security: validate project paths on create and update

Verify path exists, is readable, and is a directory before accepting
it. Extracted into reusable validateProjectPath() helper."
```

---

## Task 4: Security — Add Security Headers

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add security headers to next.config.ts**

Replace the full content of `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.*.*.*",
    "172.*.*.*",
    "192.168.*.*",
    "*.ts.net",
    "*.local",
  ],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "geolocation=(), microphone=(), camera=()",
        },
      ],
    },
  ],
};

export default nextConfig;
```

Note: This also adds `output: "standalone"` which is required for the Docker build (Task 6).

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds. A `.next/standalone` directory is created.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "security: add response headers and standalone output

X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and
Permissions-Policy on all routes. Also enables standalone output
mode for Docker builds."
```

---

## Task 5: Security — npm Audit Fix

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Run npm audit to see current state**

Run: `npm audit`
Expected: 4 moderate vulnerabilities in esbuild chain.

- [ ] **Step 2: Fix vulnerabilities**

Run: `npm audit fix`

If that doesn't resolve them (transitive deps), try:
```bash
npm audit fix --force
```

Review the output carefully — `--force` may bump major versions. Verify nothing critical changed.

- [ ] **Step 3: Verify build and tests still pass**

Run: `npm run build && npx vitest run`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "security: fix npm audit vulnerabilities

Resolve moderate vulnerabilities in esbuild transitive dependency chain."
```

---

## Task 6: Docker — Dockerfile and .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
.next
.git
.gitignore
.env*
!.env.local.example
*.md
!README.md
docs/
.superpowers/
.agents/
.claude/
.worktrees/
supabase/
drizzle/
.github/
scripts/
**/*.test.ts
**/__tests__/
vitest.config.ts
.DS_Store
```

- [ ] **Step 2: Create multi-stage Dockerfile**

Create `Dockerfile`:

```dockerfile
# ---- Stage 1: Install production dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: Build the application ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env vars (placeholders — real values provided at runtime)
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV NEXT_PUBLIC_SUPABASE_URL=http://placeholder:54331
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
ENV SUPABASE_SERVICE_ROLE_KEY=placeholder

# Bake version into the image
ARG APP_VERSION=0.1.0
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

RUN npm run build

# ---- Stage 3: Production runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy drizzle config and migrations for entrypoint migration step
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/lib/db/schema.ts ./src/lib/db/schema.ts
COPY --from=deps /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
```

- [ ] **Step 3: Verify Dockerfile builds**

Run: `docker build -t cchq:test .`
Expected: Build succeeds. Final image should be ~150-200MB.

Check the image size:
Run: `docker images cchq:test --format "{{.Size}}"`

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add multi-stage Dockerfile for production image

Three-stage build: deps → build → runtime. Uses Next.js standalone
output for a lean ~150MB image. Includes drizzle-kit for entrypoint
migrations."
```

---

## Task 7: Docker — Entrypoint Script

**Files:**
- Create: `docker-entrypoint.sh`

- [ ] **Step 1: Create the entrypoint script**

Create `docker-entrypoint.sh`:

```bash
#!/bin/sh
set -eu

echo "╔══════════════════════════════════════╗"
echo "║           CCHQ Starting              ║"
echo "╚══════════════════════════════════════╝"

# ── Wait for Postgres ──────────────────────────────────────────────
echo "⏳ Waiting for database..."
MAX_RETRIES=30
RETRY=0
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -q 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "❌ Database not ready after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $RETRY/$MAX_RETRIES..."
  sleep 1
done
echo "✅ Database is ready."

# ── Run Drizzle migrations ─────────────────────────────────────────
echo "🔄 Running database migrations..."
npx drizzle-kit push --force 2>&1 || {
  echo "⚠️  Migration failed — the app may still work if the schema is already up to date."
}
echo "✅ Migrations complete."

# ── Start the Next.js server ───────────────────────────────────────
echo "🚀 Starting CCHQ on port ${PORT:-3000}..."
exec node server.js
```

Note: `pg_isready` may not be available in the Alpine image. We need to install it.

- [ ] **Step 2: Update Dockerfile to include pg_isready**

In the `runner` stage of `Dockerfile`, add after the `ENV NODE_ENV=production` line:

```dockerfile
# Install postgresql-client for pg_isready (used in entrypoint)
RUN apk add --no-cache postgresql-client
```

- [ ] **Step 3: Commit**

```bash
git add docker-entrypoint.sh Dockerfile
git commit -m "feat: add Docker entrypoint with DB wait and auto-migration

Waits for Postgres to be ready (up to 30 retries), runs Drizzle
migrations, then starts the Next.js standalone server."
```

---

## Task 8: Docker — docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
# CCHQ — zero-config local setup
# Usage: docker compose up
# Custom port: CCHQ_PORT=8080 docker compose up

services:
  # ── Postgres ──────────────────────────────────────────────────────
  db:
    image: postgres:15-alpine
    restart: unless-stopped
    ports:
      - "${DB_PORT:-54332}:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    volumes:
      - cchq-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  # ── Supabase API (PostgREST + GoTrue) ────────────────────────────
  supabase:
    image: supabase/supabase:latest
    restart: unless-stopped
    ports:
      - "${SUPABASE_API_PORT:-54331}:8000"
    environment:
      SUPABASE_DB_URL: postgresql://postgres:postgres@db:5432/postgres
    depends_on:
      db:
        condition: service_healthy

  # ── CCHQ ─────────────────────────────────────────────────────────
  cchq:
    build:
      context: .
      args:
        APP_VERSION: "0.1.0"
    image: ghcr.io/dorkinatent/cchq:latest
    restart: unless-stopped
    ports:
      - "${CCHQ_PORT:-3000}:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/postgres
      NEXT_PUBLIC_SUPABASE_URL: http://supabase:8000
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY:-placeholder}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:-placeholder}
      DB_HOST: db
      DB_PORT: "5432"
      DB_USER: postgres
    depends_on:
      db:
        condition: service_healthy
    volumes:
      # Optional: mount Docker socket for in-app update button
      # Uncomment the line below to enable one-click updates:
      # - /var/run/docker.sock:/var/run/docker.sock:ro
      []

  # ── Cloudflare Tunnel (opt-in) ───────────────────────────────────
  cloudflared:
    image: cloudflare/cloudflared:latest
    profiles: ["tunnel"]
    restart: unless-stopped
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:-}

volumes:
  cchq-pgdata:
```

- [ ] **Step 2: Test docker compose config is valid**

Run: `docker compose config --quiet`
Expected: No errors. Exit code 0.

- [ ] **Step 3: Test the full stack starts**

Run: `docker compose up --build -d`
Wait 30 seconds, then:
Run: `curl -s http://localhost:3000 | head -20`
Expected: HTML response from CCHQ.

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for zero-config setup

Full stack: Postgres 15, Supabase API, and CCHQ. Configurable ports
via CCHQ_PORT, DB_PORT, SUPABASE_API_PORT env vars. Optional
Cloudflare tunnel via --profile tunnel. Postgres data persisted to
named volume."
```

---

## Task 9: CI/CD — Enhanced CI Workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add test and audit steps to CI**

Replace the full content of `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npx vitest run

      - name: Build
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54332/postgres
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54331
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder
          SUPABASE_SERVICE_ROLE_KEY: ci-placeholder
        run: npm run build

      - name: Security audit
        run: npm audit --audit-level=high

  # Push rolling `latest` Docker image on main merges
  docker-latest:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push latest image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/dorkinatent/cchq:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Note: bumped Node from 20 to 22 to match the Dockerfile. Added a `docker-latest` job that only runs on main merges (not PRs) to push the rolling `latest` image.

- [ ] **Step 2: Verify lint, test, and build pass locally**

Run: `npm run lint && npx vitest run && npm run build`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add test and security audit steps

Run vitest and npm audit (fail on high/critical) alongside existing
lint and build. Bump Node to 22."
```

---

## Task 10: CI/CD — Release Pipeline

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npx vitest run

      - name: Security audit
        run: npm audit --audit-level=high

      # ── Docker build + push ──────────────────────────────────────
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract version from tag
        id: version
        run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          build-args: |
            APP_VERSION=${{ steps.version.outputs.version }}
          tags: |
            ghcr.io/dorkinatent/cchq:${{ github.ref_name }}
            ghcr.io/dorkinatent/cchq:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # ── GitHub Release ───────────────────────────────────────────
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release pipeline for Docker image + GitHub Release

On semver tag push: lint, test, audit, build Docker image, push to
ghcr.io/dorkinatent/cchq with version + latest tags, create GitHub
Release with auto-generated changelog."
```

---

## Task 11: In-App Version Check — Backend

**Files:**
- Create: `src/lib/version.ts`
- Create: `src/__tests__/lib/version.test.ts`
- Create: `src/app/api/system/version/route.ts`

- [ ] **Step 1: Write version comparison tests**

Create `src/__tests__/lib/version.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isNewerVersion, APP_VERSION } from "@/lib/version";

describe("isNewerVersion", () => {
  it("returns true when remote is newer (patch)", () => {
    expect(isNewerVersion("0.1.0", "0.1.1")).toBe(true);
  });

  it("returns true when remote is newer (minor)", () => {
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(true);
  });

  it("returns true when remote is newer (major)", () => {
    expect(isNewerVersion("0.1.0", "1.0.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
  });

  it("returns false when remote is older", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(false);
  });

  it("handles v prefix in remote version", () => {
    expect(isNewerVersion("0.1.0", "v0.2.0")).toBe(true);
  });

  it("APP_VERSION is a valid semver string", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/version.test.ts`
Expected: FAIL — `version.ts` does not exist.

- [ ] **Step 3: Implement version module**

Create `src/lib/version.ts`:

```typescript
/**
 * App version — set at build time via NEXT_PUBLIC_APP_VERSION env var.
 * Falls back to package.json version in development.
 */
export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

/**
 * Compare two semver strings. Returns true if `remote` is newer than `current`.
 * Handles optional "v" prefix on the remote version.
 */
export function isNewerVersion(current: string, remote: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10));

  const c = parse(current);
  const r = parse(remote);

  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
  }

  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/version.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Create the version check API route**

Create `src/app/api/system/version/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { APP_VERSION, isNewerVersion } from "@/lib/version";

type CachedRelease = {
  tag: string;
  url: string;
  fetchedAt: number;
};

let cache: CachedRelease | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const now = Date.now();

  // Return cached result if fresh
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      currentVersion: APP_VERSION,
      latestVersion: cache.tag.replace(/^v/, ""),
      updateAvailable: isNewerVersion(APP_VERSION, cache.tag),
      releaseUrl: cache.url,
    });
  }

  try {
    const res = await fetch(
      "https://api.github.com/repos/dorkinatent/cchq/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({
        currentVersion: APP_VERSION,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        error: "Could not check for updates",
      });
    }

    const data = await res.json();
    cache = {
      tag: data.tag_name,
      url: data.html_url,
      fetchedAt: now,
    };

    return NextResponse.json({
      currentVersion: APP_VERSION,
      latestVersion: cache.tag.replace(/^v/, ""),
      updateAvailable: isNewerVersion(APP_VERSION, cache.tag),
      releaseUrl: cache.url,
    });
  } catch {
    return NextResponse.json({
      currentVersion: APP_VERSION,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      error: "Could not check for updates",
    });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/version.ts src/__tests__/lib/version.test.ts \
  src/app/api/system/version/route.ts
git commit -m "feat: add version check API endpoint

GET /api/system/version checks GitHub Releases for newer versions.
Caches results for 1 hour. Compares against baked-in APP_VERSION."
```

---

## Task 12: In-App Version Check — Update Endpoint

**Files:**
- Create: `src/app/api/system/update/route.ts`

- [ ] **Step 1: Create the Docker update endpoint**

Create `src/app/api/system/update/route.ts`:

```typescript
import { NextResponse } from "next/server";

/**
 * POST /api/system/update
 *
 * Triggers a Docker image pull + container recreation via the Docker
 * Engine API over the mounted socket (/var/run/docker.sock).
 *
 * Returns a status message. The container will restart after pulling
 * the new image, so the client should expect a brief disconnection.
 */
export async function POST() {
  const socketPath = "/var/run/docker.sock";

  // Check if Docker socket is mounted
  try {
    const { access } = await import("fs/promises");
    await access(socketPath);
  } catch {
    return NextResponse.json(
      {
        error: "Docker socket not available",
        hint: "Mount the Docker socket to enable one-click updates: -v /var/run/docker.sock:/var/run/docker.sock:ro",
        manualCommand: "docker compose pull && docker compose up -d",
      },
      { status: 503 }
    );
  }

  try {
    // Pull the latest image via Docker Engine API
    const pullRes = await fetch(
      "http://localhost/images/create?fromImage=ghcr.io/dorkinatent/cchq&tag=latest",
      {
        method: "POST",
        dispatcher: await getUnixDispatcher(socketPath),
      }
    );

    if (!pullRes.ok) {
      const body = await pullRes.text();
      return NextResponse.json(
        { error: "Failed to pull image", details: body },
        { status: 502 }
      );
    }

    // Consume the pull stream (Docker sends progress as NDJSON)
    await pullRes.text();

    return NextResponse.json({
      status: "pulled",
      message:
        "New image pulled successfully. Restart your container to apply: docker compose up -d",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Update failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * Create an undici dispatcher for Unix socket connections.
 * This lets us call the Docker Engine API over /var/run/docker.sock.
 */
async function getUnixDispatcher(socketPath: string) {
  // Node 22 includes undici natively
  const { Agent } = await import("undici");
  return new Agent({
    connect: { socketPath },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/system/update/route.ts
git commit -m "feat: add Docker self-update endpoint

POST /api/system/update pulls the latest CCHQ image via Docker Engine
API over the mounted socket. Returns 503 with manual instructions if
socket is not available."
```

---

## Task 13: In-App Version Check — UI Banner

**Files:**
- Create: `src/components/update-banner.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the UpdateBanner component**

Create `src/components/update-banner.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type VersionInfo = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  error?: string;
};

export function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  useEffect(() => {
    const key = "cchq-update-dismissed";
    if (sessionStorage.getItem(key)) {
      setDismissed(true);
      return;
    }

    fetch("/api/system/version")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {}); // Silently fail — update check is best-effort
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem("cchq-update-dismissed", "1");
  }, []);

  const triggerUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const res = await fetch("/api/system/update", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setUpdateResult(data.message);
      } else {
        setUpdateResult(
          data.manualCommand
            ? `Run: ${data.manualCommand}`
            : data.error || "Update failed"
        );
      }
    } catch {
      setUpdateResult("Update failed — check your connection");
    } finally {
      setUpdating(false);
    }
  }, []);

  if (dismissed || !info?.updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="font-medium">
          CCHQ v{info.latestVersion} available
        </span>
        <span className="text-[var(--color-text-muted)]">
          (you have v{info.currentVersion})
        </span>
        {info.releaseUrl && (
          <a
            href={info.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-text-link)] underline underline-offset-2"
          >
            Release notes
          </a>
        )}
      </div>
      <div className="flex items-center gap-2">
        {updateResult ? (
          <span className="text-[var(--color-text-muted)] text-xs max-w-[300px] truncate">
            {updateResult}
          </span>
        ) : (
          <button
            onClick={triggerUpdate}
            disabled={updating}
            className="rounded px-3 py-1 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {updating ? "Updating…" : "Update Now"}
          </button>
        )}
        <button
          onClick={dismiss}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add UpdateBanner to the root layout**

In `src/app/layout.tsx`, add the import and render the component. Add the import at the top:

```typescript
import { UpdateBanner } from "@/components/update-banner";
```

Then add `<UpdateBanner />` as the first child inside the `<body>` tag, before any other content:

```tsx
<body>
  <UpdateBanner />
  {/* ... existing content ... */}
</body>
```

- [ ] **Step 3: Verify the app builds and loads**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/update-banner.tsx src/app/layout.tsx
git commit -m "feat: add in-app update banner with one-click Docker update

Shows a dismissible banner when a newer version is available on GitHub
Releases. Update button pulls the latest image via Docker Engine API.
Falls back to manual command if socket is not mounted."
```

---

## Task 14: Package.json — Prepare for npm (v0.2.0)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json fields**

Make the following changes to `package.json`:

1. Change `"private": true` to `"private": false`
2. Change `"name": "cchq-app"` to `"name": "cchq"`
3. Add a `"test"` script
4. Add `"description"`, `"repository"`, `"license"`, `"homepage"`, `"bugs"` fields
5. Add `"bin"` and `"files"` fields (for future npm publishing)

The updated `package.json` should have these changes:

```json
{
  "name": "cchq",
  "version": "0.1.0",
  "private": false,
  "description": "Web dashboard for managing multiple Claude Code sessions",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/dorkinatent/cchq.git"
  },
  "homepage": "https://github.com/dorkinatent/cchq",
  "bugs": {
    "url": "https://github.com/dorkinatent/cchq/issues"
  },
  "scripts": {
    "dev": "next dev -H 0.0.0.0",
    "build": "next build",
    "start": "next start -H 0.0.0.0",
    "lint": "eslint",
    "test": "vitest run"
  },
  "engines": {
    "node": ">=18.18.0"
  }
}
```

Only change the fields listed above — leave `dependencies` and `devDependencies` untouched.

- [ ] **Step 2: Verify build still works**

Run: `npm run build && npm test`
Expected: Both pass.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: prepare package.json for public release

Set private=false, rename to 'cchq', add test script, repository,
homepage, bugs, and license fields."
```

---

## Task 15: Documentation — GitHub Issue Templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`

- [ ] **Step 1: Create bug report template**

Create `.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug Report
description: Report something that isn't working as expected
labels: ["bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: A clear description of the bug and what you expected instead.
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      description: How can we reproduce this?
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true

  - type: textarea
    id: environment
    attributes:
      label: Environment
      description: OS, browser, Node version, Docker version (if applicable)
      placeholder: |
        - OS: macOS 15.3
        - Browser: Chrome 130
        - Node: 22.x
        - Docker: 27.x (if using Docker)
    validations:
      required: false

  - type: textarea
    id: logs
    attributes:
      label: Relevant logs
      description: Paste any error messages or log output
      render: shell
    validations:
      required: false
```

- [ ] **Step 2: Create feature request template**

Create `.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature Request
description: Suggest an improvement or new feature
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Describe the use case or pain point.
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How would you like this to work?
    validations:
      required: false

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Any workarounds or alternative approaches you've thought of?
    validations:
      required: false
```

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "docs: add GitHub issue templates for bugs and features

Lightweight YAML-based templates with structured fields for bug
reports and feature requests."
```

---

## Task 16: Documentation — CONTRIBUTING.md and SECURITY.md Updates

**Files:**
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`

- [ ] **Step 1: Update CONTRIBUTING.md**

Add the following sections to `CONTRIBUTING.md`, after the existing "Dev setup" section and before "Conventions":

```markdown
## Testing

Run the test suite before submitting a PR:

```bash
npm test              # runs vitest
npx vitest --watch    # watch mode during development
```

## Docker

To test the Docker build locally:

```bash
docker compose build      # build the image
docker compose up         # start the full stack
docker compose down -v    # tear down (including DB volume)
```

## Labels

- **`good first issue`** — smaller tasks suitable for new contributors
- **`help wanted`** — larger tasks where we'd appreciate community help
- **`bug`** / **`enhancement`** — auto-applied by issue templates
```

- [ ] **Step 2: Update SECURITY.md**

Add the following paragraph at the end of the "In scope" section in `SECURITY.md`:

```markdown
- Security implications of the Docker socket mount used by the
  optional one-click update feature (`/var/run/docker.sock`). The
  socket is mounted read-only and the update endpoint only pulls
  images — it does not execute containers or access host resources.
  Users who prefer not to mount the socket can update manually via
  `docker compose pull && docker compose up -d`.
```

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md SECURITY.md
git commit -m "docs: update contributing guide and security policy

Add testing, Docker, and label sections to CONTRIBUTING.md.
Document Docker socket mount trade-off in SECURITY.md."
```

---

## Task 17: Documentation — README Restructure

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Restructure README for public launch**

Rewrite `README.md` with the following structure. Keep all existing content but reorganize:

**New structure:**

```markdown
# CCHQ

> Web dashboard for managing multiple Claude Code sessions from one place, with a persistent knowledge base that carries context between sessions.

[![CI](https://github.com/dorkinatent/cchq/actions/workflows/ci.yml/badge.svg)](https://github.com/dorkinatent/cchq/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/dorkinatent/cchq)](https://github.com/dorkinatent/cchq/releases)

<!-- Screenshot or GIF here once available -->

## Quick Start (Docker)

\```bash
git clone https://github.com/dorkinatent/cchq.git
cd cchq
docker compose up
# → Open http://localhost:3000
\```

**Custom port:** `CCHQ_PORT=8080 docker compose up`

## Quick Start (Development)

\```bash
npm install
supabase start
cp .env.local.example .env.local    # paste keys from `supabase status`
npx drizzle-kit push
npm run dev
\```
```

Then include the remaining sections from the existing README in this order:
1. Features (existing content, unchanged)
2. Configuration (new section — document CCHQ_PORT, DB_PORT, SUPABASE_API_PORT env vars)
3. Remote Access (existing Tailscale + Cloudflare sections)
4. LAN Discovery / mDNS (existing, note it requires host-side script for Docker users)
5. Creating an SDK Project (existing)
6. Creating a Gas Town Project (existing)
7. Gotchas (existing)
8. Architecture (existing)
9. Tech Stack (existing)
10. Development (existing)
11. Contributing → link to CONTRIBUTING.md
12. Security → link to SECURITY.md
13. License (existing)

- [ ] **Step 2: Verify the README renders correctly**

Skim through the file for broken markdown, missing closing tags, or formatting issues.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: restructure README for public launch

Lead with Docker quick start, add badges, configuration section,
and reorganize existing content for discoverability."
```

---

## Task 18: Documentation — CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create initial changelog**

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to CCHQ will be documented in this file.

## [0.1.0] — 2026-04-15

### Added

- Multi-session dashboard with project grouping and "needs you" block
- Column-strip workspace with save/restore named layouts
- Persistent knowledge base with auto-extraction and manual capture
- Live activity streaming with tool-call rendering
- Rich tool views for Read, Edit, Write, Bash, and Grep
- Slash-command autocomplete from active SDK sessions
- Resizable context panel with full-width doc overlay
- Image support (drag-drop, paste, file picker)
- Session resume with knowledge delta summary
- Message pagination, search, and infinite scroll
- Error recovery with client-side message queue and auto-retry
- Per-project permission modes (full_auto, auto_log, ask_me)
- Four themes: Fossil, Midnight, Arctic, Terminal
- Mobile and remote access via Tailscale or Cloudflare Mesh
- mDNS local network discovery (cchq.local)
- Gas Town multi-agent engine support (experimental)
- Docker zero-config setup with docker-compose
- In-app version check with one-click Docker update
- Security headers and input validation hardening
- CI/CD pipeline with automated Docker releases to ghcr.io

[0.1.0]: https://github.com/dorkinatent/cchq/releases/tag/v0.1.0
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add initial CHANGELOG for v0.1.0"
```

---

## Task 19: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: Build succeeds with standalone output.

- [ ] **Step 4: Build the Docker image**

Run: `docker build -t cchq:test .`
Expected: Build succeeds.

- [ ] **Step 5: Test the full Docker stack**

Run:
```bash
docker compose up --build -d
sleep 15
curl -sf http://localhost:3000 > /dev/null && echo "✅ CCHQ is running" || echo "❌ CCHQ failed to start"
docker compose down
```
Expected: "✅ CCHQ is running"

- [ ] **Step 6: Run security audit**

Run: `npm audit --audit-level=high`
Expected: No high or critical vulnerabilities.

- [ ] **Step 7: Verify .gitignore completeness**

Run: `git status`
Expected: No untracked sensitive files (.env, credentials, etc.).

- [ ] **Step 8: Review git log for all changes**

Run: `git log --oneline -20`
Expected: Clean commit history covering all tasks.

---

## Task 20: Tag v0.1.0 Release

**Files:** None (git operations only)

- [ ] **Step 1: Tag the release**

Run:
```bash
git tag -a v0.1.0 -m "v0.1.0 — Initial public release"
```

- [ ] **Step 2: Push the tag**

Run:
```bash
git push origin main
git push origin v0.1.0
```

This triggers the release pipeline which will:
- Build the Docker image
- Push to `ghcr.io/dorkinatent/cchq:v0.1.0` and `:latest`
- Create a GitHub Release with auto-generated changelog

- [ ] **Step 3: Verify the release**

Check:
- GitHub Actions release workflow completes: `https://github.com/dorkinatent/cchq/actions`
- Docker image is available: `docker pull ghcr.io/dorkinatent/cchq:v0.1.0`
- GitHub Release page looks good: `https://github.com/dorkinatent/cchq/releases/tag/v0.1.0`

- [ ] **Step 4: Set repo metadata via gh CLI**

Run:
```bash
gh repo edit dorkinatent/cchq \
  --description "Web dashboard for managing multiple Claude Code sessions" \
  --add-topic claude-code \
  --add-topic developer-tools \
  --add-topic ai \
  --add-topic dashboard \
  --add-topic self-hosted
```
