import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

type ActiveSession = {
  query: Query;
  sessionId: string;
  sdkSessionId: string | null;
  abortController: AbortController;
};

const activeSessions = new Map<string, ActiveSession>();

export async function startSession(
  sessionId: string,
  projectPath: string,
  model: string,
  initialPrompt: string,
  effort?: string
): Promise<void> {
  const abortController = new AbortController();

  // Fetch knowledge for context injection
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

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
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: systemAppend,
      },
      permissionMode: "acceptEdits",
    },
  });

  let sdkSessionId: string | null = null;

  // Process messages in background
  (async () => {
    try {
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          sdkSessionId = message.session_id;
          await db
            .update(schema.sessions)
            .set({ sdkSessionId: message.session_id, updatedAt: new Date().toISOString() })
            .where(eq(schema.sessions.id, sessionId));
        }

        if (message.type === "assistant" && message.message?.content) {
          const textContent = message.message.content
            .filter((b: any) => "text" in b)
            .map((b: any) => b.text)
            .join("\n");

          const toolBlocks = message.message.content.filter(
            (b: any) => "name" in b
          );

          if (textContent) {
            await db.insert(schema.messages).values({
              sessionId,
              role: "assistant",
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
            });
          }
        }

        if (message.type === "result") {
          await db
            .update(schema.sessions)
            .set({
              status: message.subtype === "success" ? "active" : "errored",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(schema.sessions.id, sessionId));
        }
      }
    } catch (error) {
      await db
        .update(schema.sessions)
        .set({ status: "errored", updatedAt: new Date().toISOString() })
        .where(eq(schema.sessions.id, sessionId));
    }
  })();

  activeSessions.set(sessionId, {
    query: q,
    sessionId,
    sdkSessionId,
    abortController,
  });
}

export async function sendMessage(
  sessionId: string,
  content: string
): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (!active) throw new Error(`No active session ${sessionId}`);

  // Persist user message
  await db.insert(schema.messages).values({
    sessionId,
    role: "user",
    content,
  });

  // Close current query and start a new one resuming the SDK session
  active.query.close();

  const abortController = new AbortController();
  const q = query({
    prompt: content,
    options: {
      resume: active.sdkSessionId ?? undefined,
      abortController,
      permissionMode: "acceptEdits",
    },
  });

  // Process response messages
  (async () => {
    try {
      for await (const message of q) {
        if (message.type === "assistant" && message.message?.content) {
          const textContent = message.message.content
            .filter((b: any) => "text" in b)
            .map((b: any) => b.text)
            .join("\n");

          const toolBlocks = message.message.content.filter(
            (b: any) => "name" in b
          );

          if (textContent) {
            await db.insert(schema.messages).values({
              sessionId,
              role: "assistant",
              content: textContent,
              toolUse: toolBlocks.length > 0 ? toolBlocks : null,
            });
          }
        }

        if (message.type === "result") {
          await db
            .update(schema.sessions)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(schema.sessions.id, sessionId));
        }
      }
    } catch (error) {
      console.error(`Session ${sessionId} error:`, error);
    }
  })();

  activeSessions.set(sessionId, {
    ...active,
    query: q,
    abortController,
  });
}

export async function completeSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    active.query.close();
    activeSessions.delete(sessionId);
  }

  await db
    .update(schema.sessions)
    .set({ status: "completed", updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, sessionId));
}

export async function pauseSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    active.query.close();
    activeSessions.delete(sessionId);
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
