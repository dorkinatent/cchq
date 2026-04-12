import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { startSession } from "@/lib/sessions/manager";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  const sessions = await db.query.sessions.findMany({
    where: projectId ? eq(schema.sessions.projectId, projectId) : undefined,
    orderBy: (sessions, { desc }) => [desc(sessions.updatedAt)],
  });
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const { projectId, name, model, effort, trustLevel, prompt } = await req.json();

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";

  const [session] = await db
    .insert(schema.sessions)
    .values({
      projectId,
      name,
      model: model || "claude-sonnet-4-6",
      trustLevel: trustLevel || "auto_log",
      effort: effort || "high",
      status: "active",
    })
    .returning();

  // Only kick off the SDK query + seed user message if we actually have
  // an initial prompt. Otherwise the session is created in "standing by"
  // mode — the first user message via sendMessage() will cold-start it.
  if (trimmedPrompt) {
    await startSession(session.id, project.path, session.model, trimmedPrompt, effort);

    await db.insert(schema.messages).values({
      sessionId: session.id,
      role: "user",
      content: trimmedPrompt,
    });
  }

  return NextResponse.json(session, { status: 201 });
}
