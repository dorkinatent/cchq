import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const projects = await db.query.projects.findMany({
    orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { name, path } = await req.json();

  const existing = await db.query.projects.findFirst({
    where: eq(schema.projects.path, path),
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const [project] = await db
    .insert(schema.projects)
    .values({ name, path })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
