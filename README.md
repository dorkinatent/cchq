# CCHQ

A web dashboard for managing multiple Claude Code sessions from one place, with a persistent knowledge base that carries context between sessions.

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
- **Mobile / remote access** — LAN + Tailscale or Cloudflare Mesh for private remote access, with a LaunchAgent for boot-start on macOS (see [Remote access](#remote-access))

---

## Prerequisites

- Node.js 18+
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- A Claude Code installation (`npm install -g @anthropic-ai/claude-code`)

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

CCHQ advertises itself via mDNS so you can reach it at a `.local` address without knowing the host machine's IP. By default the hostname is `cchq.local`. To change it, set `LOCAL_NAME` in `.env.local`:

```bash
LOCAL_NAME=myname   # → http://myname.local:3000
```

Any device on the same LAN can then open `http://cchq.local:3000` (or your custom name) instead of looking up the IP.

### Remote access

For access outside your LAN (phone on cellular, laptop at a coffee shop, etc.), CCHQ supports two private networking options. Both keep CCHQ off the public internet — only enrolled devices can reach it.

#### Option A: Tailscale (recommended for personal use)

Tailscale creates a WireGuard mesh between your devices. Setup is minimal and latency is low (peer-to-peer on LAN, relayed otherwise).

```bash
# Set a friendly Tailscale hostname
./scripts/setup-hostname.sh          # → cchq.<tailnet>.ts.net

# Front CCHQ with HTTPS on port 443
./scripts/setup-tailscale-serve.sh   # → https://cchq.<tailnet>.ts.net/
```

Install Tailscale on your phone/laptop, join the same tailnet, done. Full walkthrough in [docs/mobile-remote-access-runbook.md](docs/mobile-remote-access-runbook.md).

#### Option B: Cloudflare Mesh (for teams or Zero Trust)

[Cloudflare Mesh](https://workers.cloudflare.com/product/mesh) routes traffic through Cloudflare's edge network using a named tunnel. It's a better fit when you need:

- **Team access** — Zero Trust policies with IDP-backed enrollment (restrict who can reach CCHQ)
- **Corporate networks** — the WARP client works on networks that block WireGuard
- **Agent access** — AI agents running on Cloudflare Workers can reach CCHQ's API via VPC bindings

```bash
# One-time: install cloudflared and log in
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel login

# Create the tunnel and start it
./scripts/setup-cloudflare-tunnel.sh   # creates "cchq" tunnel → localhost:3000

# Stop it
./scripts/stop-cloudflare-tunnel.sh
```

After the tunnel is running, enroll devices by installing the [WARP client](https://one.one.one.one/) and joining your Zero Trust org. See the script output for dashboard steps (private network routes, device enrollment).

> **Tailscale vs Cloudflare Mesh at a glance**
>
> | | Tailscale | Cloudflare Mesh |
> |---|---|---|
> | Best for | Personal / solo | Teams / Zero Trust policies |
> | Setup | Install app + `tailscale up` | Dashboard config + WARP client |
> | Latency | Direct P2P (lowest on LAN) | Via nearest Cloudflare PoP |
> | Auth | Tailscale account | IDP / email enrollment |
> | Free tier | 3 users, 100 devices | Yes (limited scale) |
>
> You can run both simultaneously — they don't conflict.

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

## Gotchas

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
Sessions / Messages / Knowledge
    ↓
  Supabase (Postgres)
```

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
