# Testing the Diff Viewer

> Last updated: 2026-04-13. This file exists to test the Changes tab.

Quick guide for testing the session diff viewer feature.

## Prerequisites

- You're on the `feature/session-diff-viewer` branch
- The DB migration has been applied (`npx drizzle-kit push`)
- Dev server is running

## Test 1: Live Changes Tab (active session)

1. Open CCHQ in your browser
2. Create a **new session** on a git-tracked project (⌥⇧N or the + button)
3. Send a message that causes Claude to edit files, e.g.:
   - "Add a comment to the top of package.json"
   - "Create a new file called hello.txt with some content"
   - "Refactor [some function] to use async/await"
4. While Claude is working (or after it finishes the turn), click the **Changes** tab in the right panel (4th tab)
5. You should see:
   - A header with `+N −N` counts and file count
   - A list of files with colored status badges: **M** (green) for modified, **A** (green) for added, **D** (red) for deleted
   - Click any file → inline diff accordion opens showing the unified diff
6. Click **Expand ↗** → full-width overlay opens with a file sidebar on the left and the diff on the right

**Note:** The Changes tab polls every 10 seconds while the session is active. If Claude just finished editing, you may need to wait a few seconds or switch tabs and back.

## Test 2: Review Changes (completed session)

1. After Claude finishes, click **End session** in the header
2. Scroll to the bottom of the chat → the session summary card appears
3. Look for the **"Review changes ↗"** button in the summary (between the Files row and the footer)
4. Click it → full-width diff overlay opens showing the historical diff (startSha to endSha)
5. The breadcrumb should show short SHA range like `Changes · abc1234..def5678`

## Test 3: Pre-existing Sessions (graceful degradation)

1. Open any session that was created **before** this feature was deployed
2. The Changes tab should:
   - Show "No changes yet" or "No changes recorded" (since there's no `startSha` to diff against)
3. The session summary should:
   - **Not** show a "Review changes" button (no `startSha` stored)

## Test 4: Non-git Project

1. Create a session pointing to a directory that is NOT a git repository
2. The Changes tab should show: **"Not a git repository"**

## What "No changes yet" means

The diff viewer compares the git state at session creation (`startSha`) with the current state. If you see "No changes yet" on a new session, it means Claude hasn't edited any files yet — send a message first.

## Keyboard shortcuts reminder

- **⌘K** — Quick switcher
- **⌥⇧N** — New session
- **⌥1..9** — Jump to pinned sessions
- **⌘⇧[** / **⌘⇧]** — Cycle sessions
