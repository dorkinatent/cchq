import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const [updated] = await db
    .update(schema.projects)
    .set({ ...body, updatedAt: new Date().toISOString() })
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
