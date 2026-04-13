import { query, type Query, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, desc, gt, and } from "drizzle-orm";
import { evaluatePermission, type TrustLevel } from "@/lib/permissions/engine";
import { createAllowRule } from "@/lib/permissions/rules";
import { sessionEventBus } from "./stream-events";
import { scanDocs } from "@/lib/docs/scanner";
import { readFile } from "fs/promises";
import { join } from "path";

const MAX_DOC_INJECTION_CHARS = 20_000;

async function buildDocInjection(
  projectPath: string,
  docGlobs: string[]
): Promise<string> {
  let files;
  try {
    files = await scanDocs(projectPath, docGlobs);
  } catch {
    return "";
  }
  if (files.length === 0) return "";

  // Rank: shallower path first, then more recent mtime first
  files.sort((a, b) => {
    const depthA = a.relativePath.split("/").length;
    const depthB = b.relativePath.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return b.mtime.localeCompare(a.mtime);
  });

  const parts: string[] = [];
  let total = 0;
  let truncated = 0;
  for (const f of files) {
    try {
      const content = await readFile(join(projectPath, f.relativePath), "utf8");
      const block = `\n--- ${f.relativePath} ---\n${content}\n`;
      if (total + block.length > MAX_DOC_INJECTION_CHARS) {
        truncated = files.length - parts.length;
        break;
      }
      parts.push(block);
      total += block.length;
    } catch {
      // Skip files we can't read
    }
  }

  if (parts.length === 0) return "";

  const header = "\n\n--- Project Docs ---\nThe following are docs from this project, injected as context:\n";
  const footer = truncated > 0 ? `\n[${truncated} more doc files available — ask to see them]\n` : "";
  return header + parts.join("") + footer;
}

type CurrentTool = {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  startedAt: number;
};

type ActiveSession = {
  query: Query;
  sessionId: string;
  sdkSessionId: string | null;
  abortController: AbortController;
  projectId: string;
  trustLevel: TrustLevel;
  messagesSinceExtract: number;
  lastExtractionTimestamp: string | null;
  interrupted?: boolean;
  /**
   * Most recently started, not-yet-ended tool call — used by the dashboard
   * overview to show "Using Bash: git commit" style labels. Cleared on
   * tool_end / message completion.
   */
  currentTool: CurrentTool | null;
  /**
   * Whether the SDK has an in-flight query turn (roughly: thinking or
   * streaming). Flipped true on thinking_start / tool_start, false on
   * result / interrupted.
   */
  hasActiveQuery: boolean;
};

const activeSessions = new Map<string, ActiveSession>();

/**
 * Pending permission requests waiting for user response.
 * Keyed by a unique request ID.
 */
type PendingPermission = {
  resolve: (result: PermissionResult) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timeout: ReturnType<typeof setTimeout>;
};

const pendingPermissions = new Map<string, PendingPermission>();

/**
 * Respond to a pending permission request from the UI.
 */
export function respondToPermission(
  requestId: string,
  decision: "allow" | "deny",
  options?: { reason?: string; alternative?: string; createRule?: boolean }
) {
  const pending = pendingPermissions.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingPermissions.delete(requestId);

  if (decision === "allow") {
    // If createRule, persist an allow rule for this tool pattern
    if (options?.createRule) {
      const session = activeSessions.get(pending.sessionId);
      if (session) {
        createAllowRule(session.projectId, pending.toolName).catch(console.error);
      }
    }
    pending.resolve({ behavior: "allow", updatedInput: pending.input });
  } else {
    const message = [
      "The user denied this action.",
      options?.reason ? `Reason: ${options.reason}` : "",
      options?.alternative ? `Suggested alternative: ${options.alternative}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    pending.resolve({ behavior: "deny", message, interrupt: false });
  }
}

/**
 * Get all pending permission requests for a session.
 */
export function getPendingPermissions(sessionId: string) {
  const result: { id: string; toolName: string; input: Record<string, unknown> }[] = [];
  for (const [id, pending] of pendingPermissions) {
    if (pending.sessionId === sessionId) {
      result.push({ id, toolName: pending.toolName, input: pending.input });
    }
  }
  return result;
}

/**
 * Get a map of session IDs to the tool name of their oldest pending permission.
 * Used by the session rail + quick switcher to surface "blocked" sessions.
 */
export function getBlockedSessionsSummary(): Record<string, { toolName: string; preview: string }> {
  const summary: Record<string, { toolName: string; preview: string }> = {};
  const stale: string[] = [];
  for (const [id, pending] of pendingPermissions) {
    // Lazy sweep: drop permissions for sessions that are no longer active.
    // Handles leftover state from crashes, reloads, or pre-fix sessions.
    if (!activeSessions.has(pending.sessionId)) {
      clearTimeout(pending.timeout);
      try {
        pending.resolve({ behavior: "deny", message: "Session no longer active" });
      } catch {}
      stale.push(id);
      continue;
    }
    if (summary[pending.sessionId]) continue; // first-wins (oldest)
    const input = pending.input as Record<string, unknown>;
    const preview =
      (typeof input.command === "string" && input.command) ||
      (typeof input.file_path === "string" && input.file_path) ||
      (typeof input.path === "string" && input.path) ||
      (typeof input.url === "string" && input.url) ||
      "";
    summary[pending.sessionId] = { toolName: pending.toolName, preview: String(preview).slice(0, 120) };
  }
  for (const id of stale) pendingPermissions.delete(id);
  return summary;
}

/**
 * Build the canUseTool callback for a session.
 * This integrates our permission engine with the SDK.
 */
function buildCanUseTool(sessionId: string, projectId: string, trustLevel: TrustLevel) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string; title?: string }
  ): Promise<PermissionResult> => {
    const result = await evaluatePermission(projectId, trustLevel, { toolName, input });

    if (result.decision === "allow") {
      // For auto_log mode, emit a log event
      if (trustLevel === "auto_log" || (result.matchedRuleId && trustLevel !== "full_auto")) {
        sessionEventBus.emit(sessionId, {
          type: "auto_approval_log",
          toolName,
          input,
          decision: "allow",
          reason: result.reason,
          timestamp: Date.now(),
        });
      }
      // Pass the original input back as updatedInput — some SDK Zod schemas
      // require this field even though the type marks it optional.
      return { behavior: "allow", updatedInput: input };
    }

    if (result.decision === "deny") {
      return {
        behavior: "deny",
        message: `Denied by project rule: ${result.reason}`,
        interrupt: false,
      };
    }

    // decision === "ask" — emit permission request to UI and wait
    const requestId = crypto.randomUUID();

    sessionEventBus.emit(sessionId, {
      type: "permission_request",
      requestId,
      toolName,
      input,
      title: options.title || `Claude wants to use ${toolName}`,
      timestamp: Date.now(),
    });

    // Wait for user response with 5-minute timeout
    return new Promise<PermissionResult>((resolve) => {
      const timeout = setTimeout(() => {
        pendingPermissions.delete(requestId);
        sessionEventBus.emit(sessionId, {
          type: "permission_timeout",
          requestId,
          timestamp: Date.now(),
        });
        resolve({ behavior: "deny", message: "Permission request timed out (5 minutes). The user did not respond." });
      }, 5 * 60 * 1000);

      pendingPermissions.set(requestId, {
        resolve,
        toolName,
        input,
        sessionId,
        timeout,
      });
    });
  };
}

function processMessages(
  q: Query,
  sessionId: string,
  onSdkSessionId?: (id: string) => void
) {
  (async () => {
    try {
      // Emit thinking_start at the beginning of processing
      sessionEventBus.emit(sessionId, { type: "thinking_start", timestamp: Date.now() });
      let isThinking = true;
      const emittedToolIds = new Set<string>();
      let lastStreamedText = "";

      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          const sdkId = message.session_id;
          onSdkSessionId?.(sdkId);
          await db
            .update(schema.sessions)
            .set({ sdkSessionId: sdkId, updatedAt: new Date().toISOString() })
            .where(eq(schema.sessions.id, sessionId));
        }

        // Handle partial/streaming messages — these arrive with includePartialMessages
        if (message.type === "stream_event") {
          if (isThinking) {
            sessionEventBus.emit(sessionId, { type: "thinking_end", timestamp: Date.now() });
            isThinking = false;
          }

          // Extract text deltas from the stream event
          const event = (message as any).event;
          if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
            sessionEventBus.emit(sessionId, {
              type: "text_delta",
              text: event.delta.text,
              timestamp: Date.now(),
            });
          }
        }

        // Handle tool progress messages
        if (message.type === "tool_progress") {
          if (isThinking) {
            sessionEventBus.emit(sessionId, { type: "thinking_end", timestamp: Date.now() });
            isThinking = false;
          }

          const toolName = (message as any).tool_name || (message as any).toolName || "unknown";
          const toolUseId = (message as any).tool_use_id || (message as any).toolUseId || "";

          if (toolUseId && !emittedToolIds.has(toolUseId)) {
            emittedToolIds.add(toolUseId);
            const toolInput = (message as any).input || {};
            const entry = activeSessions.get(sessionId);
            if (entry) {
              entry.currentTool = {
                toolUseId,
                toolName,
                input: toolInput,
                startedAt: Date.now(),
              };
              entry.hasActiveQuery = true;
            }
            sessionEventBus.emit(sessionId, {
              type: "tool_start",
              toolUseId,
              toolName,
              input: toolInput,
              timestamp: Date.now(),
            });
          }
        }

        // Detect tool errors carried back on user messages as tool_result blocks.
        // Surfaces silent SDK refusals (out-of-cwd reads in acceptEdits, etc.)
        // so the user isn't left wondering why Claude gave up.
        if (message.type === "user" && (message as any).message?.content) {
          const blocks = (message as any).message.content;
          if (Array.isArray(blocks)) {
            for (const b of blocks) {
              if (b?.type === "tool_result" && b.is_error === true) {
                const raw =
                  typeof b.content === "string"
                    ? b.content
                    : Array.isArray(b.content)
                    ? b.content.map((c: any) => c?.text ?? "").join("\n")
                    : "";
                const lower = raw.toLowerCase();
                let hint: "path_outside_cwd" | "permission_denied" | "other" = "other";
                if (
                  lower.includes("outside") &&
                  (lower.includes("working directory") || lower.includes("allowed"))
                ) {
                  hint = "path_outside_cwd";
                } else if (
                  lower.includes("permission") ||
                  lower.includes("denied") ||
                  lower.includes("not allowed")
                ) {
                  hint = "permission_denied";
                }
                sessionEventBus.emit(sessionId, {
                  type: "tool_error",
                  toolUseId: b.tool_use_id || "",
                  toolName: "",
                  message: raw.slice(0, 400),
                  hint,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }

        // Handle full assistant messages (these arrive after streaming completes)
        if (message.type === "assistant" && message.message?.content) {
          if (isThinking) {
            sessionEventBus.emit(sessionId, { type: "thinking_end", timestamp: Date.now() });
            isThinking = false;
          }

          const textContent = message.message.content
            .filter((b: any) => "text" in b)
            .map((b: any) => b.text)
            .join("\n");

          const toolBlocks = message.message.content.filter(
            (b: any) => "name" in b
          );

          const thinkingContent = message.message.content
            .filter((b: any) => b.type === "thinking" || "thinking" in b)
            .map((b: any) => b.thinking || b.text || "")
            .filter(Boolean)
            .join("\n\n");

          // Emit tool_start for tools we haven't seen via tool_progress
          for (const block of toolBlocks) {
            const toolId = (block as any).id || crypto.randomUUID();
            if (!emittedToolIds.has(toolId)) {
              emittedToolIds.add(toolId);
              const toolInput = (block as any).input || {};
              const entry = activeSessions.get(sessionId);
              if (entry) {
                entry.currentTool = {
                  toolUseId: toolId,
                  toolName: (block as any).name,
                  input: toolInput,
                  startedAt: Date.now(),
                };
                entry.hasActiveQuery = true;
              }
              sessionEventBus.emit(sessionId, {
                type: "tool_start",
                toolUseId: toolId,
                toolName: (block as any).name,
                input: toolInput,
                timestamp: Date.now(),
              });
            }
          }

          // If we didn't stream text deltas, emit the full text now
          if (textContent && !lastStreamedText) {
            sessionEventBus.emit(sessionId, {
              type: "text_delta",
              text: textContent,
              timestamp: Date.now(),
            });
          }
          lastStreamedText = "";

          // Persist to database — save if there is ANY content: text, tools, or thinking.
          // Tool-only turns get an empty content string so the caret still renders.
          if (textContent || toolBlocks.length > 0 || thinkingContent) {
            const insertedMessage = await db.insert(schema.messages).values({
              sessionId,
              role: "assistant",
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
              thinking: thinkingContent || null,
            }).returning({ id: schema.messages.id });

            sessionEventBus.emit(sessionId, {
              type: "message_complete",
              messageId: insertedMessage[0]?.id || crypto.randomUUID(),
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
              timestamp: Date.now(),
            });
          }

          // Incremental extraction: every 10 persisted user+assistant messages,
          // trigger a background extraction for memories.
          {
            const entry = activeSessions.get(sessionId);
            if (entry) {
              entry.messagesSinceExtract += 1;
              if (entry.messagesSinceExtract >= 10) {
                const since = entry.lastExtractionTimestamp;
                entry.messagesSinceExtract = 0;
                entry.lastExtractionTimestamp = new Date().toISOString();
                // Fire-and-forget
                import("./knowledge-extractor").then(({ extractIncremental }) =>
                  extractIncremental(sessionId, since).catch((err) =>
                    console.error(`Incremental extract failed for ${sessionId}:`, err)
                  )
                );
              }
            }
          }

          // Emit tool_end for completed tools
          for (const block of toolBlocks) {
            const endedToolId = (block as any).id || "";
            const entry = activeSessions.get(sessionId);
            if (entry && entry.currentTool && entry.currentTool.toolUseId === endedToolId) {
              entry.currentTool = null;
            }
            sessionEventBus.emit(sessionId, {
              type: "tool_end",
              toolUseId: endedToolId,
              toolName: (block as any).name,
              output: (block as any).output || null,
              timestamp: Date.now(),
            });
          }

          // Reset for next thinking phase
          isThinking = true;
          sessionEventBus.emit(sessionId, { type: "thinking_start", timestamp: Date.now() });
        }

        if (message.type === "result") {
          if (isThinking) {
            sessionEventBus.emit(sessionId, { type: "thinking_end", timestamp: Date.now() });
            isThinking = false;
          }

          // Turn finished — clear live-state flags so the dashboard shows Idle.
          {
            const entry = activeSessions.get(sessionId);
            if (entry) {
              entry.hasActiveQuery = false;
              entry.currentTool = null;
            }
          }

          if (message.subtype === "success") {
            // Extract tokens from either the primary usage or modelUsage
            let newTokens = 0;
            const u = (message as any).usage;
            if (u) {
              newTokens = (u.input_tokens || 0) + (u.output_tokens || 0);
              // Include cache tokens too
              newTokens += (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
            }

            // Fall back to modelUsage if primary usage is empty
            if (newTokens === 0) {
              const modelUsage = (message as any).modelUsage;
              if (modelUsage && typeof modelUsage === "object") {
                for (const mu of Object.values(modelUsage) as any[]) {
                  if (mu) {
                    newTokens += (mu.inputTokens || 0) + (mu.outputTokens || 0);
                    newTokens += (mu.cacheCreationInputTokens || 0) + (mu.cacheReadInputTokens || 0);
                  }
                }
              }
            }

            const newCost = (message as any).total_cost_usd || 0;
            const newTurns = (message as any).num_turns || 0;

            console.log(`[session ${sessionId}] result: tokens=${newTokens}, cost=${newCost}, turns=${newTurns}`);

            const current = await db.query.sessions.findFirst({
              where: eq(schema.sessions.id, sessionId),
              columns: { usage: true },
            });
            const prev = (current?.usage as any) || { totalTokens: 0, totalCostUsd: 0, numTurns: 0 };

            const updatedUsage = {
              totalTokens: prev.totalTokens + newTokens,
              totalCostUsd: prev.totalCostUsd + newCost,
              numTurns: prev.numTurns + newTurns,
            };

            await db
              .update(schema.sessions)
              .set({
                status: "active",
                updatedAt: new Date().toISOString(),
                usage: updatedUsage,
              })
              .where(eq(schema.sessions.id, sessionId));

            sessionEventBus.emit(sessionId, {
              type: "result",
              success: true,
              totalCostUsd: updatedUsage.totalCostUsd,
              totalTokens: updatedUsage.totalTokens,
              numTurns: updatedUsage.numTurns,
              timestamp: Date.now(),
            });
          } else if ((message as any).subtype === "interrupt" || activeSessions.get(sessionId)?.interrupted) {
            // SDK may emit a terminal result with subtype "interrupt" after
            // query.interrupt() — treat as benign, session stays active.
            await db
              .update(schema.sessions)
              .set({ status: "active", updatedAt: new Date().toISOString() })
              .where(eq(schema.sessions.id, sessionId));
          } else {
            // error case — unchanged
            await db
              .update(schema.sessions)
              .set({ updatedAt: new Date().toISOString() })
              .where(eq(schema.sessions.id, sessionId));

            sessionEventBus.emit(sessionId, {
              type: "error",
              error: (message as any).error || (message as any).errors?.join(", ") || "Session ended with an error",
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (error) {
      const entry = activeSessions.get(sessionId);
      const wasInterrupted = entry?.interrupted === true;
      clearPendingPermissionsForSession(sessionId);

      if (wasInterrupted) {
        // User interrupt — interruptSession() already emitted "interrupted"
        // and re-asserted status=active. Swallow the abort without closing
        // the SSE stream or touching session status.
        if (entry) entry.interrupted = false;
      } else {
        console.error(`Session ${sessionId} error:`, error);
        const raw = error instanceof Error ? error.message : "Unknown error";
        // Strip enormous stack dumps from SDK errors — keep the first line.
        const short = raw.split("\n")[0].slice(0, 240);
        sessionEventBus.emit(sessionId, {
          type: "error",
          error: short,
          timestamp: Date.now(),
        });
        await db
          .update(schema.sessions)
          .set({ status: "errored", updatedAt: new Date().toISOString() })
          .where(eq(schema.sessions.id, sessionId));
      }
    }
  })();
}

/**
 * Map trust level to SDK permission mode.
 * - full_auto → acceptEdits (no prompts, no callbacks)
 * - auto_log → acceptEdits (auto-allow, we log separately)
 * - ask_me → default + canUseTool (prompt user via UI)
 *
 * Note: auto_log previously used canUseTool to auto-allow with logging,
 * but the SDK's Zod validation on PermissionResult caused errors.
 * Using acceptEdits for auto_log avoids the issue entirely.
 */
/**
 * Build a PreToolUse hook that forces every tool through the ask flow.
 *
 * The SDK's `permissionMode: "default"` has a built-in classification of
 * "safe" vs "dangerous" tools — safe ones (Read/Glob/Grep/Edit/Write)
 * auto-execute without invoking canUseTool. To force confirmation on
 * every tool, we register a PreToolUse hook that returns
 * `permissionDecision: 'ask'`. The SDK then routes the call through
 * canUseTool, where our permission engine decides.
 */
function buildPreToolUseAskHook() {
  return async () => ({
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "ask" as const,
    },
  });
}

function getPermissionConfig(
  sessionId: string,
  projectId: string,
  trustLevel: TrustLevel
): { permissionMode: string; canUseTool?: any; hooks?: any } {
  if (trustLevel === "full_auto") {
    // bypassPermissions skips the SDK's cwd guardrail too — true unattended mode.
    return { permissionMode: "bypassPermissions" };
  }
  // auto_log + ask_me both route through canUseTool so every tool (Read,
  // Bash, Write, etc.) passes through our engine. For auto_log the engine
  // returns allow + logs; for ask_me it returns allow/deny/ask per rules.
  // acceptEdits alone wasn't enough because SDK's built-in classifier only
  // auto-accepts edits — Bash and others fell into a dead prompt path.
  return {
    permissionMode: "default",
    canUseTool: buildCanUseTool(sessionId, projectId, trustLevel),
    hooks: {
      PreToolUse: [
        {
          hooks: [buildPreToolUseAskHook()],
        },
      ],
    },
  };
}

export async function startSession(
  sessionId: string,
  projectPath: string,
  model: string,
  initialPrompt: string,
  effort?: string
): Promise<void> {
  const abortController = new AbortController();

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Reset any lingering errored status — starting a turn means the session
  // is alive again.
  if (session.status === "errored") {
    await db
      .update(schema.sessions)
      .set({ status: "active", updatedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, sessionId));
  }

  const trustLevel = (session.trustLevel as TrustLevel) || "auto_log";
  const permConfig = getPermissionConfig(sessionId, session.projectId, trustLevel);

  const knowledgeEntries = await db.query.knowledge.findMany({
    where: eq(schema.knowledge.projectId, session.projectId),
    orderBy: [desc(schema.knowledge.createdAt)],
    limit: 20,
  });

  let systemAppend = "";
  if (knowledgeEntries.length > 0) {
    const formatted = knowledgeEntries
      .map((k) => `- [${k.type}] ${k.content}`)
      .join("\n");
    systemAppend = `\n\nHere is context from previous sessions on this project:\n${formatted}`;
  }

  // If enabled, append matched doc content to the system prompt.
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, session.projectId),
  });
  if (project?.autoInjectDocs) {
    const docInjection = await buildDocInjection(projectPath, project.docGlobs);
    if (docInjection) {
      systemAppend += docInjection;
    }
  }

  const extraDirs = project?.additionalDirectories ?? [];
  const q = query({
    prompt: initialPrompt,
    options: {
      cwd: projectPath,
      ...(extraDirs.length > 0 ? { additionalDirectories: extraDirs } : {}),
      model,
      effort: (effort as "low" | "medium" | "high" | "max") || "high",
      abortController,
      includePartialMessages: true,
      thinking: { type: "enabled", budgetTokens: 10000 },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: systemAppend,
      },
      permissionMode: permConfig.permissionMode as any,
      ...(permConfig.canUseTool ? { canUseTool: permConfig.canUseTool } : {}),
      ...(permConfig.hooks ? { hooks: permConfig.hooks } : {}),
    },
  });

  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId: null,
    abortController,
    projectId: session.projectId,
    trustLevel,
    messagesSinceExtract: 0,
    lastExtractionTimestamp: null,
    currentTool: null,
    hasActiveQuery: true,
  };
  activeSessions.set(sessionId, entry);

  processMessages(q, sessionId, (sdkId) => {
    entry.sdkSessionId = sdkId;
  });
}

type Attachment = { path: string; name: string };

export async function sendMessage(
  sessionId: string,
  content: string,
  attachments?: Attachment[]
): Promise<void> {
  let fullPrompt = content;
  if (attachments && attachments.length > 0) {
    const imagePaths = attachments.map((a) => a.path).join("\n");
    fullPrompt = `${content}\n\n[Attached images — read these files to view them:\n${imagePaths}\n]`;
  }

  // Persist user message
  await db.insert(schema.messages).values({
    sessionId,
    role: "user",
    content,
    ...(attachments ? { toolUse: attachments } : {}),
  });

  {
    const activeForCounter = activeSessions.get(sessionId);
    if (activeForCounter) activeForCounter.messagesSinceExtract += 1;
  }

  let active = activeSessions.get(sessionId);

  let sdkSessionId: string | null = null;
  let projectId: string | null = null;
  let trustLevel: TrustLevel = "auto_log";

  if (active) {
    sdkSessionId = active.sdkSessionId;
    projectId = active.projectId;
    trustLevel = active.trustLevel;
    try {
      active.query.close();
    } catch {
      // Already closed
    }
  }

  if (!sdkSessionId || !projectId) {
    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, sessionId),
    });
    sdkSessionId = sdkSessionId ?? session?.sdkSessionId ?? null;
    projectId = projectId ?? session?.projectId ?? null;
    trustLevel = (session?.trustLevel as TrustLevel) ?? "auto_log";
  }

  if (!sdkSessionId) {
    // Cold start: session was created without an initial prompt, so no SDK
    // session exists yet. This message IS the first prompt — delegate to
    // startSession which owns the SDK query setup. The user message row was
    // already inserted above, which is exactly what startSession's normal
    // flow also produces.
    if (!projectId) {
      throw new Error(`Session ${sessionId} has no project assigned; cannot cold-start.`);
    }
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
    });
    if (!project) throw new Error(`Project ${projectId} not found`);

    const sessionRow = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, sessionId),
    });
    const coldModel = sessionRow?.model ?? "claude-sonnet-4-6";
    const coldEffort = sessionRow?.effort ?? undefined;

    await startSession(sessionId, project.path, coldModel, fullPrompt, coldEffort);
    return;
  }

  const permConfig = getPermissionConfig(sessionId, projectId!, trustLevel);
  const projectRow = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId!),
    columns: { additionalDirectories: true },
  });
  const extraDirs = projectRow?.additionalDirectories ?? [];

  const abortController = new AbortController();
  const q = query({
    prompt: fullPrompt,
    options: {
      resume: sdkSessionId,
      ...(extraDirs.length > 0 ? { additionalDirectories: extraDirs } : {}),
      abortController,
      includePartialMessages: true,
      thinking: { type: "enabled", budgetTokens: 10000 },
      permissionMode: permConfig.permissionMode as any,
      ...(permConfig.canUseTool ? { canUseTool: permConfig.canUseTool } : {}),
      ...(permConfig.hooks ? { hooks: permConfig.hooks } : {}),
    },
  });

  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId,
    abortController,
    projectId: projectId!,
    trustLevel,
    messagesSinceExtract: active?.messagesSinceExtract ?? 0,
    lastExtractionTimestamp: active?.lastExtractionTimestamp ?? null,
    currentTool: null,
    hasActiveQuery: true,
  };
  activeSessions.set(sessionId, entry);

  processMessages(q, sessionId, (newSdkId) => {
    entry.sdkSessionId = newSdkId;
  });
}

export async function completeSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    try {
      active.query.close();
    } catch {
      // Already closed
    }
    activeSessions.delete(sessionId);
  }

  // Clean up any pending permissions
  for (const [id, pending] of pendingPermissions) {
    if (pending.sessionId === sessionId) {
      clearTimeout(pending.timeout);
      pendingPermissions.delete(id);
    }
  }

  await db
    .update(schema.sessions)
    .set({ status: "completed", updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, sessionId));
}

/**
 * Interrupt the current turn without ending the session. The SDK's
 * query.interrupt() cancels mid-turn work; the session stays active and
 * can accept the next user message. For unrecoverable states, use pause.
 */
function clearPendingPermissionsForSession(sessionId: string) {
  for (const [id, pending] of pendingPermissions) {
    if (pending.sessionId === sessionId) {
      clearTimeout(pending.timeout);
      try {
        pending.resolve({ behavior: "deny", message: "Session interrupted or ended" });
      } catch {}
      pendingPermissions.delete(id);
    }
  }
}

export async function interruptSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (!active) return;
  active.interrupted = true;
  clearPendingPermissionsForSession(sessionId);
  try {
    await active.query.interrupt();
  } catch (err) {
    try {
      active.abortController.abort();
    } catch {}
    console.error(`[session ${sessionId}] interrupt failed:`, err);
  }
  // Defensively re-assert active status — some SDK paths may touch it.
  await db
    .update(schema.sessions)
    .set({ status: "active", updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, sessionId));
  sessionEventBus.emit(sessionId, { type: "interrupted", timestamp: Date.now() });
}

export async function pauseSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    try {
      active.query.close();
    } catch {
      // Already closed
    }
    activeSessions.delete(sessionId);
  }

  // Clean up any pending permissions
  for (const [id, pending] of pendingPermissions) {
    if (pending.sessionId === sessionId) {
      clearTimeout(pending.timeout);
      pendingPermissions.delete(id);
    }
  }

  await db
    .update(schema.sessions)
    .set({ status: "paused", updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, sessionId));

  // Extract knowledge on pause (previously only on complete).
  import("./knowledge-extractor").then(({ extractKnowledge }) =>
    extractKnowledge(sessionId).catch((err) =>
      console.error(`Pause-time extraction failed for ${sessionId}:`, err)
    )
  );
}

export async function resumeSession(sessionId: string, resumeNote?: string): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (!session.sdkSessionId) throw new Error(`Session ${sessionId} has no SDK session to resume`);

  const trustLevel = (session.trustLevel as TrustLevel) || "auto_log";
  const permConfig = getPermissionConfig(sessionId, session.projectId, trustLevel);

  // Query new knowledge entries since the session was last updated (paused)
  const knowledgeConditions = [eq(schema.knowledge.projectId, session.projectId)];
  if (session.updatedAt) {
    knowledgeConditions.push(gt(schema.knowledge.createdAt, session.updatedAt));
  }
  const newKnowledge = await db.query.knowledge.findMany({
    where: and(...knowledgeConditions),
    orderBy: [desc(schema.knowledge.createdAt)],
    limit: 20,
  });

  // Build the resume prompt
  const parts: string[] = [];

  if (resumeNote) {
    parts.push(`The user wants you to focus on: ${resumeNote}`);
  }

  if (newKnowledge.length > 0) {
    const formatted = newKnowledge
      .map((k) => `- [${k.type}] ${k.content}`)
      .join("\n");
    parts.push(`Here's what changed since you were paused:\n${formatted}`);
  }

  const resumePrompt = parts.length > 0
    ? parts.join("\n\n")
    : "Resume the session. Continue where you left off.";

  const projectRow = await db.query.projects.findFirst({
    where: eq(schema.projects.id, session.projectId),
    columns: { additionalDirectories: true },
  });
  const extraDirs = projectRow?.additionalDirectories ?? [];

  const abortController = new AbortController();
  const q = query({
    prompt: resumePrompt,
    options: {
      resume: session.sdkSessionId,
      ...(extraDirs.length > 0 ? { additionalDirectories: extraDirs } : {}),
      abortController,
      includePartialMessages: true,
      permissionMode: permConfig.permissionMode as any,
      ...(permConfig.canUseTool ? { canUseTool: permConfig.canUseTool } : {}),
      ...(permConfig.hooks ? { hooks: permConfig.hooks } : {}),
    },
  });

  const existingEntry = activeSessions.get(sessionId);
  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId: session.sdkSessionId,
    abortController,
    projectId: session.projectId,
    trustLevel,
    messagesSinceExtract: existingEntry?.messagesSinceExtract ?? 0,
    lastExtractionTimestamp: existingEntry?.lastExtractionTimestamp ?? null,
    currentTool: null,
    hasActiveQuery: true,
  };
  activeSessions.set(sessionId, entry);

  // Persist the resume prompt as a user message
  await db.insert(schema.messages).values({
    sessionId,
    role: "user",
    content: resumePrompt,
  });

  processMessages(q, sessionId, (newSdkId) => {
    entry.sdkSessionId = newSdkId;
  });
}

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function getActiveSessions(): Map<string, ActiveSession> {
  return activeSessions;
}

/**
 * Dashboard-friendly snapshot of a session's in-memory live state.
 * Returns null when the session isn't currently active in this process
 * (paused, completed, or not yet started).
 */
export type LiveSessionSummary = {
  hasActiveQuery: boolean;
  currentToolName: string | null;
  currentToolInput: Record<string, unknown> | null;
  currentToolStartedAt: number | null;
};

export function getLiveSessionSummary(sessionId: string): LiveSessionSummary | null {
  const active = activeSessions.get(sessionId);
  if (!active) return null;
  return {
    hasActiveQuery: active.hasActiveQuery,
    currentToolName: active.currentTool?.toolName ?? null,
    currentToolInput: active.currentTool?.input ?? null,
    currentToolStartedAt: active.currentTool?.startedAt ?? null,
  };
}

export function getAllLiveSessionSummaries(): Record<string, LiveSessionSummary> {
  const out: Record<string, LiveSessionSummary> = {};
  for (const [id, active] of activeSessions) {
    out[id] = {
      hasActiveQuery: active.hasActiveQuery,
      currentToolName: active.currentTool?.toolName ?? null,
      currentToolInput: active.currentTool?.input ?? null,
      currentToolStartedAt: active.currentTool?.startedAt ?? null,
    };
  }
  return out;
}

export async function getSessionCommands(sessionId: string): Promise<{ name: string; description: string; argumentHint: string }[]> {
  const active = activeSessions.get(sessionId);
  if (!active) return [];

  try {
    const commands = await active.query.supportedCommands();
    return commands;
  } catch {
    return [];
  }
}
