import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, and, ilike } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const type = req.nextUrl.searchParams.get("type");
  const search = req.nextUrl.searchParams.get("search");

  const conditions = [];
  if (projectId) conditions.push(eq(schema.knowledge.projectId, projectId));
  if (type)
    conditions.push(
      eq(schema.knowledge.type, type as "decision" | "fact" | "context" | "summary")
    );
  if (search) conditions.push(ilike(schema.knowledge.content, `%${search}%`));

  const entries = await db.query.knowledge.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(schema.knowledge.createdAt)],
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const { projectId, type, content, tags } = await req.json();

  const [entry] = await db
    .insert(schema.knowledge)
    .values({ projectId, type, content, tags: tags || [] })
    .returning();

  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.delete(schema.knowledge).where(eq(schema.knowledge.id, id));
  return NextResponse.json({ ok: true });
}
