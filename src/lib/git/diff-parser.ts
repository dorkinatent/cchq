import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type DiffLine = {
  type: "context" | "add" | "delete";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type DiffFile = {
  path: string;
  status: "M" | "A" | "D" | "R";
  insertions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
};

export type DiffResult = {
  files: DiffFile[];
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
};

/**
 * Run git diff and return structured output.
 */
export async function getGitDiff(
  cwd: string,
  startSha?: string | null,
  endSha?: string | null,
  filePath?: string | null
): Promise<DiffResult> {
  const args = ["diff", "--unified=3", "--no-color"];

  if (startSha && endSha) {
    // Historical: diff between two saved commits.
    args.push(`${startSha}...${endSha}`);
  } else if (startSha) {
    // Live: diff from session-start commit to current working tree.
    // This captures BOTH committed changes (by Claude) and any
    // uncommitted edits — not just unstaged changes like bare `git diff`.
    args.push(startSha);
  }

  if (filePath) {
    args.push("--", filePath);
  }

  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return parseDiff(stdout);
}

/**
 * Check whether a directory is a git repository.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse unified diff output into structured data.
 */
function parseDiff(raw: string): DiffResult {
  const files: DiffFile[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  if (!raw.trim()) {
    return { files, summary: { filesChanged: 0, insertions: 0, deletions: 0 } };
  }

  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");

    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    const path = headerMatch?.[2] ?? headerMatch?.[1] ?? "unknown";

    let status: DiffFile["status"] = "M";
    let binary = false;
    for (const line of lines.slice(0, 6)) {
      if (line.startsWith("new file")) status = "A";
      else if (line.startsWith("deleted file")) status = "D";
      else if (line.startsWith("rename from")) status = "R";
      else if (line.startsWith("Binary files")) binary = true;
    }

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;
    let fileInsertions = 0;
    let fileDeletions = 0;

    for (const line of lines) {
      const hunkHeaderMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
      if (hunkHeaderMatch) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        oldLine = parseInt(hunkHeaderMatch[1], 10);
        newLine = parseInt(hunkHeaderMatch[2], 10);
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "add", content: line.slice(1), newLineNo: newLine });
        newLine++;
        fileInsertions++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "delete", content: line.slice(1), oldLineNo: oldLine });
        oldLine++;
        fileDeletions++;
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({ type: "context", content: line.slice(1), oldLineNo: oldLine, newLineNo: newLine });
        oldLine++;
        newLine++;
      }
    }

    totalInsertions += fileInsertions;
    totalDeletions += fileDeletions;

    files.push({ path, status, insertions: fileInsertions, deletions: fileDeletions, binary, hunks });
  }

  return { files, summary: { filesChanged: files.length, insertions: totalInsertions, deletions: totalDeletions } };
}
