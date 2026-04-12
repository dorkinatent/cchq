import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveDocPath } from "@/lib/docs/scanner";
import { extractFromDoc } from "@/lib/sessions/knowledge-extractor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "paths array required" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const byFile: Record<string, number> = {};
  let total = 0;
  for (const rel of paths) {
    try {
      const abs = resolveDocPath(project.path, rel);
      const content = await readFile(abs, "utf8");
      const n = await extractFromDoc(project.id, rel, content);
      byFile[rel] = n;
      total += n;
    } catch (err: any) {
      byFile[rel] = -1;
      console.error(`Ingest failed for ${rel}:`, err);
    }
  }

  return NextResponse.json({ entriesCreated: total, byFile });
}
