import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGt } from "../cli";
import * as child_process from "child_process";

vi.mock("child_process");

describe("runGt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("runs gt with the given args in the town path", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const mockProc: any = {
      stdout: { on: vi.fn((ev, cb) => ev === "data" && cb("stdout-data")) },
      stderr: { on: vi.fn() },
      on: vi.fn((ev, cb) => {
        if (ev === "close") cb(0);
      }),
      kill: vi.fn(),
    };
    mockSpawn.mockReturnValue(mockProc);

    const result = await runGt({
      townPath: "/Users/test/gt",
      args: ["status"],
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "gt",
      ["status"],
      expect.objectContaining({ cwd: "/Users/test/gt" })
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("stdout-data");
  });

  it("captures stderr", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const mockProc: any = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn((ev, cb) => ev === "data" && cb("err-data")) },
      on: vi.fn((ev, cb) => {
        if (ev === "close") cb(1);
      }),
      kill: vi.fn(),
    };
    mockSpawn.mockReturnValue(mockProc);

    const result = await runGt({
      townPath: "/Users/test/gt",
      args: ["doctor"],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("err-data");
  });
});
