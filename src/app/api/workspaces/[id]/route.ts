import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { apiError, isUuid, parseJson } from "@/lib/api";

const MAX_WORKSPACE_SESSIONS = 6;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "Invalid id");

  const body = await parseJson<{ name?: unknown; sessionIds?: unknown }>(req);
  if (!body) return apiError(400, "Invalid JSON");

  const patch: { name?: string; sessionIds?: string[] } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return apiError(400, "name must be a string");
    }
    const trimmed = body.name.trim();
    if (!trimmed) return apiError(400, "name must be non-empty");
    if (trimmed.length > 120) {
      return apiError(400, "name must be 120 characters or fewer");
    }
    patch.name = trimmed;
  }

  if (body.sessionIds !== undefined) {
    if (!Array.isArray(body.sessionIds)) {
      return apiError(400, "sessionIds must be an array");
    }
    if (
      body.sessionIds.length < 1 ||
      body.sessionIds.length > MAX_WORKSPACE_SESSIONS
    ) {
      return apiError(
        400,
        `sessionIds must contain between 1 and ${MAX_WORKSPACE_SESSIONS} ids`
      );
    }
    if (!body.sessionIds.every(isUuid)) {
      return apiError(400, "sessionIds must be valid UUIDs");
    }
    patch.sessionIds = body.sessionIds as string[];
  }

  if (patch.name === undefined && patch.sessionIds === undefined) {
    return apiError(400, "No fields to update");
  }

  try {
    const [updated] = await db
      .update(schema.workspaces)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(schema.workspaces.id, id))
      .returning();

    if (!updated) return apiError(404, "Workspace not found");
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(500, (e as Error).message || "Failed to update workspace");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "Invalid id");
  try {
    const deleted = await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .returning();
    if (deleted.length === 0) return apiError(404, "Workspace not found");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(500, (e as Error).message || "Failed to delete workspace");
  }
}
