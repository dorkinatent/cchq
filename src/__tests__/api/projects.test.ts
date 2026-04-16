import { describe, it, expect, vi } from "vitest";
import { validateProjectPath } from "@/lib/validate-path";

vi.mock("fs/promises", () => ({
  access: vi.fn(),
  stat: vi.fn(),
}));

import { access, stat } from "fs/promises";

describe("validateProjectPath", () => {
  it("accepts a valid directory path", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);
    const result = await validateProjectPath("/Users/test/Code/myproject");
    expect(result).toBeNull();
  });

  it("rejects non-string input", async () => {
    const result = await validateProjectPath(123 as any);
    expect(result).toBe("Path must be a string");
  });

  it("rejects empty string", async () => {
    const result = await validateProjectPath("");
    expect(result).toBe("Path must be a string");
  });

  it("rejects non-existent paths", async () => {
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
    const result = await validateProjectPath("/nonexistent/path");
    expect(result).toMatch(/does not exist or is not readable/i);
  });

  it("rejects files (not directories)", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);
    const result = await validateProjectPath("/Users/test/file.txt");
    expect(result).toMatch(/not a directory/i);
  });
});
