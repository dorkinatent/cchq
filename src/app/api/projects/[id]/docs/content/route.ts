import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveDocPath } from "@/lib/docs/scanner";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) {
    return NextResponse.json({ error: "path query param required" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const absPath = resolveDocPath(project.path, relPath);
    const content = await readFile(absPath, "utf8");
    return NextResponse.json({ path: relPath, content });
  } catch (err: any) {
    if (err.message?.includes("escapes project")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (err.code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
