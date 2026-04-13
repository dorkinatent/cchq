import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Capture the current HEAD commit SHA for a git repo.
 * Returns null if the path is not a git repo, has no commits,
 * or git is not installed.
 */
export async function captureHeadSha(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: projectPath,
      timeout: 5000,
    });
    const sha = stdout.trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    return null;
  } catch {
    return null;
  }
}
