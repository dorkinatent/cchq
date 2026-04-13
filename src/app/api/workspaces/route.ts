import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);
const MAX_WORKSPACE_SESSIONS = 6;

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(schema.workspaces)
      .orderBy(desc(schema.workspaces.updatedAt));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to load workspaces" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: unknown; sessionIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json(
      { error: "name must be 120 characters or fewer" },
      { status: 400 }
    );
  }
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
  try {
    const [row] = await db
      .insert(schema.workspaces)
      .values({ name, sessionIds: body.sessionIds as string[] })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to create workspace" },
      { status: 500 }
    );
  }
}
