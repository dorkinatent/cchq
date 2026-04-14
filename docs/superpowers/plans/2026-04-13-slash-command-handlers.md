# Slash Command Inline Handlers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "not yet supported" toast for CLI-only slash commands (`/cost`, `/model`, `/mcp`, `/status`, `/permissions`, `/compact`, `/config`) with permanent inline cards rendered in the chat message stream.

**Architecture:** Extend the `Message` type with an optional `commandResult` field. When a user types a CLI command, `handleSubmit` intercepts it and injects a client-side synthetic message into the message list instead of toasting. A `CommandCard` component in `MessageBubble` renders the result. Each command has a dedicated sub-component that fetches its own data from existing or new API endpoints. Interactive commands (`/model`, `/config`) mutate session state via PATCH endpoints.

**Tech Stack:** React, Next.js App Router, Tailwind CSS, existing CCUI theme variables, SDK `Query` methods (`mcpServerStatus`, `supportedModels`, `setModel`, `getContextUsage`)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types/command-result.ts` | **Create.** `CommandResult` discriminated union type for all command payloads |
| `src/hooks/use-session-messages.ts` | **Modify.** Extend `Message` type with optional `commandResult` field |
| `src/components/chat/message-input.tsx` | **Modify.** Replace toast with `onSlashCommand` callback; remove commands from `CLI_ONLY_COMMANDS` |
| `src/app/sessions/[id]/page.tsx` | **Modify.** Add `handleSlashCommand` that injects synthetic messages into the message list |
| `src/components/chat/message-list.tsx` | **Modify.** Stop filtering system messages that have `commandResult`; pass session data for interactive commands |
| `src/components/chat/message-bubble.tsx` | **Modify.** Detect `commandResult` and render `CommandCard` |
| `src/components/chat/command-card.tsx` | **Create.** Wrapper component — routes to per-command renderer based on `commandResult.command` |
| `src/components/chat/commands/cost-card.tsx` | **Create.** `/cost` renderer |
| `src/components/chat/commands/model-card.tsx` | **Create.** `/model` renderer with inline switching |
| `src/components/chat/commands/mcp-card.tsx` | **Create.** `/mcp` renderer with server groups + expandable tools |
| `src/components/chat/commands/status-card.tsx` | **Create.** `/status` renderer |
| `src/components/chat/commands/permissions-card.tsx` | **Create.** `/permissions` renderer |
| `src/components/chat/commands/compact-card.tsx` | **Create.** `/compact` state tracker |
| `src/components/chat/commands/config-card.tsx` | **Create.** `/config` inline editor |
| `src/app/api/sessions/[id]/mcp/route.ts` | **Create.** API endpoint for MCP server status |
| `src/app/api/sessions/[id]/models/route.ts` | **Create.** API endpoint for available models |
| `src/app/api/sessions/[id]/status/route.ts` | **Create.** API endpoint for session health/status |
| `src/app/api/sessions/[id]/context-usage/route.ts` | **Create.** API endpoint for context window usage |
| `src/lib/sessions/manager.ts` | **Modify.** Add `getMcpStatus`, `getAvailableModels`, `switchModel`, `getSessionStatus`, `getContextUsage` functions |

---

### Task 1: CommandResult type system

**Files:**
- Create: `src/types/command-result.ts`
- Modify: `src/hooks/use-session-messages.ts`

- [ ] **Step 1: Create the CommandResult discriminated union**

```typescript
// src/types/command-result.ts

export type McpServer = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  scope?: string;
  error?: string;
  tools?: { name: string; description?: string }[];
};

export type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
};

export type CommandResult =
  | {
      command: "cost";
      status: "loaded";
      data: {
        totalTokens: number;
        totalCostUsd: number;
        numTurns: number;
      };
    }
  | {
      command: "model";
      status: "loading" | "loaded" | "error";
      data?: {
        currentModel: string;
        currentEffort?: string;
        availableModels: ModelInfo[];
      };
      error?: string;
    }
  | {
      command: "mcp";
      status: "loading" | "loaded" | "error";
      data?: {
        servers: McpServer[];
      };
      error?: string;
    }
  | {
      command: "status";
      status: "loading" | "loaded" | "error";
      data?: {
        sessionStatus: string;
        connectionStatus: string;
        sdkSessionId: string | null;
        hasActiveQuery: boolean;
        currentTool: string | null;
        pendingPermissions: number;
        model: string;
        effort?: string;
        contextUsage?: {
          usedTokens: number;
          maxTokens: number;
          percentUsed: number;
        };
      };
      error?: string;
    }
  | {
      command: "permissions";
      status: "loading" | "loaded" | "error";
      data?: {
        trustLevel: string;
        permissionMode: string;
        rules: { toolPattern: string; decision: string }[];
      };
      error?: string;
    }
  | {
      command: "compact";
      status: "running" | "done" | "error";
      message?: string;
    }
  | {
      command: "config";
      status: "loading" | "loaded" | "error";
      data?: {
        model: string;
        effort?: string;
        trustLevel: string;
        availableModels: ModelInfo[];
      };
      error?: string;
    };
```

- [ ] **Step 2: Extend the Message type**

In `src/hooks/use-session-messages.ts`, add the `commandResult` field:

```typescript
import type { CommandResult } from "@/types/command-result";

export type Message = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_use: unknown;
  thinking: string | null;
  created_at: string;
  commandResult?: CommandResult;
};
```

- [ ] **Step 3: Commit**

```bash
git add src/types/command-result.ts src/hooks/use-session-messages.ts
git commit -m "feat: add CommandResult type system for inline slash commands"
```

---

### Task 2: Manager functions for SDK queries

**Files:**
- Modify: `src/lib/sessions/manager.ts`

These functions wrap SDK `Query` methods so API routes can call them. All follow the same pattern: look up the active session, call the Query method, return data.

- [ ] **Step 1: Add getMcpStatus function**

Add after the existing `getSessionCommands` function (around line 1189):

```typescript
export async function getMcpStatus(
  sessionId: string
): Promise<McpServer[]> {
  const active = activeSessions.get(sessionId);
  if (!active) return [];
  try {
    const servers = await active.query.mcpServerStatus();
    return servers.map((s) => ({
      name: s.name,
      status: s.status as McpServer["status"],
      scope: s.scope,
      error: s.error,
      tools: s.tools?.map((t) => ({ name: t.name, description: t.description })),
    }));
  } catch {
    return [];
  }
}
```

Add the import at the top of the file:

```typescript
import type { McpServer, ModelInfo } from "@/types/command-result";
```

- [ ] **Step 2: Add getAvailableModels function**

```typescript
export async function getAvailableModels(
  sessionId: string
): Promise<ModelInfo[]> {
  const active = activeSessions.get(sessionId);
  if (!active) return [];
  try {
    const models = await active.query.supportedModels();
    return models.map((m) => ({
      value: m.value,
      displayName: m.displayName,
      description: m.description,
      supportsEffort: m.supportsEffort,
      supportedEffortLevels: m.supportedEffortLevels,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Add switchModel function**

```typescript
export async function switchModel(
  sessionId: string,
  model: string
): Promise<boolean> {
  const active = activeSessions.get(sessionId);
  if (!active) return false;
  try {
    await active.query.setModel(model);
    // Also update the database row
    await db
      .update(schema.sessions)
      .set({ model, updatedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, sessionId));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Add getSessionHealthStatus function**

```typescript
export async function getSessionHealthStatus(sessionId: string) {
  const active = activeSessions.get(sessionId);
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return null;

  const pending = Array.from(pendingPermissions.values()).filter(
    (p) => p.sessionId === sessionId
  );

  let contextUsage: { usedTokens: number; maxTokens: number; percentUsed: number } | undefined;
  if (active) {
    try {
      const ctx = await active.query.getContextUsage();
      if (ctx && typeof ctx.used === "number" && typeof ctx.max === "number") {
        contextUsage = {
          usedTokens: ctx.used,
          maxTokens: ctx.max,
          percentUsed: ctx.max > 0 ? Math.round((ctx.used / ctx.max) * 100) : 0,
        };
      }
    } catch {
      // Context usage not available — skip
    }
  }

  return {
    sessionStatus: session.status,
    connectionStatus: active ? "connected" : "disconnected",
    sdkSessionId: session.sdkSessionId,
    hasActiveQuery: active?.hasActiveQuery ?? false,
    currentTool: active?.currentTool?.toolName ?? null,
    pendingPermissions: pending.length,
    model: session.model ?? "claude-sonnet-4-6",
    effort: session.effort ?? undefined,
    contextUsage,
  };
}
```

- [ ] **Step 5: Add getPermissionInfo function**

```typescript
export async function getPermissionInfo(sessionId: string) {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return null;

  const rules = await db.query.permissionRules.findMany({
    where: eq(schema.permissionRules.projectId, session.projectId),
  });

  const trustLevel = session.trustLevel ?? "auto_log";
  const modeMap: Record<string, string> = {
    full_auto: "Bypass all permissions",
    auto_log: "Auto-allow with logging",
    ask_me: "Ask before dangerous actions",
  };

  return {
    trustLevel,
    permissionMode: modeMap[trustLevel] || trustLevel,
    rules: rules.map((r) => ({
      toolPattern: r.toolPattern,
      decision: r.decision,
    })),
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sessions/manager.ts
git commit -m "feat: add manager functions for MCP, models, status, permissions queries"
```

---

### Task 3: API endpoints

**Files:**
- Create: `src/app/api/sessions/[id]/mcp/route.ts`
- Create: `src/app/api/sessions/[id]/models/route.ts`
- Create: `src/app/api/sessions/[id]/status/route.ts`

All follow the same pattern as the existing `commands/route.ts`.

- [ ] **Step 1: Create MCP endpoint**

```typescript
// src/app/api/sessions/[id]/mcp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getMcpStatus } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const servers = await getMcpStatus(id);
    return NextResponse.json({ servers });
  } catch {
    return NextResponse.json({ servers: [] });
  }
}
```

- [ ] **Step 2: Create models endpoint**

```typescript
// src/app/api/sessions/[id]/models/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAvailableModels, switchModel } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const models = await getAvailableModels(id);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { model } = await req.json();
  const ok = await switchModel(id, model);
  if (!ok) {
    return NextResponse.json({ error: "Failed to switch model" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, model });
}
```

- [ ] **Step 3: Create status endpoint**

```typescript
// src/app/api/sessions/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionHealthStatus, getPermissionInfo } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const kind = url.searchParams.get("kind") || "health";

  try {
    if (kind === "permissions") {
      const info = await getPermissionInfo(id);
      return NextResponse.json(info ?? { trustLevel: "unknown", permissionMode: "unknown", rules: [] });
    }
    const status = await getSessionHealthStatus(id);
    return NextResponse.json(status ?? { error: "Session not found" });
  } catch {
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sessions/[id]/mcp/route.ts src/app/api/sessions/[id]/models/route.ts src/app/api/sessions/[id]/status/route.ts
git commit -m "feat: add API endpoints for /mcp, /models, /status"
```

---

### Task 4: CommandCard wrapper + CostCard

**Files:**
- Create: `src/components/chat/command-card.tsx`
- Create: `src/components/chat/commands/cost-card.tsx`

- [ ] **Step 1: Create the CommandCard router**

```typescript
// src/components/chat/command-card.tsx
"use client";

import type { CommandResult } from "@/types/command-result";
import { CostCard } from "./commands/cost-card";
import { ModelCard } from "./commands/model-card";
import { McpCard } from "./commands/mcp-card";
import { StatusCard } from "./commands/status-card";
import { PermissionsCard } from "./commands/permissions-card";
import { CompactCard } from "./commands/compact-card";
import { ConfigCard } from "./commands/config-card";

export function CommandCard({
  result,
  sessionId,
  onSessionUpdate,
}: {
  result: CommandResult;
  sessionId: string;
  onSessionUpdate?: () => void;
}) {
  const inner = (() => {
    switch (result.command) {
      case "cost":
        return <CostCard data={result.data} />;
      case "model":
        return (
          <ModelCard
            result={result}
            sessionId={sessionId}
            onSessionUpdate={onSessionUpdate}
          />
        );
      case "mcp":
        return <McpCard result={result} />;
      case "status":
        return <StatusCard result={result} />;
      case "permissions":
        return <PermissionsCard result={result} />;
      case "compact":
        return <CompactCard result={result} />;
      case "config":
        return (
          <ConfigCard
            result={result}
            sessionId={sessionId}
            onSessionUpdate={onSessionUpdate}
          />
        );
    }
  })();

  return (
    <div className="max-w-[min(96%,720px)] border border-[var(--border)] rounded-md overflow-hidden bg-[color-mix(in_oklch,var(--surface-raised)_50%,transparent)]">
      <header className="px-4 pt-2.5 pb-1.5 flex items-center gap-2">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          /{result.command}
        </span>
        {("status" in result && result.status === "loading") && (
          <span className="text-[11px] text-[var(--text-muted)]">Fetching...</span>
        )}
        {("status" in result && result.status === "error") && (
          <span className="text-[11px] text-[var(--warning-text,var(--text-muted))]">
            {"error" in result && result.error ? result.error : "Could not fetch — session may be disconnected"}
          </span>
        )}
      </header>
      <div className="px-4 pb-3">{inner}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create CostCard**

```typescript
// src/components/chat/commands/cost-card.tsx
"use client";

export function CostCard({
  data,
}: {
  data: { totalTokens: number; totalCostUsd: number; numTurns: number };
}) {
  const tokens = data.totalTokens;
  const cost = data.totalCostUsd;
  const turns = data.numTurns;
  const avgPerTurn = turns > 0 ? cost / turns : 0;

  return (
    <div className="grid grid-cols-4 gap-4 pt-1">
      <StatCell label="Tokens" value={tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString()} hint={tokens >= 1000 ? tokens.toLocaleString() : undefined} />
      <StatCell label="Cost" value={`$${cost.toFixed(2)}`} hint={cost > 0 ? `$${cost.toFixed(4)}` : undefined} />
      <StatCell label="Turns" value={turns.toLocaleString()} />
      <StatCell label="Avg/turn" value={`$${avgPerTurn.toFixed(3)}`} />
    </div>
  );
}

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="eyebrow">{label}</div>
      <div className="font-semibold text-[var(--text-primary)] text-[19px] leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-[var(--text-muted)] tabular-nums">{hint}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/command-card.tsx src/components/chat/commands/cost-card.tsx
git commit -m "feat: add CommandCard wrapper and CostCard component"
```

---

### Task 5: ModelCard with inline switching

**Files:**
- Create: `src/components/chat/commands/model-card.tsx`

- [ ] **Step 1: Create ModelCard**

```typescript
// src/components/chat/commands/model-card.tsx
"use client";

import { useState } from "react";
import type { CommandResult, ModelInfo } from "@/types/command-result";

type ModelResult = Extract<CommandResult, { command: "model" }>;

export function ModelCard({
  result,
  sessionId,
  onSessionUpdate,
}: {
  result: ModelResult;
  sessionId: string;
  onSessionUpdate?: () => void;
}) {
  const [currentModel, setCurrentModel] = useState(result.data?.currentModel ?? "");
  const [switching, setSwitching] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { availableModels, currentEffort } = result.data;

  async function handleSwitch(model: string) {
    if (model === currentModel || switching) return;
    setSwitching(model);
    setFeedback(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        setCurrentModel(model);
        setFeedback("Updated");
        onSessionUpdate?.();
        setTimeout(() => setFeedback(null), 2000);
      } else {
        setFeedback("Failed to update");
      }
    } catch {
      setFeedback("Failed to update");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="space-y-1">
        {availableModels.map((m) => (
          <button
            key={m.value}
            onClick={() => handleSwitch(m.value)}
            disabled={switching !== null}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              m.value === currentModel
                ? "bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            } ${switching === m.value ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px]">{m.displayName}</span>
              {m.value === currentModel && (
                <span className="text-[11px] text-[var(--accent)]">current</span>
              )}
              {switching === m.value && (
                <span className="text-[11px] text-[var(--text-muted)]">switching...</span>
              )}
            </div>
          </button>
        ))}
      </div>
      {currentEffort && (
        <div className="text-[12px] text-[var(--text-muted)] pt-1">
          Effort: <span className="text-[var(--text-secondary)]">{currentEffort}</span>
        </div>
      )}
      {feedback && (
        <div className="text-[11px] text-[var(--accent)] pt-0.5">{feedback}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/commands/model-card.tsx
git commit -m "feat: add ModelCard with inline model switching"
```

---

### Task 6: McpCard with grouped servers and expandable tools

**Files:**
- Create: `src/components/chat/commands/mcp-card.tsx`

- [ ] **Step 1: Create McpCard**

```typescript
// src/components/chat/commands/mcp-card.tsx
"use client";

import { useState } from "react";
import type { CommandResult, McpServer } from "@/types/command-result";

type McpResult = Extract<CommandResult, { command: "mcp" }>;

const STATUS_INDICATORS: Record<McpServer["status"], { char: string; className: string }> = {
  connected: { char: "\u2713", className: "text-[var(--active-text)]" },
  "needs-auth": { char: "\u26A0", className: "text-[var(--paused-text)]" },
  failed: { char: "\u2717", className: "text-[var(--errored-text)]" },
  pending: { char: "\u2026", className: "text-[var(--text-muted)]" },
  disabled: { char: "\u25CB", className: "text-[var(--text-muted)]" },
};

const STATUS_LABELS: Record<McpServer["status"], string> = {
  connected: "connected",
  "needs-auth": "needs authentication",
  failed: "failed",
  pending: "pending",
  disabled: "disabled",
};

export function McpCard({ result }: { result: McpResult }) {
  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { servers } = result.data;

  // Group by scope (matching the CLI screenshot)
  const groups = new Map<string, McpServer[]>();
  for (const s of servers) {
    const scope = s.scope || "other";
    if (!groups.has(scope)) groups.set(scope, []);
    groups.get(scope)!.push(s);
  }

  const scopeLabels: Record<string, string> = {
    claudeai: "claude.ai",
    managed: "Built-in MCPs",
    user: "User",
    project: "Project",
    local: "Local",
  };

  return (
    <div className="pt-1 space-y-3">
      <div className="text-[13px] text-[var(--text-secondary)]">
        {servers.length} server{servers.length !== 1 ? "s" : ""}
      </div>
      {Array.from(groups.entries()).map(([scope, group]) => (
        <div key={scope} className="space-y-1">
          <div className="text-[12px] font-semibold text-[var(--text-primary)]">
            {scopeLabels[scope] || scope}{" "}
            {scope === "managed" && (
              <span className="font-normal text-[var(--text-muted)]">(always available)</span>
            )}
          </div>
          {group.map((server) => (
            <ServerRow key={server.name} server={server} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ServerRow({ server }: { server: McpServer }) {
  const [expanded, setExpanded] = useState(false);
  const indicator = STATUS_INDICATORS[server.status] || STATUS_INDICATORS.pending;
  const label = STATUS_LABELS[server.status] || server.status;
  const hasTools = server.tools && server.tools.length > 0;

  return (
    <div className="pl-3">
      <div className="flex items-center gap-2 text-[13px]">
        {hasTools && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[11px] w-3 shrink-0"
          >
            {expanded ? "\u25BC" : "\u25B6"}
          </button>
        )}
        {!hasTools && <span className="w-3 shrink-0" />}
        <span className="text-[var(--text-primary)]">{server.name}</span>
        <span className="text-[var(--text-muted)]">&middot;</span>
        <span className={indicator.className}>{indicator.char}</span>
        <span className="text-[var(--text-muted)] text-[12px]">{label}</span>
      </div>
      {expanded && hasTools && (
        <ul className="pl-8 pt-1 space-y-0.5">
          {server.tools!.map((tool) => (
            <li key={tool.name} className="text-[12px] text-[var(--text-secondary)] font-mono truncate">
              {tool.name}
            </li>
          ))}
        </ul>
      )}
      {server.error && (
        <div className="pl-8 text-[11px] text-[var(--errored-text)]">{server.error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/commands/mcp-card.tsx
git commit -m "feat: add McpCard with grouped servers and expandable tools"
```

---

### Task 7: StatusCard, PermissionsCard, CompactCard, ConfigCard

**Files:**
- Create: `src/components/chat/commands/status-card.tsx`
- Create: `src/components/chat/commands/permissions-card.tsx`
- Create: `src/components/chat/commands/compact-card.tsx`
- Create: `src/components/chat/commands/config-card.tsx`

- [ ] **Step 1: Create StatusCard**

```typescript
// src/components/chat/commands/status-card.tsx
"use client";

import type { CommandResult } from "@/types/command-result";

type StatusResult = Extract<CommandResult, { command: "status" }>;

export function StatusCard({ result }: { result: StatusResult }) {
  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const d = result.data;
  const connClass = d.connectionStatus === "connected"
    ? "text-[var(--active-text)]"
    : "text-[var(--errored-text)]";

  return (
    <div className="pt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      <span className="eyebrow pt-[1px]">Connection</span>
      <span className={connClass}>{d.connectionStatus}</span>

      <span className="eyebrow pt-[1px]">Session</span>
      <span className="text-[var(--text-secondary)] font-mono text-[12px]">{d.sdkSessionId || "—"}</span>

      <span className="eyebrow pt-[1px]">State</span>
      <span className="text-[var(--text-secondary)]">
        {d.hasActiveQuery ? `Active — ${d.currentTool || "thinking"}` : "Idle"}
      </span>

      <span className="eyebrow pt-[1px]">Permissions</span>
      <span className="text-[var(--text-secondary)]">
        {d.pendingPermissions > 0
          ? `${d.pendingPermissions} pending`
          : "None pending"}
      </span>

      <span className="eyebrow pt-[1px]">Model</span>
      <span className="text-[var(--text-secondary)] font-mono text-[12px]">{d.model}</span>

      {d.effort && (
        <>
          <span className="eyebrow pt-[1px]">Effort</span>
          <span className="text-[var(--text-secondary)]">{d.effort}</span>
        </>
      )}

      {d.contextUsage && (
        <>
          <span className="eyebrow pt-[1px]">Context</span>
          <span className="text-[var(--text-secondary)]">
            {d.contextUsage.usedTokens >= 1000
              ? `${(d.contextUsage.usedTokens / 1000).toFixed(1)}k`
              : d.contextUsage.usedTokens}
            {" / "}
            {d.contextUsage.maxTokens >= 1000
              ? `${(d.contextUsage.maxTokens / 1000).toFixed(0)}k`
              : d.contextUsage.maxTokens}
            {" "}
            <span className="text-[var(--text-muted)]">({d.contextUsage.percentUsed}%)</span>
          </span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PermissionsCard**

```typescript
// src/components/chat/commands/permissions-card.tsx
"use client";

import type { CommandResult } from "@/types/command-result";

type PermissionsResult = Extract<CommandResult, { command: "permissions" }>;

const TRUST_LABELS: Record<string, string> = {
  full_auto: "Full Auto",
  auto_log: "Auto + Log",
  ask_me: "Ask Me",
};

export function PermissionsCard({ result }: { result: PermissionsResult }) {
  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { trustLevel, permissionMode, rules } = result.data;

  return (
    <div className="pt-1 space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <span className="eyebrow pt-[1px]">Trust level</span>
        <span className="text-[var(--text-primary)] font-semibold">
          {TRUST_LABELS[trustLevel] || trustLevel}
        </span>

        <span className="eyebrow pt-[1px]">Mode</span>
        <span className="text-[var(--text-secondary)]">{permissionMode}</span>
      </div>

      {rules.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Rules ({rules.length})</div>
          <ul className="space-y-0.5 max-h-32 overflow-y-auto rail-scroll">
            {rules.map((r, i) => (
              <li key={i} className="text-[12px] font-mono text-[var(--text-secondary)] flex gap-2">
                <span className="truncate">{r.toolPattern}</span>
                <span className="text-[var(--text-muted)]">&rarr;</span>
                <span className={r.decision === "allow" ? "text-[var(--active-text)]" : "text-[var(--errored-text)]"}>
                  {r.decision}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-[12px] text-[var(--text-muted)]">
          No permission rules set. Using default: {TRUST_LABELS[trustLevel] || trustLevel}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create CompactCard**

```typescript
// src/components/chat/commands/compact-card.tsx
"use client";

import type { CommandResult } from "@/types/command-result";

type CompactResult = Extract<CommandResult, { command: "compact" }>;

export function CompactCard({ result }: { result: CompactResult }) {
  if (result.status === "running") {
    return (
      <div className="pt-1 text-[13px] text-[var(--text-secondary)] flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full thinking-dot" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full thinking-dot" style={{ animationDelay: "200ms" }} />
          <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full thinking-dot" style={{ animationDelay: "400ms" }} />
        </span>
        Compacting conversation
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="pt-1 text-[13px] text-[var(--errored-text)]">
        {result.message || "Compaction failed"}
      </div>
    );
  }

  return (
    <div className="pt-1 text-[13px] text-[var(--text-secondary)]">
      {result.message || "Conversation compacted."}
    </div>
  );
}
```

- [ ] **Step 4: Create ConfigCard**

```typescript
// src/components/chat/commands/config-card.tsx
"use client";

import { useState } from "react";
import type { CommandResult, ModelInfo } from "@/types/command-result";

type ConfigResult = Extract<CommandResult, { command: "config" }>;

const TRUST_OPTIONS = [
  { value: "full_auto", label: "Full Auto" },
  { value: "auto_log", label: "Auto + Log" },
  { value: "ask_me", label: "Ask Me" },
];

const EFFORT_OPTIONS = ["low", "medium", "high"];

export function ConfigCard({
  result,
  sessionId,
  onSessionUpdate,
}: {
  result: ConfigResult;
  sessionId: string;
  onSessionUpdate?: () => void;
}) {
  const [model, setModel] = useState(result.data?.model ?? "");
  const [effort, setEffort] = useState(result.data?.effort ?? "high");
  const [trustLevel, setTrustLevel] = useState(result.data?.trustLevel ?? "auto_log");
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  if (result.status === "loading") return null;
  if (result.status === "error" || !result.data) return null;

  const { availableModels } = result.data;

  async function updateField(field: string, value: string) {
    const body: Record<string, string> = {};

    if (field === "model") {
      // Model changes go through the special model endpoint
      try {
        const res = await fetch(`/api/sessions/${sessionId}/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: value }),
        });
        if (res.ok) {
          setModel(value);
          showFeedback(field, "\u2713");
          onSessionUpdate?.();
        } else {
          showFeedback(field, "Failed");
        }
      } catch {
        showFeedback(field, "Failed");
      }
      return;
    }

    body[field] = value;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (field === "effort") setEffort(value);
        if (field === "trustLevel") setTrustLevel(value);
        showFeedback(field, "\u2713");
        onSessionUpdate?.();
      } else {
        showFeedback(field, "Failed");
      }
    } catch {
      showFeedback(field, "Failed");
    }
  }

  function showFeedback(field: string, msg: string) {
    setFeedback((f) => ({ ...f, [field]: msg }));
    setTimeout(() => setFeedback((f) => {
      const next = { ...f };
      delete next[field];
      return next;
    }), 2000);
  }

  return (
    <div className="pt-1 space-y-3">
      {/* Model */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center">
        <span className="eyebrow">Model</span>
        <select
          value={model}
          onChange={(e) => updateField("model", e.target.value)}
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1 text-[13px] text-[var(--text-primary)] font-mono"
        >
          {availableModels.map((m) => (
            <option key={m.value} value={m.value}>{m.displayName}</option>
          ))}
        </select>
        {feedback.model && (
          <span className="text-[11px] text-[var(--accent)]">{feedback.model}</span>
        )}
      </div>

      {/* Effort */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center">
        <span className="eyebrow">Effort</span>
        <div className="flex gap-1">
          {EFFORT_OPTIONS.map((e) => (
            <button
              key={e}
              onClick={() => updateField("effort", e)}
              className={`px-2.5 py-1 rounded text-[12px] transition-colors ${
                e === effort
                  ? "bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        {feedback.effort && (
          <span className="text-[11px] text-[var(--accent)]">{feedback.effort}</span>
        )}
      </div>

      {/* Trust Level */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center">
        <span className="eyebrow">Trust</span>
        <div className="flex gap-1">
          {TRUST_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => updateField("trustLevel", t.value)}
              className={`px-2.5 py-1 rounded text-[12px] transition-colors ${
                t.value === trustLevel
                  ? "bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {feedback.trustLevel && (
          <span className="text-[11px] text-[var(--accent)]">{feedback.trustLevel}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/commands/status-card.tsx src/components/chat/commands/permissions-card.tsx src/components/chat/commands/compact-card.tsx src/components/chat/commands/config-card.tsx
git commit -m "feat: add StatusCard, PermissionsCard, CompactCard, ConfigCard"
```

---

### Task 8: Wire up the command interception pipeline

This is the integration task — connecting MessageInput → SessionPage → MessageList → MessageBubble → CommandCard.

**Files:**
- Modify: `src/components/chat/message-input.tsx`
- Modify: `src/app/sessions/[id]/page.tsx`
- Modify: `src/components/chat/message-list.tsx`
- Modify: `src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Modify MessageInput to call onSlashCommand instead of toasting**

In `src/components/chat/message-input.tsx`:

1. Add `onSlashCommand` to the component props:

Replace the props type:
```typescript
export function MessageInput({
  onSend,
  disabled,
  enqueue,
  sessionId,
  busy,
  onInterrupt,
  onSlashCommand,
}: {
  onSend: (content: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  enqueue?: (content: string, attachments?: { path: string; name: string }[]) => void;
  sessionId?: string;
  busy?: boolean;
  onInterrupt?: () => void;
  onSlashCommand?: (command: string, args: string) => void;
}) {
```

2. Replace `CLI_ONLY_COMMANDS` — keep only commands that are truly unsupported (no web handler), remove all the ones we're implementing:

```typescript
  // Commands that have no web UI handler and no SDK handler.
  // Everything else either passes through to the SDK or gets a web handler.
  const CLI_ONLY_COMMANDS = new Set([
    "doctor", "login", "logout", "vim",
  ]);

  // Commands handled by inline web UI cards.
  const WEB_COMMANDS = new Set([
    "cost", "model", "mcp", "status", "permissions", "config",
  ]);
```

3. Replace the interception block in `handleSubmit`:

```typescript
    // Intercept slash commands
    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).split(/\s(.+)/);
      const cmdName = parts[0].toLowerCase();
      const cmdArgs = parts[1] || "";

      if (CLI_ONLY_COMMANDS.has(cmdName)) {
        toast(`/${cmdName} is a CLI-only command — not available in the web UI`, { variant: "error" });
        return;
      }

      if (WEB_COMMANDS.has(cmdName) && onSlashCommand) {
        onSlashCommand(cmdName, cmdArgs);
        setValue("");
        setAttachments([]);
        return;
      }

      // /compact and other SDK-native commands fall through to onSend
    }
```

- [ ] **Step 2: Add handleSlashCommand and synthetic message injection in SessionPage**

In `src/app/sessions/[id]/page.tsx`:

1. Add import at top:
```typescript
import type { CommandResult } from "@/types/command-result";
```

2. Add `commandMessages` state and ID counter after the existing state declarations (around line 108):
```typescript
  const [commandMessages, setCommandMessages] = useState<
    import("@/hooks/use-session-messages").Message[]
  >([]);
  const cmdIdRef = useRef(0);
```

3. Add `handleSlashCommand` function after `handleSend` (around line 171):

```typescript
  function handleSlashCommand(command: string, args: string) {
    const msgId = `cmd-${++cmdIdRef.current}-${Date.now()}`;
    const now = new Date().toISOString();

    // Insert the user's command as a visible user message
    const userMsg: import("@/hooks/use-session-messages").Message = {
      id: `${msgId}-user`,
      session_id: id,
      role: "user",
      content: `/${command}${args ? " " + args : ""}`,
      tool_use: null,
      thinking: null,
      created_at: now,
    };

    // Create the command result message
    const cmdMsg: import("@/hooks/use-session-messages").Message = {
      id: msgId,
      session_id: id,
      role: "system",
      content: "",
      tool_use: null,
      thinking: null,
      created_at: now,
      commandResult: buildInitialResult(command),
    };

    setCommandMessages((prev) => [...prev, userMsg, cmdMsg]);

    // Fetch data and update the command message
    fetchCommandData(command, args, msgId);
  }

  function buildInitialResult(command: string): CommandResult {
    switch (command) {
      case "cost":
        return {
          command: "cost",
          status: "loaded",
          data: session?.usage ?? { totalTokens: 0, totalCostUsd: 0, numTurns: 0 },
        };
      case "model":
        return { command: "model", status: "loading" };
      case "mcp":
        return { command: "mcp", status: "loading" };
      case "status":
        return { command: "status", status: "loading" };
      case "permissions":
        return { command: "permissions", status: "loading" };
      case "compact":
        return { command: "compact", status: "running" };
      case "config":
        return { command: "config", status: "loading" };
      default:
        return { command: "cost", status: "loaded", data: { totalTokens: 0, totalCostUsd: 0, numTurns: 0 } };
    }
  }

  function updateCommandMessage(msgId: string, result: CommandResult) {
    setCommandMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, commandResult: result } : m))
    );
  }

  async function fetchCommandData(command: string, args: string, msgId: string) {
    try {
      switch (command) {
        case "cost":
          // Already loaded from session.usage — no fetch needed
          break;

        case "model": {
          const res = await fetch(`/api/sessions/${id}/models`);
          const { models } = await res.json();
          updateCommandMessage(msgId, {
            command: "model",
            status: "loaded",
            data: {
              currentModel: session?.model ?? "",
              currentEffort: session?.effort,
              availableModels: models,
            },
          });
          break;
        }

        case "mcp": {
          const res = await fetch(`/api/sessions/${id}/mcp`);
          const { servers } = await res.json();
          updateCommandMessage(msgId, {
            command: "mcp",
            status: "loaded",
            data: { servers },
          });
          break;
        }

        case "status": {
          const res = await fetch(`/api/sessions/${id}/status`);
          const data = await res.json();
          updateCommandMessage(msgId, {
            command: "status",
            status: "loaded",
            data,
          });
          break;
        }

        case "permissions": {
          const res = await fetch(`/api/sessions/${id}/status?kind=permissions`);
          const data = await res.json();
          updateCommandMessage(msgId, {
            command: "permissions",
            status: "loaded",
            data,
          });
          break;
        }

        case "config": {
          const [modelsRes, statusRes] = await Promise.all([
            fetch(`/api/sessions/${id}/models`),
            fetch(`/api/sessions/${id}/status?kind=permissions`),
          ]);
          const { models } = await modelsRes.json();
          const permData = await statusRes.json();
          updateCommandMessage(msgId, {
            command: "config",
            status: "loaded",
            data: {
              model: session?.model ?? "",
              effort: session?.effort,
              trustLevel: permData.trustLevel ?? "auto_log",
              availableModels: models,
            },
          });
          break;
        }
      }
    } catch {
      updateCommandMessage(msgId, {
        command,
        status: "error",
        error: "Could not fetch — session may be disconnected",
      } as CommandResult);
    }
  }

  // Refresh session data after model/config changes from command cards
  function handleSessionUpdateFromCommand() {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(setSession);
  }
```

4. Merge command messages with real messages for the message list. Replace the `messages` prop on `MessageList`:

```typescript
                <MessageList
                  ref={messageListRef}
                  messages={[...messages, ...commandMessages]}
                  streamState={streamState}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={loadMore}
                  sessionId={id}
                  onSessionUpdate={handleSessionUpdateFromCommand}
                />
```

5. Add `onSlashCommand` to the `MessageInput`:

```typescript
              <MessageInput
                onSend={handleSend}
                enqueue={queue.enqueue}
                sessionId={id}
                disabled={!isActive && session?.status !== "errored"}
                busy={isActive && isBusy}
                onInterrupt={handleInterrupt}
                onSlashCommand={handleSlashCommand}
              />
```

- [ ] **Step 3: Update MessageList to render command cards**

In `src/components/chat/message-list.tsx`:

1. Update the `groupIntoTurns` function to NOT filter out system messages that have `commandResult`:

```typescript
function groupIntoTurns(messages: Message[]): Message[] {
  const result: Message[] = [];
  const filtered = messages.filter(
    (m) => m.role !== "system" || m.commandResult
  );
  // ... rest unchanged
```

2. Add `sessionId` and `onSessionUpdate` to the component props:

```typescript
>(function MessageList({ messages, streamState, hasMore, loadingMore, onLoadMore, sessionId, onSessionUpdate }, ref) {
```

Update the type:
```typescript
  {
    messages: Message[];
    streamState?: StreamState;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
    sessionId?: string;
    onSessionUpdate?: () => void;
  }
```

3. Pass them through to MessageBubble:

```typescript
      {turns.map((msg) => (
        <div key={msg.id} data-message-id={msg.id}>
          <MessageBubble
            message={msg}
            sessionId={sessionId}
            onSessionUpdate={onSessionUpdate}
          />
        </div>
      ))}
```

- [ ] **Step 4: Update MessageBubble to render CommandCard for system messages**

In `src/components/chat/message-bubble.tsx`:

1. Add imports:
```typescript
import { CommandCard } from "./command-card";
```

2. Update the component signature:
```typescript
export function MessageBubble({
  message,
  sessionId,
  onSessionUpdate,
}: {
  message: Message;
  sessionId?: string;
  onSessionUpdate?: () => void;
}) {
```

3. Add command result rendering. Before the existing `return` statement, add an early return for command results:

```typescript
  // Render command result cards for system messages
  if (message.commandResult && message.role === "system") {
    return (
      <div className="mb-5 px-0">
        <CommandCard
          result={message.commandResult}
          sessionId={sessionId || message.session_id}
          onSessionUpdate={onSessionUpdate}
        />
      </div>
    );
  }
```

- [ ] **Step 5: Handle /compact pass-through**

`/compact` is special — it should go through to the SDK as a message, but also show an inline card tracking its progress. In `message-input.tsx`, `/compact` is NOT in `WEB_COMMANDS`, so it falls through to `onSend`. But we also want to show a tracking card.

Actually, the simplest approach: add `compact` to `WEB_COMMANDS`, but in `handleSlashCommand` in the page, send it through as BOTH a command card AND a real message to the SDK:

In `handleSlashCommand`, add special handling for compact at the top:

```typescript
  function handleSlashCommand(command: string, args: string) {
    // ... existing userMsg + cmdMsg creation ...

    // /compact also needs to pass through to the SDK
    if (command === "compact") {
      queue.enqueue(`/compact${args ? " " + args : ""}`);
      // The card starts as "running" — we'll update it when the SDK finishes
      // Listen for the stream completedMessage to mark it done
    }

    // ... rest of function
  }
```

For tracking compact completion, add an effect in SessionPage:

```typescript
  // Track /compact completion via stream state
  useEffect(() => {
    if (streamState.completedMessage) {
      setCommandMessages((prev) =>
        prev.map((m) =>
          m.commandResult?.command === "compact" && m.commandResult.status === "running"
            ? { ...m, commandResult: { command: "compact", status: "done", message: "Conversation compacted." } }
            : m
        )
      );
    }
  }, [streamState.completedMessage]);
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/message-input.tsx src/app/sessions/[id]/page.tsx src/components/chat/message-list.tsx src/components/chat/message-bubble.tsx
git commit -m "feat: wire up slash command interception pipeline — inject synthetic messages with command cards"
```

---

### Task 9: Add trustLevel to SessionDetail and API response

The session PATCH endpoint already accepts `trustLevel`, but the GET response and `SessionDetail` type don't expose it. We need it for `/permissions` and `/config`.

**Files:**
- Modify: `src/app/sessions/[id]/page.tsx`

- [ ] **Step 1: Add trustLevel to SessionDetail type**

```typescript
type SessionDetail = {
  id: string;
  name: string;
  status: string;
  model: string;
  effort?: string;
  trustLevel?: string;
  projectId: string;
  projectName?: string;
  projectPath?: string;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  createdAt?: string;
  updatedAt?: string;
  startSha?: string | null;
  endSha?: string | null;
};
```

The existing GET endpoint already returns the full session row from the database, which includes `trustLevel` — so no API change needed. We just need the client type to acknowledge it.

- [ ] **Step 2: Commit**

```bash
git add src/app/sessions/[id]/page.tsx
git commit -m "feat: expose trustLevel in SessionDetail type"
```

---

### Task 10: Integration test — verify all commands render

**Files:**
- No new files. Manual verification.

- [ ] **Step 1: Verify build compiles**

```bash
cd /Users/charlieanderson/Code/CCUI && npm run build
```

Expected: No TypeScript errors, no build failures.

- [ ] **Step 2: Test each command manually**

Start the dev server and open a session. Type each command and verify:

1. `/cost` — shows stat grid with tokens, cost, turns, avg/turn
2. `/model` — shows loading, then model list with current highlighted. Click another model, verify it switches.
3. `/mcp` — shows loading, then grouped server list matching the CLI format
4. `/status` — shows connection, session ID, state, permissions, model, context usage
5. `/permissions` — shows trust level, permission mode, rules list
6. `/compact` — shows "Compacting conversation..." dots, then completion message
7. `/config` — shows dropdowns/buttons for model, effort, trust. Change each, verify updates.
8. `/doctor` — still shows "CLI-only" toast (correctly excluded)

- [ ] **Step 3: Verify cards persist in scroll history**

Scroll up after typing commands — cards should remain visible, not disappear.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for slash command handlers"
```
