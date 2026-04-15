# CCHQ — Claude Code Headquarters

**Date:** 2026-04-11
**Status:** Approved

## Problem

Managing multiple Claude Code CLI sessions across terminal tabs is clunky. Context is lost between sessions — you re-explain the same things. There's no unified view of what's running or what was learned.

## Solution

A web dashboard that provides:

1. **Persistent knowledge base** — extracted from past sessions, auto-injected into new ones
2. **Unified session overview** — see all active/paused/completed sessions at a glance
3. **Chat-style interaction** — full Claude Code capabilities through a web UI instead of terminal

## Architecture

Three layers:

### Frontend (Next.js 15, App Router)

- **Dashboard Overview:** Grid of session cards with project sidebar, status filters, search
- **Session Chat View:** Chat interface with message input, collapsible tool-use blocks (file reads, edits, bash), right panel showing working directory, modified files, injected knowledge, session stats
- **Knowledge Base View:** Filterable list of knowledge entries by project and type, full-text search, manual add/edit/delete, traceable back to source session
- **Design system:** Tailwind CSS + impeccable.style for design polish

### Backend (Next.js API Routes + Supabase Realtime)

- Manages Claude Code SDK session lifecycle (start, message, pause, resume, complete)
- Streams conversation turns to frontend via Supabase Realtime subscriptions
- Persists all messages and tool-use events to database
- Runs knowledge extraction pipeline on session completion

### Database (Supabase — local via CLI, Postgres)

Accessed via Drizzle ORM for type-safe queries and migrations.

**Tables:**

#### projects
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Display name |
| path | text | Working directory path |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### sessions
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| status | enum | active, paused, completed, errored |
| model | text | e.g. opus-4-6, sonnet-4-6 |
| name | text | User-given or auto-generated session name |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### messages
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| session_id | uuid | FK → sessions |
| role | enum | user, assistant, system, tool |
| content | text | Message text |
| tool_use | jsonb | Tool call/result data (nullable) |
| created_at | timestamptz | |

#### knowledge
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| session_id | uuid | FK → sessions (source, nullable for manual entries) |
| type | enum | decision, fact, context, summary |
| content | text | The knowledge entry |
| tags | jsonb | Array of string tags |
| created_at | timestamptz | |

## Session Lifecycle

### Starting a session
1. User clicks "+ New Session" → picks a project (or creates one by choosing a directory)
2. Backend spawns a Claude Code SDK instance (`@anthropic-ai/claude-code`) pointed at that directory
3. Before the first turn, backend queries the knowledge table for entries matching that project (filtered by project_id, ordered by created_at desc, limited to most recent 20 entries) and injects them as a system message in the SDK conversation: "Here is context from previous sessions on this project: ..." followed by the knowledge entries formatted as a list
4. Supabase Realtime subscription established for live message streaming

### During a session
- User types messages in the chat UI → backend forwards to SDK → streams response back via Supabase Realtime
- Tool use (file reads, edits, bash commands) rendered as collapsible blocks in real-time
- All messages and tool calls persisted to database as they arrive

### Ending/pausing
- **Pause:** SDK session state serialized and saved. Can be resumed later with full context.
- **Complete:** Session marked done. Automatic summarization pass runs — Claude reviews the conversation and extracts key knowledge entries (decisions, facts, context) into the knowledge table, tagged by project.
- **Error:** Session marked as errored, last known state preserved, user notified with retry option.

### Session resume
- Resuming a paused session restores the SDK conversation state
- Starting a new session on the same project auto-injects relevant knowledge from past sessions

### Knowledge extraction prompt
On session completion: "Review this conversation and extract key decisions, facts, and context that would be useful in future sessions on this project. Return structured entries with type (decision/fact/context/summary), content, and tags."

## Error Handling

- **SDK session crash:** Session marked as errored, last state preserved, user notified in chat UI with option to retry or start fresh
- **Supabase connection loss:** Frontend shows connection status indicator, auto-reconnects, queues unsent messages
- **Knowledge extraction failure:** Session still completes normally, extraction retried in background, user can manually add entries

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React, Tailwind CSS |
| Design | impeccable.style |
| Backend | Next.js API Routes |
| Real-time | Supabase Realtime subscriptions |
| Database | Supabase (local via CLI → hosted later), Postgres |
| ORM | Drizzle ORM |
| Claude Code | @anthropic-ai/claude-code SDK |

## Testing

- **Unit tests:** Knowledge extraction/injection logic
- **Integration tests:** SDK session lifecycle (start, message, pause, resume, complete)
- **E2E tests:** Create session → send message → see response → end session → verify knowledge extracted

## Deployment

- **Now:** Local on Mac. `supabase start` for database, `next dev` for the app.
- **Later:** Deploy Next.js anywhere (Vercel, etc.), switch Supabase connection string to hosted instance.

## Visual Mockups

Mockups saved in `.superpowers/brainstorm/` directory:
- `dashboard-overview.html` — Session grid view with project sidebar
- `session-chat.html` — Chat interface with context panel
- `knowledge-base.html` — Knowledge entry list with filters
