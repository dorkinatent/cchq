# CCHQ Public Release — Design Spec

**Date:** 2026-04-15
**Status:** Draft
**Version:** v0.1.0 (initial public release)

## Overview

Prepare CCHQ for public release on GitHub (`github.com/dorkinatent/cchq`) as both a usable self-hosted product and an open-source project with contributor workflows. The release follows a staged rollout: Docker-first distribution for v0.1.0, with npm publishing pre-architected for a v0.2.0 fast-follow.

### Goals

- **Zero-config Docker experience:** `docker compose up` gives you a fully working CCHQ with Postgres and Supabase — no manual setup.
- **Security hardening:** Fix the medium-severity findings from the security audit before going public.
- **Automated releases:** Semver tags push Docker images to ghcr.io, plus a rolling `latest` that tracks `main`.
- **In-app updates:** Version check banner with a one-click update button for Docker users.
- **Contributor-ready:** Updated docs, issue templates, and CI that runs tests.

### Non-Goals

- Authentication layer (CCHQ is a single-user local tool by design)
- npm distribution (deferred to v0.2.0)
- Auto-update without user action
- Rate limiting
- Strict CSP (impractical with Next.js inline styles/scripts)

---

## 1. Docker Packaging & Zero-Config Setup

### 1.1 Container Architecture

```
docker compose up
├── cchq           (Next.js app, port 3000)
├── supabase-db    (Postgres 15, port 54332)
├── supabase-api   (PostgREST + GoTrue, port 54331)
└── supabase-studio (optional, port 54323)
```

We vendor the relevant Supabase services (Postgres, PostgREST/GoTrue) directly in our `docker-compose.yml` using Supabase's official Docker images with pinned versions. This keeps everything in a single compose file — no external dependency on Supabase's compose repo. We maintain image version pins; Supabase handles their image builds.

### 1.2 Dockerfile

Multi-stage build targeting a lean production image (~150MB):

1. **Stage 1 — deps:** `node:22-alpine`, install production dependencies only via `npm ci --omit=dev`.
2. **Stage 2 — build:** Copy source, run `next build` with `output: 'standalone'` in next.config.ts.
3. **Stage 3 — runtime:** Copy standalone output + `public/` + `.next/static`. Minimal Alpine base.

The `standalone` output mode bundles only the Node modules the app imports, keeping the image small.

### 1.3 docker-compose.yml

- Single file at the repo root.
- CCHQ service `depends_on` supabase-db with healthcheck (`pg_isready`).
- **Entrypoint script** (`docker-entrypoint.sh`):
  1. Waits for Postgres readiness.
  2. Runs Drizzle migrations (`npx drizzle-kit push`).
  3. Starts the Next.js production server.
- All environment variables have sensible defaults:
  - Default Supabase keys suitable for local-only use (same as `supabase start` generates). Users deploying beyond localhost should generate their own keys and set them via `.env`.
  - `DATABASE_URL` pre-configured to the compose Postgres service.
  - Port 3000 for the web UI.
- **Volumes:** Postgres data persisted to a named Docker volume (`cchq-pgdata`).

### 1.4 First-Run Experience

```bash
git clone https://github.com/dorkinatent/cchq.git
cd cchq
docker compose up
# → Open http://localhost:3000
```

No `.env` file required. No manual DB setup. No key generation. Customization via optional `.env` file or environment variable overrides.

### 1.5 Networking Add-Ons

All optional, the default compose file uses standard bridge networking.

**Tailscale (remote access):**
- **Quick path:** Host networking (`network_mode: host`) — CCHQ binds to host interfaces, Tailscale just works.
- **Clean path:** `docker-compose.tailscale.yml` override with a `tailscale/tailscale` sidecar container sharing a network namespace with CCHQ.
- Both documented; user picks based on preference.

**Cloudflare Tunnel:**
- `cloudflared` runs as a container with compose profile `tunnel`.
- Opt-in: `docker compose --profile tunnel up`.
- User provides their tunnel token via `CLOUDFLARE_TUNNEL_TOKEN` env var.

**mDNS (.local discovery):**
- **Docker users:** mDNS requires multicast UDP on the LAN, which Docker bridge networking blocks. Rather than requiring host networking for the main app, users run `./scripts/setup-hostname.sh` on the host (one-time setup). Documented as an optional step.
- **npm users (v0.2.0):** mDNS works natively since Node runs directly on the host. This is a natural advantage of the npm distribution path.

---

## 2. Security Hardening

Fixes for the medium-severity findings from the pre-release security audit. No critical blockers were found.

### 2.1 Restrict `/api/browse` to Home Directory

**File:** `src/app/api/browse/route.ts`

Currently allows listing any directory on the system. Fix: resolve the requested path and reject anything outside `$HOME`.

```typescript
const realPath = resolve(basePath);
const realHome = resolve(homedir());
if (!realPath.startsWith(realHome)) {
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
```

No behavioral change for normal usage — the file browser already defaults to `$HOME`.

### 2.2 File Upload Validation

**File:** `src/app/api/upload/route.ts`

Add guardrails:
- **Max file size:** 50MB.
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- **Allowed extensions:** `jpg`, `jpeg`, `png`, `gif`, `webp`.
- Return `413` for oversized files, `400` for disallowed types.

### 2.3 Project Path Validation

**Files:** `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`

When creating or updating a project, verify:
- Path is a string.
- Path exists on the filesystem.
- Path is a directory (not a file).
- Path is readable.

Return `400` with a clear error message on failure.

### 2.4 Security Headers

**File:** `next.config.ts`

Add response headers via Next.js `headers()` config:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

Applied to all routes (`/:path*`).

### 2.5 npm Audit Fix

Run `npm audit fix` to resolve the 4 moderate vulnerabilities in the esbuild transitive dependency chain (dev-only, via drizzle-kit). Commit the lockfile changes.

---

## 3. CI/CD & Release Pipeline

### 3.1 Enhanced CI Workflow

**File:** `.github/workflows/ci.yml`

Add to the existing lint + build pipeline:
- **Test step:** `npm test` (vitest, already configured but not in CI).
- **Audit step:** `npm audit --audit-level=high` — fail the build on high/critical vulnerabilities.

```
On push to main / PR:
  ├── lint (existing)
  ├── build (existing)
  ├── test (NEW)
  └── npm audit (NEW)
```

### 3.2 Release Pipeline

**File:** `.github/workflows/release.yml` (new)

Triggered by pushing a semver tag:

```
On tag v*:
  ├── Run full CI (lint, build, test, audit)
  ├── Build Docker image (multi-stage Dockerfile)
  ├── Push to ghcr.io/dorkinatent/cchq:<tag>
  ├── Push to ghcr.io/dorkinatent/cchq:latest
  └── Create GitHub Release with auto-generated changelog
```

**Release process:**
```bash
git tag v0.1.0
git push origin v0.1.0
# → CI builds image, pushes to ghcr.io, creates GitHub Release
```

### 3.3 Rolling `latest` Image

Every merge to `main` builds and pushes `ghcr.io/dorkinatent/cchq:latest`. Bleeding-edge users track `main` without building from source:

```bash
docker compose pull && docker compose up -d
```

### 3.4 In-App Version Check & Update

**Version check:**
- On app load, fetch `https://api.github.com/repos/dorkinatent/cchq/releases/latest`.
- Cache result (max one check per hour).
- Compare release tag against baked-in `APP_VERSION` (set at Docker build time from `package.json` version).
- If newer version exists, show a dismissible banner with release notes link.

**One-click update button:**
- Banner includes an "Update Now" button.
- Button hits `POST /api/system/update`.
- Endpoint calls the Docker Engine API via the mounted socket (`/var/run/docker.sock`) to:
  1. Pull the new `cchq` image.
  2. Recreate the CCHQ container with the new image.
- **Requires:** Docker socket mount in compose (`/var/run/docker.sock:/var/run/docker.sock:ro`). Read-only mount.
- **If socket not mounted:** Banner shows but button is hidden/disabled. User gets a copy-pasteable `docker compose pull && docker compose up -d` command instead.
- Docker socket mount documented as optional with clear trade-off explanation.

### 3.5 npm Publishing (Pre-Architected for v0.2.0)

Set up now, don't activate:
- `package.json`: set `"private": false`, add `"bin"`, `"files"`, `"engines"` fields.
- CI: stub an npm publish job gated behind a manual workflow dispatch.
- Extract startup/config logic into `src/cli/` so it's reusable by both the Docker entrypoint and the future CLI.

---

## 4. Documentation & Contributor Experience

### 4.1 README Restructure

**Hero section:**
- One-line description of what CCHQ is and who it's for.
- Screenshot or GIF of the dashboard.
- Badges: license, CI status, latest release, Docker pulls.

**Quick Start (Docker):**
```bash
git clone https://github.com/dorkinatent/cchq.git
cd cchq
docker compose up
# → http://localhost:3000
```

**Sections below the fold:**
- Features overview (keep existing content).
- Configuration & customization (env vars, ports).
- Remote access: Tailscale (recommended), Cloudflare tunnel, mDNS.
- Architecture diagram (keep existing).
- Development setup (for contributors — `npm install` flow).
- Contributing link → `CONTRIBUTING.md`.

### 4.2 CONTRIBUTING.md Updates

Add to the existing (already solid) guide:
- "Good First Issue" label convention.
- How to run tests locally (`npm test`).
- How to test the Docker build locally (`docker compose build`).
- Branch naming convention (if applicable).

### 4.3 SECURITY.md Update

Add a note about the Docker socket mount trade-off for the self-update feature.

### 4.4 GitHub Repository Setup

Before going public:
- **Topics:** `claude-code`, `developer-tools`, `ai`, `dashboard`, `self-hosted`.
- **Description:** "Web dashboard for managing multiple Claude Code sessions."
- **Issue templates:** Bug report and feature request (lightweight, 3-4 fields each).
- **Labels:** Seed `good first issue` on 2-3 starter issues.

### 4.5 CHANGELOG.md

Hand-written initial changelog for v0.1.0. Future releases auto-generate from commit history via GitHub Releases.

---

## Implementation Order

1. **Security hardening** (2.1–2.5) — fix before anything goes public.
2. **Docker packaging** (1.1–1.5) — Dockerfile, compose, entrypoint.
3. **CI/CD pipeline** (3.1–3.5) — enhanced CI, release workflow, npm prep.
4. **Version check & update** (3.4) — in-app banner and update button.
5. **Documentation** (4.1–4.5) — README, contributing, issue templates.
6. **Tag v0.1.0** — push tag, CI builds and releases.

## Open Questions

None — all decisions resolved during brainstorming.
