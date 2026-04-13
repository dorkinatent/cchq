import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGitDiff, isGitRepo } from "@/lib/git/diff-parser";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mode = req.nextUrl.searchParams.get("mode");
  const file = req.nextUrl.searchParams.get("file");

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, session.projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const gitRepo = await isGitRepo(project.path);
  if (!gitRepo) {
    return NextResponse.json({
      error: "not-git",
      message: "This project is not a git repository",
    });
  }

  try {
    const useSaved = mode === "saved" && session.startSha && session.endSha;

    const result = await getGitDiff(
      project.path,
      useSaved ? session.startSha : null,
      useSaved ? session.endSha : null,
      file || null
    );

    return NextResponse.json({
      mode: useSaved ? "saved" : "live",
      startSha: session.startSha ?? null,
      endSha: session.endSha ?? null,
      summary: result.summary,
      files: result.files,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Git diff failed";
    return NextResponse.json(
      { error: "git-error", message },
      { status: 500 }
    );
  }
}
