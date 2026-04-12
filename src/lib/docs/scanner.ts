import fg from "fast-glob";
import { stat } from "fs/promises";
import { join, resolve, relative } from "path";

export type DocFile = {
  relativePath: string;
  name: string;
  size: number;
  mtime: string;
};

const ALWAYS_EXCLUDE = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.turbo/**",
  "**/coverage/**",
];

export async function scanDocs(
  projectPath: string,
  patterns: string[]
): Promise<DocFile[]> {
  const matches = await fg(patterns, {
    cwd: projectPath,
    ignore: ALWAYS_EXCLUDE,
    dot: false,
    onlyFiles: true,
    absolute: false,
    unique: true,
  });

  const results: DocFile[] = [];
  for (const rel of matches) {
    try {
      const abs = join(projectPath, rel);
      const st = await stat(abs);
      const segments = rel.split("/");
      results.push({
        relativePath: rel,
        name: segments[segments.length - 1],
        size: st.size,
        mtime: st.mtime.toISOString(),
      });
    } catch {
      // File may have been deleted between glob and stat — skip
    }
  }

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

/**
 * Resolve a relative doc path to an absolute path, guarding against
 * path traversal attacks. Throws if the resolved path escapes projectPath.
 */
export function resolveDocPath(projectPath: string, relativePath: string): string {
  const absProject = resolve(projectPath);
  const absCandidate = resolve(absProject, relativePath);
  const rel = relative(absProject, absCandidate);

  // If `rel` starts with ".." or is absolute, the path escapes the project
  if (rel.startsWith("..") || rel.startsWith("/") || rel === "") {
    throw new Error(`Path '${relativePath}' escapes project directory`);
  }

  return absCandidate;
}
