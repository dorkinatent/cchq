import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { pauseSession, completeSession, resumeSession } from "@/lib/sessions/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.status === "paused") {
    await pauseSession(id);
  }

  if (body.status === "active") {
    // Resuming a paused session
    const { resumeNote, ...rest } = body;
    const [updated] = await db
      .update(schema.sessions)
      .set({ ...rest, updatedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, id))
      .returning();

    // Fire off the resume in the background
    resumeSession(id, resumeNote).catch((err) =>
      console.error(`Failed to resume session ${id}:`, err)
    );

    return NextResponse.json(updated);
  }

  const { resumeNote: _rn, ...setFields } = body;
  const [updated] = await db
    .update(schema.sessions)
    .set({ ...setFields, updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Stop the SDK session if active
  await completeSession(id);

  // Delete messages then session
  await db.delete(schema.messages).where(eq(schema.messages.sessionId, id));
  await db.delete(schema.knowledge).where(eq(schema.knowledge.sessionId, id));
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));

  return NextResponse.json({ ok: true });
}
