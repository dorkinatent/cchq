import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { pauseSession } from "@/lib/sessions/manager";

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

  const [updated] = await db
    .update(schema.sessions)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, id))
    .returning();

  return NextResponse.json(updated);
}
