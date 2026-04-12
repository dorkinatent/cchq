import { query, type Query, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { evaluatePermission, type TrustLevel } from "@/lib/permissions/engine";
import { createAllowRule } from "@/lib/permissions/rules";
import { sessionEventBus } from "./stream-events";

type ActiveSession = {
  query: Query;
  sessionId: string;
  sdkSessionId: string | null;
  abortController: AbortController;
  projectId: string;
  trustLevel: TrustLevel;
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
    pending.resolve({ behavior: "allow" });
  } else {
    const message = [
      "The user denied this action.",
      options?.reason ? `Reason: ${options.reason}` : "",
      options?.alternative ? `Suggested alternative: ${options.alternative}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    pending.resolve({ behavior: "deny", message });
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
      return { behavior: "allow" };
    }

    if (result.decision === "deny") {
      return { behavior: "deny", message: `Denied by project rule: ${result.reason}` };
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
            sessionEventBus.emit(sessionId, {
              type: "tool_start",
              toolUseId,
              toolName,
              input: (message as any).input || {},
              timestamp: Date.now(),
            });
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

          // Emit tool_start for tools we haven't seen via tool_progress
          for (const block of toolBlocks) {
            const toolId = (block as any).id || crypto.randomUUID();
            if (!emittedToolIds.has(toolId)) {
              emittedToolIds.add(toolId);
              sessionEventBus.emit(sessionId, {
                type: "tool_start",
                toolUseId: toolId,
                toolName: (block as any).name,
                input: (block as any).input || {},
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

          // Persist to database
          if (textContent) {
            const insertedMessage = await db.insert(schema.messages).values({
              sessionId,
              role: "assistant",
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
            }).returning({ id: schema.messages.id });

            sessionEventBus.emit(sessionId, {
              type: "message_complete",
              messageId: insertedMessage[0]?.id || crypto.randomUUID(),
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
              timestamp: Date.now(),
            });
          }

          // Emit tool_end for completed tools
          for (const block of toolBlocks) {
            sessionEventBus.emit(sessionId, {
              type: "tool_end",
              toolUseId: (block as any).id || "",
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
          // End any active thinking phase
          if (isThinking) {
            sessionEventBus.emit(sessionId, { type: "thinking_end", timestamp: Date.now() });
            isThinking = false;
          }
          if (message.subtype === "success") {
            // Fetch current usage to accumulate
            const current = await db.query.sessions.findFirst({
              where: eq(schema.sessions.id, sessionId),
              columns: { usage: true },
            });
            const prev = (current?.usage as any) || { totalTokens: 0, totalCostUsd: 0, numTurns: 0 };
            const newTokens = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

            const updatedUsage = {
              totalTokens: prev.totalTokens + newTokens,
              totalCostUsd: prev.totalCostUsd + (message.total_cost_usd || 0),
              numTurns: prev.numTurns + (message.num_turns || 0),
            };

            await db
              .update(schema.sessions)
              .set({
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
          } else {
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
      console.error(`Session ${sessionId} error:`, error);

      sessionEventBus.emit(sessionId, {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });

      await db
        .update(schema.sessions)
        .set({ status: "errored", updatedAt: new Date().toISOString() })
        .where(eq(schema.sessions.id, sessionId));
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
function getPermissionConfig(
  sessionId: string,
  projectId: string,
  trustLevel: TrustLevel
): { permissionMode: string; canUseTool?: any } {
  if (trustLevel === "full_auto" || trustLevel === "auto_log") {
    return { permissionMode: "acceptEdits" };
  }
  // Only ask_me uses the custom callback
  return {
    permissionMode: "default",
    canUseTool: buildCanUseTool(sessionId, projectId, trustLevel),
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

  const q = query({
    prompt: initialPrompt,
    options: {
      cwd: projectPath,
      model,
      effort: (effort as "low" | "medium" | "high" | "max") || "high",
      abortController,
      includePartialMessages: true,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: systemAppend,
      },
      permissionMode: permConfig.permissionMode as any,
      ...(permConfig.canUseTool ? { canUseTool: permConfig.canUseTool } : {}),
    },
  });

  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId: null,
    abortController,
    projectId: session.projectId,
    trustLevel,
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
    throw new Error(`No SDK session found for ${sessionId}. The initial session may not have started properly.`);
  }

  const permConfig = getPermissionConfig(sessionId, projectId!, trustLevel);

  const abortController = new AbortController();
  const q = query({
    prompt: fullPrompt,
    options: {
      resume: sdkSessionId,
      abortController,
      includePartialMessages: true,
      permissionMode: permConfig.permissionMode as any,
      ...(permConfig.canUseTool ? { canUseTool: permConfig.canUseTool } : {}),
    },
  });

  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId,
    abortController,
    projectId: projectId!,
    trustLevel,
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
}

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function getActiveSessions(): Map<string, ActiveSession> {
  return activeSessions;
}
