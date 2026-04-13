import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);
const MAX_WORKSPACE_SESSIONS = 6;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: { name?: unknown; sessionIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { name?: string; sessionIds?: string[] } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name must be non-empty" }, { status: 400 });
    }
    if (trimmed.length > 120) {
      return NextResponse.json(
        { error: "name must be 120 characters or fewer" },
        { status: 400 }
      );
    }
    patch.name = trimmed;
  }

  if (body.sessionIds !== undefined) {
    if (!Array.isArray(body.sessionIds)) {
      return NextResponse.json(
        { error: "sessionIds must be an array" },
        { status: 400 }
      );
    }
    if (
      body.sessionIds.length < 1 ||
      body.sessionIds.length > MAX_WORKSPACE_SESSIONS
    ) {
      return NextResponse.json(
        { error: `sessionIds must contain between 1 and ${MAX_WORKSPACE_SESSIONS} ids` },
        { status: 400 }
      );
    }
    if (!body.sessionIds.every(isUuid)) {
      return NextResponse.json(
        { error: "sessionIds must be valid UUIDs" },
        { status: 400 }
      );
    }
    patch.sessionIds = body.sessionIds as string[];
  }

  if (patch.name === undefined && patch.sessionIds === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(schema.workspaces)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(schema.workspaces.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to update workspace" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const deleted = await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .returning();
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
