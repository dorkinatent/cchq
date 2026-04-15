# Session Switcher — Design Brief

**Date:** 2026-04-12
**Feature:** Persistent left rail (extends sidebar) + ⌘K quick switcher overlay
**Replaces:** Dashboard-roundtrip navigation between sessions

---

## Problem

Power users run 4–6+ concurrent Claude Code sessions across multiple projects. Today, switching between them requires going back to the dashboard, scanning cards, and clicking in. That's three trips for what should be one motion. Blocked sessions (waiting on permission) can sit unattended because there's no ambient signal once you're deep in another session.

## Users

Developers who leave CCHQ open all day across multiple monitors, frequently context-switching between long-running sessions. They type faster than they mouse. They expect the app to tell them which sessions need attention without having to ask.

## Solution Overview

Two complementary surfaces, sharing the same data model:

1. **Persistent left rail** — always-on session list, grouped by project, with live state dots.
2. **⌘K quick switcher overlay** — instant fuzzy-search palette for jumping anywhere.

Both surfaces float blocked / errored sessions to the top and surface a "needs you" badge so urgency is legible even when the rail is partially collapsed or the overlay is closed.

---

## Persistent Left Rail

### Layout
- Width bump 208px → **240px** default, user-resizable (persist to localStorage; Supabase later).
- Extends the existing `sidebar.tsx` — keep the CCHQ header, theme switcher, Knowledge Base link. Sessions section becomes the dominant real-estate.
- Collapsible per-project groups. Collapsed state remembered per project.

### Filter chips (above the list)
`All · Active · Paused · Needs You · Recent`
- Remembers last selection across reloads.
- "Needs You" is the killer chip — shows only blocked / errored.
- Chips are dense: 11px uppercase tracking, amber tint when active, no borders.

### Row anatomy
```
● session-name              project · 2m   ← blocked: shows permission ask
                            last message preview (1 line, truncated)
```
- **state-dot** (6px) → **name** (text-primary, 13px) → **project** (text-muted, 11px) → **timestamp** (text-muted, 11px, right-aligned) → **1-line preview** (text-secondary, 12px).
- If blocked: preview shows the permission-requested action (e.g. "wants to run `rm -rf dist/`") instead of last message.

### States per row
| State       | Dot color       | Row treatment                                       | Ordering          |
|-------------|-----------------|-----------------------------------------------------|-------------------|
| Blocked     | Amber, 2s pulse | Amber background tint (NOT border stripe)          | Floats to top     |
| Errored     | Red, static     | Red background tint                                 | Floats to top     |
| Streaming   | Green, breathe  | Subtle — default row bg                             | Sorted by recency |
| Idle        | Green (dim)     | Default row bg                                      | Sorted by recency |
| Paused      | Muted gray      | Italic name, 60% opacity                            | Grouped section   |
| Completed   | Checkmark       | 50% opacity, in collapsible "Completed" drawer      | Collapsed by default |
| Current     | —               | Inset bg (`--surface-raised`) + 2px left-edge tint  | In place          |

### "Needs You" header badge
Rail header shows `3 need you` pill when blocked count > 0. Pill is amber on deep amber, tabular-nums. Click = jumps filter chip to "Needs You".

---

## ⌘K Quick Switcher Overlay

### Open behavior
- `⌘K` (or `Ctrl+K`) from anywhere. Opens in <100ms. No fade-in longer than 120ms.
- Centered overlay, max-width 560px, positioned 15vh from top so it sits in the eye's natural focus zone.
- Backdrop: `color-mix(in oklch, var(--bg) 85%, transparent)` + backdrop-blur(8px). Theme-aware.
- Click backdrop or `Esc` to dismiss. No modal-stack nonsense.

### Empty query (just ⌘K, no typing)
```
NEEDS YOU        (3)
● api-refactor          blocked on bash
● db-migrate            blocked on write

RECENT           (5)
● chat-ui               2m
● css-tokens            14m
...

PINNED           (⌘1..9)
1 ● charlie-main
2 ● chatkit-spike
```

### With query
Fuzzy match on `session name + project name + last message preview`. Score weighting:
- Exact name match → top
- Name prefix → next
- Project match → middle
- Preview match → last (but still shown)

Match highlights: accent color underline, not bold bg — keep it quiet.

### Keyboard
- `↑/↓` or `Ctrl+j/k` to move
- `Enter` to open
- `⌘Enter` to open in new window (stretch)
- `⌘1..9` to jump to pinned (works even with overlay closed)
- `⌘⇧[` / `⌘⇧]` to cycle prev/next in the rail's current filter
- `⌘/` to focus the rail's filter chip row

---

## Motion

- Pulse on blocked dots: `animation: blocked-pulse 2s ease-in-out infinite`. Starts slow; tune after testing. Respects `prefers-reduced-motion` (switches to static amber ring).
- Row hover: 80ms background transition only. No scale, no shadow.
- Overlay open: 100ms cubic-bezier(0.2, 0.8, 0.2, 1) fade + 2px translateY. No bounce.

## Persistence

- Pins: localStorage v1 (`cchq-pinned-sessions`). Supabase `user_preferences` table later for cross-device sync.
- Rail width: localStorage (`cchq-rail-width`).
- Filter chip: localStorage (`cchq-rail-filter`).
- Collapsed project groups: localStorage keyed by project id.

## Empty states

- No sessions at all: `"No sessions yet — ⌘N to start one"` (⌘N is stretch; if not wired, shows "Start a new session" link).
- Filter with no matches: `"No active sessions. You've got 3 paused — show them?"` with inline button to switch filter.
- Overlay empty query, no recent history: `"Type to search, or start a session with ⌘N"`.

---

## Out of scope (v1)

- Split view for parallel attention → v2
- Dock notifications / tab title badging / sound for blocked sessions → broader permissions pass
- Virtualization for >30 sessions → when we hit the problem
- `⌘N` new session shortcut → stretch; link-only fallback if not landed

## Open decisions (lean defaults picked)

- Pinning sync: **localStorage v1, Supabase user_prefs v2**
- "Needs You" placement: **global top, not per-project**
- Pulse tuning: **2s breathe, iterate from user reports**

---

## Recommended References

- `interaction-design.md` — command palette, focus management, shortcuts
- `spatial-design.md` — rail density, resize handle, 4pt rhythm
- `motion-design.md` — pulse tuning, overlay entrance
- `color-and-contrast.md` — state tints on Fossil palette (amber, red, green at this lightness)

## Competitive references

- **Conductor** — parallel agent rail, state dots
- **Linear ⌘K** — overlay speed + match weighting
- **VS Code tabs + editor groups** — collapsible project groups
- **tmux** — keyboard-first session switching mental model
