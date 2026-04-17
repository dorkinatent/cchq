# CCHQ

> Web dashboard for managing multiple Claude Code sessions from one place, with a persistent knowledge base that carries context between sessions.

[![CI](https://github.com/dorkinatent/cchq/actions/workflows/ci.yml/badge.svg)](https://github.com/dorkinatent/cchq/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/dorkinatent/cchq)](https://github.com/dorkinatent/cchq/releases)

<!-- Screenshot or GIF here once available -->

## Quick Start (Docker)

```bash
git clone https://github.com/dorkinatent/cchq.git
cd cchq
docker compose up
# → Open http://localhost:3000
```

**Custom port:** `CCHQ_PORT=8080 docker compose up`

## Quick Start (Development)

```bash
npm install
supabase start
cp .env.local.example .env.local    # paste keys from `supabase status`
npx drizzle-kit push
npm run dev
```

The `supabase start` command uses custom ports (54331 API, 54332 DB) configured in `supabase/config.toml` to avoid conflicts with other local Supabase projects.

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
- **Mobile / remote access** — LAN + Tailscale or Cloudflare Mesh for private remote access
- **In-app version check** — notifies when a new release is available, one-click Docker update

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CCHQ_PORT` | `3000` | Host port for the CCHQ web UI |
| `DB_PORT` | `54332` | Host port for Postgres |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | Enable Cloudflare tunnel: `docker compose --profile tunnel up` |

---

## Remote Access

For access outside your LAN (phone on cellular, laptop at a coffee shop, etc.), CCHQ supports two private networking options. Both keep CCHQ off the public internet — only enrolled devices can reach it.

### Option A: Tailscale (recommended for personal use)

Tailscale creates a WireGuard mesh between your devices. Setup is minimal and latency is low (peer-to-peer on LAN, relayed otherwise).

```bash
./scripts/setup-hostname.sh          # → cchq.<tailnet>.ts.net
./scripts/setup-tailscale-serve.sh   # → https://cchq.<tailnet>.ts.net/
```

Install Tailscale on your phone/laptop, join the same tailnet, done. Full walkthrough in [docs/mobile-remote-access-runbook.md](docs/mobile-remote-access-runbook.md).

### Option B: Cloudflare Mesh (for teams or Zero Trust)

```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel login
./scripts/setup-cloudflare-tunnel.sh   # creates "cchq" tunnel → localhost:3000
```

After the tunnel is running, enroll devices by installing the [WARP client](https://one.one.one.one/) and joining your Zero Trust org.

> **Tailscale vs Cloudflare Mesh at a glance**
>
> | | Tailscale | Cloudflare Mesh |
> |---|---|---|
> | Best for | Personal / solo | Teams / Zero Trust policies |
> | Setup | Install app + `tailscale up` | Dashboard config + WARP client |
> | Latency | Direct P2P (lowest on LAN) | Via nearest Cloudflare PoP |
> | Free tier | 3 users, 100 devices | Yes (limited scale) |

---

## LAN Discovery / mDNS

CCHQ advertises itself via mDNS so you can reach it at `http://cchq.local:3000` without knowing the host IP. To change the hostname:

```bash
LOCAL_NAME=myname   # in .env.local → http://myname.local:3000
```

> **Docker note:** mDNS broadcast runs inside the Node.js process; Docker users need a host-side mDNS proxy or should use Tailscale/Cloudflare instead.

---

## Creating a Session

1. Click **+ New Session**
2. Pick an existing project or browse to a new repo folder
3. Fill in session name, model, effort level, and optional initial prompt
4. Click **Start Session** — you're dropped into the live chat view

Sessions stream thinking, tool calls, and text in real time. Completed sessions extract key facts into the project's knowledge base for future sessions.

---

## Gotchas

**Port conflicts with Supabase.** If `npx supabase start` fails with "port already allocated," another local Supabase project is using the defaults. Adjust `supabase/config.toml` and restart.

**Token stats show null on new sessions.** Usage data populates after the first SDK result event. Send a message; stats will update.

**Turbopack cache errors after schema changes.** Run `rm -rf .next && npm run dev`.

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
| Backend | Next.js API Routes, Server-Sent Events for streaming |
| Database | Supabase (local → hosted), Postgres |
| ORM | Drizzle ORM |
| SDK | `@anthropic-ai/claude-agent-sdk` |
| Testing | Vitest |

---

## Development

```bash
npm run dev           # dev server
npm run build         # production build
npm test              # run tests
npx vitest --watch    # watch mode
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup and conventions.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
