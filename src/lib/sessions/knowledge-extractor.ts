import { query } from "@anthropic-ai/claude-agent-sdk";
import { db, schema } from "@/lib/db";
import { eq, gt, and, asc } from "drizzle-orm";

export type ExtractedKnowledge = {
  type: "decision" | "fact" | "context" | "summary";
  content: string;
  tags?: string[];
};

async function fetchExistingKnowledge(projectId: string) {
  return db.query.knowledge.findMany({
    where: eq(schema.knowledge.projectId, projectId),
    columns: { type: true, content: true },
    limit: 200,
  });
}

function formatExistingForPrompt(existing: { type: string; content: string }[]): string {
  if (existing.length === 0) return "(none yet)";
  return existing.map((k) => `- [${k.type}] ${k.content}`).join("\n");
}

async function callExtractor(
  conversationSummary: string,
  existing: { type: string; content: string }[]
): Promise<ExtractedKnowledge[]> {
  const prompt = `Review this conversation and extract NEW decisions, facts, and context that would be useful in future sessions on this project.

EXISTING MEMORIES (do not re-extract these or anything equivalent):
${formatExistingForPrompt(existing)}

Return ONLY a JSON array of objects with fields:
- type: "decision" | "fact" | "context" | "summary"
- content: string (one concise sentence)
- tags: string[] (optional)

Return [] if nothing new is worth remembering.

Conversation:
${conversationSummary}`;

  let resultText = "";
  try {
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
  } catch (err) {
    console.error("Knowledge extractor failed:", err);
    return [];
  }

  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.content === "string" &&
        ["decision", "fact", "context", "summary"].includes(e.type)
    );
  } catch {
    return [];
  }
}

async function persist(
  projectId: string,
  sessionId: string | null,
  entries: ExtractedKnowledge[],
  origin: "session_extract" | "manual" | "doc_seed"
) {
  for (const e of entries) {
    await db.insert(schema.knowledge).values({
      projectId,
      sessionId,
      type: e.type,
      content: e.content,
      tags: e.tags || [],
      origin,
    });
  }
}

/**
 * Original: extract from every message in the session. Called on complete.
 */
export async function extractKnowledge(sessionId: string): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return;

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: [asc(schema.messages.createdAt)],
  });
  if (messages.length === 0) return;

  const existing = await fetchExistingKnowledge(session.projectId);
  const conversationSummary = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const entries = await callExtractor(conversationSummary, existing);
  await persist(session.projectId, sessionId, entries, "session_extract");
}

/**
 * Background incremental: extract from messages since sinceTimestamp.
 * If sinceTimestamp is null, treat as "last 20 messages".
 */
export async function extractIncremental(
  sessionId: string,
  sinceTimestamp: string | null
): Promise<void> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return;

  const conditions = [eq(schema.messages.sessionId, sessionId)];
  if (sinceTimestamp) {
    conditions.push(gt(schema.messages.createdAt, sinceTimestamp));
  }
  const messages = await db.query.messages.findMany({
    where: and(...conditions),
    orderBy: [asc(schema.messages.createdAt)],
    limit: 50,
  });
  if (messages.length === 0) return;

  const existing = await fetchExistingKnowledge(session.projectId);
  const conversationSummary = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const entries = await callExtractor(conversationSummary, existing);
  await persist(session.projectId, sessionId, entries, "session_extract");
}

/**
 * Manual: extract from the last `count` messages in a session.
 * Returns the created entries so the API can respond with them.
 */
export async function extractFromRecentMessages(
  sessionId: string,
  count: number
): Promise<ExtractedKnowledge[]> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return [];

  const recent = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit: count,
  });
  if (recent.length === 0) return [];

  const ordered = recent.reverse();
  const existing = await fetchExistingKnowledge(session.projectId);
  const conversationSummary = ordered
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const entries = await callExtractor(conversationSummary, existing);
  await persist(session.projectId, sessionId, entries, "manual");
  return entries;
}

/**
 * Ingest the content of a doc file as knowledge entries.
 */
export async function extractFromDoc(
  projectId: string,
  filePath: string,
  fileContent: string
): Promise<number> {
  const existing = await fetchExistingKnowledge(projectId);

  const prompt = `This is project documentation from file: ${filePath}

Extract stable facts, decisions, and conventions as knowledge entries. Prefer 'fact' and 'decision' types. Avoid duplicating existing memories (listed below).

EXISTING MEMORIES:
${formatExistingForPrompt(existing)}

Return ONLY a JSON array of objects with fields: type, content, tags (optional).

Document content:
${fileContent}`;

  let resultText = "";
  try {
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
  } catch {
    return 0;
  }

  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return 0;

  let entries: ExtractedKnowledge[] = [];
  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return 0;
    entries = arr.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.content === "string" &&
        ["decision", "fact", "context", "summary"].includes(e.type)
    );
  } catch {
    return 0;
  }

  await persist(projectId, null, entries, "doc_seed");
  return entries.length;
}
