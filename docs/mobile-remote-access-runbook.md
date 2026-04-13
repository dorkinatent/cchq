# Mobile + Remote Access Runbook

This is the manual checklist for verifying CCUI works from a phone (LAN + Tailscale) and auto-starts on Mac boot. Use after merging the `mobile-remote-access` branch to main.

## One-time setup

1. **Merge the branch to main** (or cut a release) and check out on the Mac that will host CCUI.
2. **Build once:** `npm install && npm run build`.
3. **Install the LaunchAgent:**
   ```bash
   ./scripts/install-launchagent.sh
   ```
   Expected output includes the plist path and log dir.
4. **Set a memorable Tailscale hostname** so CCUI is reachable at `ccui.<tailnet>.ts.net` over Tailscale:
   ```bash
   ./scripts/setup-hostname.sh
   ```
   (Pass a different name as the first arg if `ccui` isn't what you want. Only touches Tailscale — leaves the Mac's own hostname alone.)
5. **Tailscale:** install on the Mac and on your iPhone. After step 4 the Tailscale hostname is already `ccui`. No per-app config needed.
6. **Front CCUI with TLS on port 443** so the URL has no port number and HTTPS:
   ```bash
   ./scripts/setup-tailscale-serve.sh
   ```
   After this, CCUI is reachable at `https://ccui.<tailnet>.ts.net/` from any device on your tailnet. Stop with `./scripts/stop-tailscale-serve.sh`.
7. **macOS Firewall:** if it pops a prompt asking whether `node` can accept incoming connections, click **Allow**.

## Verification checklist

Work through these one at a time. Anything failing blocks completion.

- [ ] **Reboot the Mac.** Within ~60s of login: `curl -I http://localhost:3000/` returns `200`.
- [ ] **LAN access:** from another device on the same Wi-Fi, `http://<mac-lan-ip>:3000/` loads and the session list populates.
- [ ] **Tailscale access:** from your phone (switch Wi-Fi off, cellular on), `https://ccui.<tailnet>.ts.net/` loads and the session list populates. (If you haven't run `setup-tailscale-serve.sh` yet, substitute `http://<mac>.<tailnet>.ts.net:3000/`.)
- [ ] **mDNS broadcast:** on a second Mac, `dns-sd -B _ccui._tcp` lists a `CCUI` service.
- [ ] **Live updates (SSE):** send a message from the desktop UI; the phone's list and detail views update within ~1s without a manual refresh.
- [ ] **Permission flow:** trigger a tool call that requires approval (e.g. Bash in a full-auto-off session). The permission banner appears on the phone; **Allow** proceeds, **Deny** blocks.
- [ ] **Crash recovery:** `kill $(lsof -ti :3000)`. The LaunchAgent restarts the process within seconds and the phone reconnects automatically.
- [ ] **No direct Supabase traffic:** open Safari DevTools on the phone (or Chrome DevTools with USB debugging) and confirm that no network requests go to `:54321`. All traffic should be `:3000`.
- [ ] **Mobile UI:** on the phone, confirm
  - Dashboard top bar is compact; `+ New` works.
  - Dashboard `···` menu opens with theme options.
  - Session detail header (back, title, status, `···`) stays visible while scrolling.
  - Session detail `···` menu has Pause / End session (when active) + theme options.
  - Composer is reachable above the home indicator.

## Log locations

- `~/Library/Logs/ccui/stdout.log` — Next.js stdout
- `~/Library/Logs/ccui/stderr.log` — Next.js stderr (and startup issues)
- `~/Library/Logs/ccui/supabase.log` — `supabase start` output from the launch script

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Session list empty on phone, dev console shows CORS-ish error | `allowedDevOrigins` doesn't cover your phone's IP | Add IP or subnet to `next.config.ts` and restart the agent. (Only relevant in `next dev` — production `npm run start` doesn't enforce this.) |
| `curl localhost:3000` fails after reboot | Supabase not up, or `supabase` CLI not on PATH in launchd | Check `~/Library/Logs/ccui/supabase.log`; add `/opt/homebrew/bin` to the plist `EnvironmentVariables.PATH` if needed. |
| Phone can't reach Mac over Tailscale | MagicDNS disabled, or device not in the tailnet | `tailscale status` on both devices; ensure both are authorized. |
| LaunchAgent flapping | `npm run build` hasn't been run, or build is stale | Rebuild, reinstall: `npm run build && ./scripts/install-launchagent.sh`. |
| Multiple servers on port 3000 | `npm run dev` running alongside the agent | `launchctl unload ~/Library/LaunchAgents/app.ccui.plist` during development; re-load when done. |

## Development workflow (with the agent installed)

When you want to iterate on CCUI, you have two options:

1. **Quick:** unload the agent (`./scripts/uninstall-launchagent.sh`), work with `npm run dev`, reinstall when done.
2. **Parallel:** run `PORT=3002 npm run dev` (or `npm run dev -- -p 3002`) on a different port so it doesn't fight the agent.

## Deferred (not in phase 1)

- Push notifications (APNs for iOS, web push via VAPID for browser).
- Custom-domain HTTPS (e.g., issuing certs via `tailscale cert` for a non-ts.net domain or using an external CA). Baseline HTTPS on `<node>.<tailnet>.ts.net` is handled by step 6.
- App-level authentication.
- Admin / log-viewer page.
- Native iOS app — separate project, will reuse the `/api/*` contract and mDNS broadcast.
