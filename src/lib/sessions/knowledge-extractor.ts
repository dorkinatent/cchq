import { query } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type ExtractedKnowledge = {
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags: string[];
};

export async function extractKnowledge(sessionId: string): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return;

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
  });

  if (messages.length === 0) return;

  const conversationSummary = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const prompt = `Review this conversation and extract key decisions, facts, and context that would be useful in future sessions on this project. Return a JSON array of objects with fields: type ("decision", "fact", "context", or "summary"), content (string), tags (string array).

Return ONLY the JSON array, no other text.

Conversation:
${conversationSummary}`;

  try {
    let resultText = "";

    for await (const message of query({
      prompt,
      options: {
        model: "claude-sonnet-4-6",
        maxTurns: 1,
        permissionMode: "default",
        allowedTools: [],
        persistSession: false,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        resultText = message.result;
      }
    }

    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const entries: ExtractedKnowledge[] = JSON.parse(jsonMatch[0]);

    for (const entry of entries) {
      if (!["decision", "fact", "context", "summary"].includes(entry.type)) continue;

      await db.insert(schema.knowledge).values({
        projectId: session.projectId,
        sessionId: session.id,
        type: entry.type,
        content: entry.content,
        tags: entry.tags,
      });
    }
  } catch (error) {
    console.error(`Knowledge extraction failed for session ${sessionId}:`, error);
  }
}
