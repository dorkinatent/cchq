import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { startSession } from "@/lib/sessions/manager";
import { captureHeadSha } from "@/lib/git/sha";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  // Session rows + project info in one query
  const base = db
    .select({
      id: schema.sessions.id,
      projectId: schema.sessions.projectId,
      status: schema.sessions.status,
      model: schema.sessions.model,
      name: schema.sessions.name,
      sdkSessionId: schema.sessions.sdkSessionId,
      trustLevel: schema.sessions.trustLevel,
      effort: schema.sessions.effort,
      usage: schema.sessions.usage,
      createdAt: schema.sessions.createdAt,
      updatedAt: schema.sessions.updatedAt,
      projectName: schema.projects.name,
      projectPath: schema.projects.path,
    })
    .from(schema.sessions)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.sessions.projectId));

  const rows = projectId
    ? await base
        .where(eq(schema.sessions.projectId, projectId))
        .orderBy(desc(schema.sessions.updatedAt))
    : await base.orderBy(desc(schema.sessions.updatedAt));

  // Message counts in one query
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const countRows = await db
      .select({
        sessionId: schema.messages.sessionId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.messages)
      .where(inArray(schema.messages.sessionId, ids))
      .groupBy(schema.messages.sessionId);
    for (const r of countRows) counts.set(r.sessionId, Number(r.count));
  }

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      project_id: r.projectId,
      status: r.status,
      model: r.model,
      name: r.name,
      sdk_session_id: r.sdkSessionId,
      trust_level: r.trustLevel,
      effort: r.effort,
      usage: r.usage,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      project_name: r.projectName,
      project_path: r.projectPath,
      message_count: counts.get(r.id) ?? 0,
    }))
  );
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

  // Always capture the git HEAD at creation time so the diff viewer works
  // even for sessions started without an initial prompt (cold-start).
  const startSha = await captureHeadSha(project.path);

  const [session] = await db
    .insert(schema.sessions)
    .values({
      projectId,
      name,
      model: model || "claude-sonnet-4-6",
      trustLevel: trustLevel || "auto_log",
      effort: effort || "high",
      status: "active",
      startSha,
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
