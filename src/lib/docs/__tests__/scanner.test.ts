import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { scanDocs, resolveDocPath } from "../scanner";

describe("scanDocs", () => {
  const tmp = join(tmpdir(), `ccui-scanner-test-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(tmp, { recursive: true });
    await writeFile(join(tmp, "README.md"), "# readme");
    await writeFile(join(tmp, "CHANGELOG.md"), "# changelog");
    await writeFile(join(tmp, "random.txt"), "not markdown");
    await mkdir(join(tmp, "docs"), { recursive: true });
    await writeFile(join(tmp, "docs", "guide.md"), "# guide");
    await mkdir(join(tmp, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(tmp, "node_modules", "pkg", "README.md"), "# excluded");
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("matches top-level markdown by pattern", async () => {
    const result = await scanDocs(tmp, ["README.md", "CHANGELOG.md"]);
    const names = result.map((r) => r.relativePath).sort();
    expect(names).toEqual(["CHANGELOG.md", "README.md"]);
  });

  it("supports nested glob patterns", async () => {
    const result = await scanDocs(tmp, ["docs/**/*.md"]);
    expect(result.map((r) => r.relativePath)).toEqual(["docs/guide.md"]);
  });

  it("excludes node_modules by default", async () => {
    const result = await scanDocs(tmp, ["**/*.md"]);
    const paths = result.map((r) => r.relativePath);
    expect(paths).not.toContain("node_modules/pkg/README.md");
  });

  it("returns file metadata", async () => {
    const result = await scanDocs(tmp, ["README.md"]);
    expect(result[0]).toMatchObject({
      relativePath: "README.md",
      name: "README.md",
    });
    expect(typeof result[0].size).toBe("number");
    expect(typeof result[0].mtime).toBe("string");
  });
});

describe("resolveDocPath", () => {
  const tmp = join(tmpdir(), `ccui-resolve-test-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(tmp, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns absolute path for valid relative paths", () => {
    const result = resolveDocPath(tmp, "README.md");
    expect(result).toBe(join(tmp, "README.md"));
  });

  it("rejects path traversal attempts", () => {
    expect(() => resolveDocPath(tmp, "../etc/passwd")).toThrow();
    expect(() => resolveDocPath(tmp, "../../secrets")).toThrow();
    expect(() => resolveDocPath(tmp, "/etc/passwd")).toThrow();
  });

  it("rejects paths escaping via symlinks or complex traversal", () => {
    expect(() => resolveDocPath(tmp, "foo/../../escape")).toThrow();
  });
});
