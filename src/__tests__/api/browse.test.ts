import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("os", () => ({
  homedir: () => "/Users/testuser",
}));

import { GET } from "@/app/api/browse/route";
import { NextRequest } from "next/server";
import { readdir, stat } from "fs/promises";

function makeRequest(path?: string): NextRequest {
  const url = path
    ? `http://localhost:3000/api/browse?path=${encodeURIComponent(path)}`
    : "http://localhost:3000/api/browse";
  return new NextRequest(url);
}

describe("GET /api/browse", () => {
  beforeEach(() => {
    vi.mocked(readdir).mockResolvedValue([]);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);
  });

  it("allows paths under home directory", async () => {
    const res = await GET(makeRequest("/Users/testuser/Code"));
    expect(res.status).toBe(200);
  });

  it("allows home directory itself", async () => {
    const res = await GET(makeRequest("/Users/testuser"));
    expect(res.status).toBe(200);
  });

  it("rejects paths outside home directory", async () => {
    const res = await GET(makeRequest("/etc"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Access denied");
  });

  it("rejects root path", async () => {
    const res = await GET(makeRequest("/"));
    expect(res.status).toBe(403);
  });

  it("rejects path traversal via ../", async () => {
    const res = await GET(makeRequest("/Users/testuser/Code/../../etc"));
    expect(res.status).toBe(403);
  });

  it("defaults to home directory when no path given", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});
