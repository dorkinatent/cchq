import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveDocPath } from "@/lib/docs/scanner";

export const dynamic = "force-dynamic";

/**
 * Reveals a doc file in the OS file manager. Uses `open -R` on macOS
 * (highlights the file in Finder), `xdg-open` on Linux (opens the parent
 * dir), `explorer /select,` on Windows.
 *
 * We resolve the absolute path server-side via the project's stored path
 * to prevent the client from requesting arbitrary paths.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { relativePath } = await req.json().catch(() => ({}));
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    return NextResponse.json({ error: "relativePath required" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let absPath: string;
  try {
    absPath = resolveDocPath(project.path, relativePath);
  } catch (err: any) {
    if (err.message?.includes("escapes project")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === "darwin") {
    cmd = "open";
    args = ["-R", absPath];
  } else if (platform === "win32") {
    cmd = "explorer";
    args = [`/select,${absPath}`];
  } else {
    // Linux fallback — opens the parent directory (xdg-open can't "reveal")
    const parent = absPath.replace(/\/[^/]+$/, "");
    cmd = "xdg-open";
    args = [parent || "/"];
  }

  try {
    // Detach so the session reveal doesn't block; we don't care about stdout.
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to reveal: ${err?.message ?? "unknown"}` },
      { status: 500 }
    );
  }
}
