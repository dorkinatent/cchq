import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

type ActiveSession = {
  query: Query;
  sessionId: string;
  sdkSessionId: string | null;
  abortController: AbortController;
};

const activeSessions = new Map<string, ActiveSession>();

function processMessages(
  q: Query,
  sessionId: string,
  onSdkSessionId?: (id: string) => void
) {
  (async () => {
    try {
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          const sdkId = message.session_id;
          onSdkSessionId?.(sdkId);
          await db
            .update(schema.sessions)
            .set({ sdkSessionId: sdkId, updatedAt: new Date().toISOString() })
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
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(schema.sessions.id, sessionId));
        }
      }
    } catch (error) {
      console.error(`Session ${sessionId} error:`, error);
      await db
        .update(schema.sessions)
        .set({ status: "errored", updatedAt: new Date().toISOString() })
        .where(eq(schema.sessions.id, sessionId));
    }
  })();
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

  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId: null,
    abortController,
  };
  activeSessions.set(sessionId, entry);

  processMessages(q, sessionId, (sdkId) => {
    // Update the Map entry with the real SDK session ID
    entry.sdkSessionId = sdkId;
  });
}

export async function sendMessage(
  sessionId: string,
  content: string
): Promise<void> {
  // Persist user message first
  await db.insert(schema.messages).values({
    sessionId,
    role: "user",
    content,
  });

  let active = activeSessions.get(sessionId);

  // If no active session in memory (e.g. after server restart),
  // look up the SDK session ID from the database and resume
  let sdkSessionId: string | null = null;

  if (active) {
    sdkSessionId = active.sdkSessionId;
    try {
      active.query.close();
    } catch {
      // Already closed, that's fine
    }
  }

  // If we still don't have an SDK session ID, check the database
  if (!sdkSessionId) {
    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, sessionId),
    });
    sdkSessionId = session?.sdkSessionId ?? null;
  }

  if (!sdkSessionId) {
    throw new Error(`No SDK session found for ${sessionId}. The initial session may not have started properly.`);
  }

  const abortController = new AbortController();
  const q = query({
    prompt: content,
    options: {
      resume: sdkSessionId,
      abortController,
      permissionMode: "acceptEdits",
    },
  });

  const entry: ActiveSession = {
    query: q,
    sessionId,
    sdkSessionId,
    abortController,
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
