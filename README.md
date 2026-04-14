# CCUI

A web dashboard for managing multiple Claude Code sessions from one place, with a persistent knowledge base that carries context between sessions.

CCUI is an engine-agnostic cockpit. You can run it against:

- **Claude Code SDK** — single-agent chat sessions (default)
- **Gas Town** — multi-agent orchestration (experimental)

You pick the engine per project. Both engines share the same themes, knowledge base, and UX.

---

## Features

- **Multi-session dashboard** — every active and paused session grouped by project, with status, model, token count, and a "needs you" block for sessions waiting on input
- **Column-strip workspace** — open several sessions side by side in resizable columns; save and restore named workspaces
- **Persistent knowledge base** — decisions, facts, and context extracted from finished sessions and auto-injected into new sessions on the same project; manual capture via the Remember button in the session header, plus incremental/on-pause extraction and doc seeding
- **Live activity streaming** — watch Claude think and use tools in real time; tool calls collapse to a summary you can expand later
- **Rich tool rendering** — purpose-built views for Read/Edit/Write/Bash/Grep tools (diffs, terminal output, file paths)
- **Slash-command autocomplete** — type `/` to see available skills from the active SDK session; **Stop/Esc** interrupts a running turn; inline **permission cards** handle tool-approval prompts
- **Resizable context panel** — per-session context docs with a full-width overlay for reading/editing docs and notes
- **Image support** — drag-drop, paste, or file-pick images into the chat
- **Session resume** — pause a session, come back later, see what knowledge was added in the meantime, resume with a note
- **Message pagination & search** — infinite scroll through long histories, `Cmd+F` to search
- **Error recovery** — client-side message queue with auto-retry, connection status indicator, failed message retry
- **Per-project controls** — additional directories setting and permission modes (`full_auto` / `auto_log` / `ask_me`)
- **Four themes** — Fossil (default, warm stone), Midnight (deep indigo), Arctic (clean light), Terminal (green phosphor)
- **Mobile / remote access** — LAN + Tailscale-ready, with a LaunchAgent for boot-start on macOS (see [docs/mobile-remote-access-runbook.md](docs/mobile-remote-access-runbook.md))
- **Gas Town engine (experimental)** — Rig Dashboard with live agent tree, ready beads, real-time event feed

---

## Prerequisites

- Node.js 18+
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- A Claude Code installation (`npm install -g @anthropic-ai/claude-code`) — for the SDK engine
- Optional: [Gas Town](https://github.com/gastownhall/gastown) — for the Gas Town engine

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start local Supabase
supabase start

# 3. Configure env vars
cp .env.local.example .env.local
# Then fill in NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
# from the output of `supabase status`.

# 4. Push the database schema
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres" \
  npx drizzle-kit push

# 5. Run the dev server
npm run dev
```

Open http://localhost:3000.

The `supabase start` command uses custom ports (54331 API, 54332 DB) configured in `supabase/config.toml` to avoid conflicts with other local Supabase projects.

### Local network discovery

CCUI advertises itself via mDNS so you can reach it at a `.local` address without knowing the host machine's IP. By default the hostname is `cchq.local`. To change it, set `LOCAL_NAME` in `.env.local`:

```bash
LOCAL_NAME=myname   # → http://myname.local:3000
```

Any device on the same LAN can then open `http://cchq.local:3000` (or your custom name) instead of looking up the IP.

---

## Creating an SDK Project (Single-Agent)

1. Click **+ New Session**
2. Engine: **Claude Code SDK**
3. Fill in:
   - **Project** — pick an existing one, or click "Add new project folder" and browse to your repo
   - **Session Name** — e.g. "Auth refactor"
   - **Model** — Sonnet / Opus / Haiku
   - **Effort** — Low / Medium / High / Max (passed to the SDK)
   - **Initial Prompt** — what you want Claude to work on
4. Click **Start Session** → you're dropped into the chat view

The session streams thinking, tool calls, and text live. When you complete the session, Claude summarizes key facts into the project's knowledge base. Next session on the same project auto-injects those facts as context.

---

## Creating a Gas Town Project (Multi-Agent Swarm)

Gas Town is a separate CLI tool. You set it up once, then CCUI becomes its UI.

### One-time Gas Town setup

```bash
# Install gt (see https://github.com/gastownhall/gastown for latest install steps)
brew install gastownhall/tap/gastown

# Create your town (HQ) — one time
gt install ~/gt

# Bring up services
gt up

# Add yourself as a crew member
gt crew add <your-name>
```

### Per-project setup

Say you want to use Gas Town with `~/XCode/AutoCoach`:

```bash
# Go into the project
cd ~/XCode/AutoCoach

# Make sure it's a git repo
git status   # should not error; if it does, `git init && git add -A && git commit -m "initial"`

# Initialize it as a rig
gt init

# Go back to town and verify
cd ~/gt
gt rig list
# Expected: "autocoach" (or similar) appears in the list

# Make sure daemon is running
gt daemon status
# If stopped: gt daemon start

# Health check
gt doctor
```

### Hook up CCUI

1. Click **+ New Session**
2. Engine: **Gas Town**
3. **Town Path**: `~/gt`
4. **Rig Name**: whatever `gt rig list` showed (e.g. `autocoach`)
5. Click **Create** → dropped into the Rig Dashboard

### Rig Dashboard layout

- **Top bar** — Rig name + town path, daemon status dot, Start/Stop daemon button
- **Left panel** — Agent tree grouped by role (Mayor, polecats). Status symbols: ● working, ○ idle, ⚠ stalled, 🔥 GUPP, 💀 zombie.
- **Center panel** — Ready beads list. Each bead has its ID, priority, title, tags, and a Sling button. "+ New Bead" at the top.
- **Right panel** — Live event stream (tailing `~/gt/.events.jsonl`) with Gas Town's event symbols.

---

## Gotchas

**`gt` not found when starting a Gas Town session.** CCUI shells out to `gt` via the Node.js process. If you installed `gt` in one shell and started `npm run dev` in another, the PATH may not include it. Restart the dev server from a shell where `which gt` works.

**Crew not set up.** If you try to sling a bead and it fails, make sure you ran `gt crew add <your-name>` — Gas Town needs to know who owns slung work.

**Port conflicts with Supabase.** If `npx supabase start` fails with "port already allocated," another local Supabase project is using the defaults. The `supabase/config.toml` already shifts ours to 54331/54332, but if you see conflicts, adjust further and restart.

**Token stats show null on new sessions.** The usage data populates after the first SDK result event fires. Send a message; stats will update.

**Turbopack cache errors after schema changes.** If the dev server complains about imports not existing, run `rm -rf .next && npm run dev`.

---

## Architecture

```
Frontend (Next.js 16 App Router)
    ↕
Backend (Next.js API routes)
    ↓
┌─────────────┬──────────────────┐
│  SDK Engine │  Gas Town Engine │
│  (sessions/ │  (rigs/ → gt CLI │
│   messages/ │   + .events.jsonl│
│   knowledge)│   tailer)        │
└─────────────┴──────────────────┘
    ↓                    ↓
  Supabase          Gas Town (~/gt)
```

**Engine is a property of a project.** Routes branch by `project.engine`. The two engines share nothing at the runtime level except the dashboard shell.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 App Router, React 19, Tailwind CSS v4 |
| Design | impeccable.style design system |
| Backend | Next.js API Routes, Server-Sent Events for streaming |
| Database | Supabase (local → hosted), Postgres |
| ORM | Drizzle ORM |
| SDK | `@anthropic-ai/claude-agent-sdk` |
| Gas Town integration | `child_process` shell-out + `fs.watch` on `.events.jsonl` |
| Testing | Vitest |

---

## Development

```bash
# Dev server
npm run dev

# Build
npm run build

# Run tests
npx vitest run

# Database migrations
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres" \
  npx drizzle-kit push

# Regenerate migrations after schema changes
npx drizzle-kit generate
```

Design specs live in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`.

---

## License

MIT — see [LICENSE](LICENSE).
