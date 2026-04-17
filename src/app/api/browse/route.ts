import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || homedir();
  const realPath = resolve(path);
  const realHome = resolve(homedir());
  const homeWithSep = realHome.endsWith("/") ? realHome : realHome + "/";

  if (realPath !== realHome && !realPath.startsWith(homeWithSep)) {
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
        parentPath === realHome || parentPath.startsWith(homeWithSep)
          ? parentPath
          : realHome,
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
