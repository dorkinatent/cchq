# CCHQ Mobile + Remote Access — Design

**Date:** 2026-04-12
**Status:** Draft (pending user review)
**Scope:** Phase 1 of making CCHQ usable from a phone, both at home and remotely.

## Problem

CCHQ currently only works from the Mac it runs on. Two concrete problems surfaced:

1. **Mobile access is broken.** Hitting the dev server from a phone on the LAN loads the UI but the session list is empty. Root cause: the client-side `useSessions` hook talks to Supabase directly at `http://127.0.0.1:54321`, which from a phone resolves to the phone's own localhost (nothing is there) rather than the Mac's Supabase instance.
2. **Mobile UX is not designed for phones.** Even with the data issue fixed, the layout assumes desktop widths — two-column grids, sidebar nav, keyboard-shortcut hints, tap targets sized for mouse cursors.

Additionally, Charlie wants to use CCHQ while away from home (e.g. tending a long-running session from a coffee shop), which requires a remote access layer and persistent server process.

## Goals

- Phone-usable CCHQ for the two most-used tasks: monitoring sessions and interacting with a single session (read stream, send follow-up, approve/deny permission prompts).
- Reachable from phone over the LAN and remotely via Tailscale.
- Runs on Mac boot so it's there when Charlie needs it.
- Architecture positions a future iOS app as "just another API client," with visual parity between mobile web and the eventual native app.

## Non-Goals (Phase 1)

- Push notifications (planned as a separate phase; noted in follow-ups).
- Full feature parity on mobile (knowledge base, projects page, new-session flow polish, ⌘K switcher redesign) — phase C work.
- App-level authentication — Tailscale's device-level trust is sufficient for now.
- The iOS app itself — separate project, separate brainstorm.
- HTTPS via `tailscale serve` — phase 1.5 tweak if anything feels degraded.

## User Scope (Phase 1)

Must-haves when accessing from phone:

1. View list of sessions with status and last message.
2. Open a session and read its full message stream, live.
3. Send a follow-up message to a running session.
4. Approve or deny permission prompts.

## Architecture

Four independent pieces of work:

1. **Data layer refactor** — all browser → DB traffic routed through `/api/*` (REST + SSE).
2. **Mobile-responsive pass** — scoped to `/` (session list) and `/sessions/[id]` (session detail).
3. **Network + remote access** — bind to `0.0.0.0`, Tailscale hostname, mDNS broadcast.
4. **Boot persistence** — LaunchAgent starts Supabase + CCHQ on login.

Pieces 1 and 2 can be parallelized. 3 and 4 depend on 1 shipping.

---

### Piece 1: Data layer refactor

The browser no longer talks to Supabase directly. All reads, writes, and realtime flow through Next.js API routes. The server continues to use Supabase/Drizzle server-side.

**REST endpoints (existing, retained):**
- `GET /api/sessions` — session list (already implemented).
- `GET /api/sessions/[id]` — session detail.
- `POST /api/sessions/[id]/message` — send follow-up.
- `POST /api/sessions/[id]/permission` — allow/deny a tool call.

**REST endpoints (new):**
- `GET /api/sessions/[id]/messages` — full message history for a session. Returns chronological list of messages with role, content, and metadata. Used for the session detail view on initial load.

**SSE endpoints:**
- `GET /api/sessions/[id]/stream` — already exists; per-session live events. Unchanged.
- `GET /api/sessions/stream` — new. Emits events whenever any session's status, `updated_at`, or last message changes. Powers the live-updating list.

**Realtime implementation:** The server owns a single Supabase realtime subscription per table (sessions, messages). Incoming DB changes are fanned out to connected SSE clients via an in-process `EventEmitter`. Clients do not open their own Supabase connections. Benefits:

- One hostname/port for clients to reach (matters for mobile and Tailscale).
- Smaller attack surface — no need to expose Supabase publicly.
- Natural gate for future auth.
- Works unchanged for the future iOS app (which also uses the REST + SSE contract).

**Client-side changes:**
- `useSessions` hook: replace Supabase query + channel subscription with `fetch('/api/sessions')` + `EventSource('/api/sessions/stream')`.
- `useSessionMessages` (or its equivalent in the session detail view): replace with `fetch('/api/sessions/[id]/messages')` + `EventSource('/api/sessions/[id]/stream')`.
- Remove the browser-side Supabase client import paths (keep server-side intact).

**Side effect:** this fixes the "empty session list on mobile" bug because all client traffic now flows through port 3000 — no second port required.

---

### Piece 2: Mobile-responsive pass

Scoped to two routes this round. Other pages get "doesn't break horizontally" treatment (sensible `overflow-x` behavior, no fixed-width layouts that blow out the viewport) but not polish.

Uses Tailwind responsive breakpoints. Desktop layout unchanged at `md:` and above; mobile styles are additive.

**Design constraint: iOS visual parity.** The responsive UI should lean toward iOS-native aesthetics (SF-style type hierarchy, familiar nav/sheet patterns, tap targets sized per HIG) so the future iOS app looks like a native sibling, not a re-skin.

**Session list (`/`) at mobile widths (`< 768px`):**

```
┌─────────────────────────────┐
│ ☰   CCHQ          [+ New]   │  top bar: menu, title, new-session
├─────────────────────────────┤
│ 🟢 session name             │
│    project · 2m ago · 14msg │  full-width stacked cards
│    last message preview...  │  (replaces 2-col grid)
├─────────────────────────────┤
│ 🔴 needs permission         │  blocked sessions surface visually
│    project · now · 3msg     │
└─────────────────────────────┘
```

- Grid collapses from two columns to single column.
- Search moves into the menu, or behind a collapsible row under the top bar.
- Keyboard-shortcut hints (`⌥⇧N`, `⌘K`) hide at mobile widths.
- `+ New` button shrinks to icon-only if needed.

**Session detail (`/sessions/[id]`) at mobile widths:**

```
┌─────────────────────────────┐
│ ←  session name      ⋯      │  back, truncated title, overflow menu
├─────────────────────────────┤
│                             │
│  message stream             │  full-bleed, scrolls
│  (auto-scroll on new msg)   │
│                             │
├─────────────────────────────┤
│ ⚠ Permission required       │  sticky banner when blocked
│   Tool: Bash                │  with Allow / Deny buttons
│   [Deny]          [Allow]   │
├─────────────────────────────┤
│ [type a message...]     ▶   │  composer pinned to bottom
└─────────────────────────────┘
```

**Required details:**
- Composer uses `env(safe-area-inset-bottom)` so it sits above the iPhone home indicator.
- Tap targets minimum 44×44pt.
- Permission banner is sticky above the composer — the primary reason Charlie picks up the phone is to approve a tool call, so it must be reachable without scrolling.
- Overflow menu (⋯) holds: end session, model, effort, trust level — everything currently in the desktop sidebar for that session.
- Composer resizes on focus without hiding content (use `visualViewport` API or equivalent).

**Explicitly out of scope this round:** knowledge base page, new-session flow beyond the `+ New` button, projects page, session switcher (⌘K) mobile treatment. These get properly addressed in phase C.

---

### Piece 3: Network + remote access

**Bind Next.js to `0.0.0.0`:**
- Update `package.json`: `"dev": "next dev -H 0.0.0.0"`, same for `start`.
- Without this, Next.js binds only to localhost and neither LAN nor Tailscale can reach it.

**Supabase binding:** stays on localhost. We route through Next.js, so Supabase does not need to be exposed.

**Tailscale:**
- Assumes Tailscale is already installed on the Mac and Charlie's iPhone.
- MagicDNS gives a hostname for free: `http://<mac-name>.<tailnet>.ts.net:3000`.
- No additional config required in phase 1.

**mDNS / Bonjour broadcast:**
- Server broadcasts `_cchq._tcp` on port 3000 at startup using `bonjour-service` (or equivalent).
- Lets the future iOS app auto-discover CCHQ when on the same LAN — no URL typing.
- Also available to the web UI for a future "nearby servers" UX.
- ~20 lines of code; trivial to add now and validates the "server announces itself" pattern early.

**Firewall:** macOS firewall (if enabled) needs to allow incoming on port 3000. The LaunchAgent handles binding; Charlie may need to approve once on first run.

**HTTPS (deferred):** `tailscale cert` + `tailscale serve` can put CCHQ behind HTTPS on the tailnet. Worth doing later (unlocks clipboard, service workers, some PWA features). Not phase 1.

---

### Piece 4: Boot persistence

**Approach:** single LaunchAgent plist at `~/Library/LaunchAgents/app.cchq.plist`. Runs as Charlie's user (not root — needs access to Charlie's files and `supabase` CLI). `KeepAlive = true` so it restarts on crash.

**Plist runs a single script**, `scripts/cchq-start.sh`, which:

1. `cd` into the project directory.
2. Runs `supabase start` (idempotent — no-op if already running).
3. Waits for Supabase health check.
4. Runs `npm run start` (production build).

**Logs:** stdout and stderr redirected to `~/Library/Logs/cchq/{stdout,stderr}.log`. Tail-able via SSH over Tailscale, or a future admin page.

**Ship artifacts:**
- `scripts/install-launchagent.sh` — idempotent installer. Writes plist from a template (substituting absolute paths), runs `launchctl load`.
- `scripts/uninstall-launchagent.sh` — the reverse.
- `scripts/cchq-start.sh` — the launch script above.

**Dev workflow:** when developing, Charlie can `launchctl unload` the agent, or leave it running and let `npm run dev` fail to bind port 3000 as the signal to unload.

---

## Testing

**Data layer refactor:**
- Unit tests for the new API routes (`/api/sessions/[id]/messages`, `/api/sessions/stream`).
- Integration test: SSE fans out correctly to multiple clients on a DB change.
- Manual smoke: open two browser tabs; send a message in one; watch the other update live.

**Mobile responsive:**
- Visual/manual — Chrome devtools responsive mode plus testing on Charlie's actual iPhone over Tailscale.
- No automated visual regression this round (too much setup for two pages).

**Network + boot:**
- Manual verification checklist: reboot Mac, confirm CCHQ reachable from phone within ~30s of login over Tailscale; confirm mDNS broadcast visible on LAN (`dns-sd -B _cchq._tcp` on another Mac).
- Kill the node process; confirm LaunchAgent restarts it within seconds.

**Bug regression:**
- Load the app from a non-localhost origin (e.g. Tailscale hostname); confirm session list populates and live-updates.

---

## Out of scope / follow-ups

Tracked explicitly so they don't get lost:

- **Push notifications** (APNs for iOS, web push via VAPID for browser) — separate session. Requires device-registration endpoint (`POST /api/devices`), service worker (web), and server-side "session needs attention" trigger logic.
- **Phase C: mobile parity for remaining pages** — knowledge base edit, new-session polish, projects, ⌘K alternative on mobile.
- **HTTPS over Tailscale** — phase 1.5 tweak.
- **App-level auth** — only if tailnet ever gets shared, or belt-and-suspenders is wanted.
- **Admin / logs page** — view LaunchAgent logs from phone instead of SSH.
- **Future iOS app** — its own project. Expected capabilities: APNs push, home-screen widgets (active/blocked counts), Lock Screen Live Activities for running sessions, share extension ("send URL to CCHQ as new session prompt"), Bonjour-based auto-discovery on LAN with Tailscale hostname fallback.

## Deliverables summary

1. All browser → DB traffic routed through `/api/*` (REST + SSE).
2. `/` and `/sessions/[id]` usable at mobile widths with sticky composer and permission banner; iOS-native visual tone.
3. Next.js bound to `0.0.0.0`; reachable at `<mac>.<tailnet>.ts.net:3000` over Tailscale.
4. mDNS broadcast of `_cchq._tcp` on LAN at startup.
5. LaunchAgent starts Supabase + CCHQ on login; restarts on crash.
6. Install/uninstall scripts for the LaunchAgent.
