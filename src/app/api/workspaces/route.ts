import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { apiError, isUuid, parseJson } from "@/lib/api";

const MAX_WORKSPACE_SESSIONS = 6;

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(schema.workspaces)
      .orderBy(desc(schema.workspaces.updatedAt));
    return NextResponse.json(rows);
  } catch (e) {
    return apiError(500, (e as Error).message || "Failed to load workspaces");
  }
}

export async function POST(req: NextRequest) {
  const body = await parseJson<{ name?: unknown; sessionIds?: unknown }>(req);
  if (!body) return apiError(400, "Invalid JSON");

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return apiError(400, "name is required");
  if (name.length > 120) {
    return apiError(400, "name must be 120 characters or fewer");
  }
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
  try {
    const [row] = await db
      .insert(schema.workspaces)
      .values({ name, sessionIds: body.sessionIds as string[] })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return apiError(500, (e as Error).message || "Failed to create workspace");
  }
}
