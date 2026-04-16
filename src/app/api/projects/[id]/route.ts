import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const patch: {
    name?: string;
    path?: string;
    docGlobs?: string[];
    autoInjectDocs?: boolean;
    hasBeenIngestionPrompted?: boolean;
    additionalDirectories?: string[];
  } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.path === "string") {
    const { validateProjectPath } = await import("@/lib/validate-path");
    const pathError = await validateProjectPath(body.path);
    if (pathError) {
      return NextResponse.json({ error: pathError }, { status: 400 });
    }
    patch.path = body.path;
  }
  if (Array.isArray(body.docGlobs)) {
    patch.docGlobs = body.docGlobs.filter((g: unknown) => typeof g === "string");
  }
  if (typeof body.autoInjectDocs === "boolean") patch.autoInjectDocs = body.autoInjectDocs;
  if (typeof body.hasBeenIngestionPrompted === "boolean") {
    patch.hasBeenIngestionPrompted = body.hasBeenIngestionPrompted;
  }
  if (Array.isArray(body.additionalDirectories)) {
    patch.additionalDirectories = body.additionalDirectories
      .filter((d: unknown): d is string => typeof d === "string")
      .map((d: string) => d.trim())
      .filter((d: string) => d.length > 0);
  }

  const [updated] = await db
    .update(schema.projects)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Delete knowledge, messages (via sessions), sessions, then project
  const sessions = await db.query.sessions.findMany({
    where: eq(schema.sessions.projectId, id),
  });

  for (const session of sessions) {
    await db.delete(schema.messages).where(eq(schema.messages.sessionId, session.id));
  }
  await db.delete(schema.knowledge).where(eq(schema.knowledge.projectId, id));
  await db.delete(schema.sessions).where(eq(schema.sessions.projectId, id));
  await db.delete(schema.projects).where(eq(schema.projects.id, id));

  return NextResponse.json({ ok: true });
}
