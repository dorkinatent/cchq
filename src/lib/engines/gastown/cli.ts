import { spawn } from "child_process";

export type GtCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type GtCommandOptions = {
  townPath: string;
  args: string[];
  timeoutMs?: number;
};

export async function runGt(opts: GtCommandOptions): Promise<GtCommandResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    const proc = spawn("gt", opts.args, {
      cwd: opts.townPath,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ stdout, stderr: stderr + "\n[timed out]", exitCode: 124 });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + "\n[spawn error] " + err.message,
        exitCode: 127,
      });
    });
  });
}
