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
  const { projectId, name, model, effort, prompt } = await req.json();

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [session] = await db
    .insert(schema.sessions)
    .values({
      projectId,
      name,
      model: model || "claude-sonnet-4-6",
      status: "active",
    })
    .returning();

  await startSession(session.id, project.path, session.model, prompt, effort);

  await db.insert(schema.messages).values({
    sessionId: session.id,
    role: "user",
    content: prompt,
  });

  return NextResponse.json(session, { status: 201 });
}
