import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { doctor } from "@/lib/engines/gastown";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const rig = await db.query.rigs.findFirst({
    where: eq(schema.rigs.projectId, projectId),
  });
  if (!rig) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rig);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { townPath, rigName } = await req.json();

  if (!townPath || !rigName) {
    return NextResponse.json({ error: "townPath and rigName are required" }, { status: 400 });
  }

  const existing = await db.query.rigs.findFirst({
    where: eq(schema.rigs.projectId, projectId),
  });

  let rig;
  if (existing) {
    [rig] = await db
      .update(schema.rigs)
      .set({ townPath, rigName, updatedAt: new Date().toISOString() })
      .where(eq(schema.rigs.projectId, projectId))
      .returning();
  } else {
    [rig] = await db
      .insert(schema.rigs)
      .values({ projectId, townPath, rigName })
      .returning();
  }

  await db
    .update(schema.projects)
    .set({ engine: "gastown", updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, projectId));

  const health = await doctor({
    id: rig.id,
    projectId,
    townPath,
    rigName,
  });

  return NextResponse.json({ rig, health });
}
