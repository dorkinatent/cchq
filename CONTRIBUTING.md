# Contributing to CCUI

Thanks for taking a look. CCUI is a small project; PRs and issues are welcome.

## Dev setup

Prerequisites:

- Node.js ≥ 18.18 (`node -v`)
- Docker (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- [Claude Code](https://claude.com/claude-code) installed and authenticated (`claude --version`)

One-time:

```bash
git clone <fork-url> ccui && cd ccui
npm install
supabase start                               # starts Postgres + Studio in Docker
cp .env.local.example .env.local             # then paste keys from `supabase status`
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54332/postgres \
  npx drizzle-kit push                       # create schema
```

Day-to-day:

```bash
npm run dev      # http://localhost:3000
npm run lint     # eslint
npm run build    # production build (also what CI runs)
```

The Supabase API runs on `127.0.0.1:54331`, Postgres on `54332`. If those
ports collide on your machine, edit `supabase/config.toml` and update
`.env.local` accordingly.

## Conventions

- **TypeScript only.** No new `.js` files.
- **Tailwind v4** with CSS variables. No hard-coded colors — use the
  tokens in `src/app/globals.css`. The four themes (Fossil/Midnight/
  Arctic/Terminal) all need to keep working.
- **Design system.** Quiet, dense, warm. No `border-l/r` accent stripes
  > 1px, no `bg-clip-text` gradients, no `animate-pulse`. Use the
  existing `.thinking-dot` idiom for indeterminate motion.
- **API routes.** New routes should validate inputs (use `isUuid` /
  `parseJson` / `apiError` from `src/lib/api.ts`) and return JSON
  errors with appropriate status codes.
- **Hooks.** Cleanup in `useEffect` returns; `useCallback` on handlers
  passed to memoized children; `AbortController` for fetches that can
  outlive their component.

## Pull requests

- Keep diffs small and scoped. One feature or fix per PR.
- Include a short rationale in the PR description: what changed, why,
  any tradeoffs.
- `npm run build` must pass. CI runs build + lint on every PR.
- If the change is user-visible, mention it in the PR description so it
  can land in release notes.

## Filing issues

Useful info:

- What you ran and what happened
- What you expected
- Browser, OS, Node version
- Any relevant lines from `~/Library/Logs/ccui/stderr.log` (if running
  the LaunchAgent) or your dev terminal

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.
