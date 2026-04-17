import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";

/**
 * Root directory for browsing. In Docker, PROJECTS_DIR is set to /projects
 * (the mount point for the host's code directory). In dev, falls back to $HOME.
 */
function browseRoot(): string {
  return resolve(process.env.PROJECTS_DIR || homedir());
}

export async function GET(req: NextRequest) {
  const root = browseRoot();
  const path = req.nextUrl.searchParams.get("path") || root;
  const realPath = resolve(path);
  const rootWithSep = root.endsWith("/") ? root : root + "/";

  if (realPath !== root && !realPath.startsWith(rootWithSep)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const entries = await readdir(realPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: join(realPath, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = resolve(realPath, "..");
    return NextResponse.json({
      current: realPath,
      parent:
        parentPath === root || parentPath.startsWith(rootWithSep)
          ? parentPath
          : root,
      directories: dirs,
      isGitRepo: entries.some((e) => e.name === ".git" && e.isDirectory()),
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot read directory" },
      { status: 400 }
    );
  }
}
