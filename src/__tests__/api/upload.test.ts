import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { POST } from "@/app/api/upload/route";
import { NextRequest } from "next/server";

function makeUploadRequest(name: string, type: string, sizeBytes: number): NextRequest {
  const content = new Uint8Array(sizeBytes);
  const file = new File([content], name, { type });
  const formData = new FormData();
  formData.append("file", file);

  return new NextRequest("http://localhost:3000/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid PNG upload", async () => {
    const res = await POST(makeUploadRequest("photo.png", "image/png", 1024));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toContain(".png");
    expect(body.name).toBe("photo.png");
  });

  it("accepts JPEG uploads", async () => {
    const res = await POST(makeUploadRequest("photo.jpg", "image/jpeg", 1024));
    expect(res.status).toBe(200);
  });

  it("accepts WebP uploads", async () => {
    const res = await POST(makeUploadRequest("photo.webp", "image/webp", 1024));
    expect(res.status).toBe(200);
  });

  it("accepts GIF uploads", async () => {
    const res = await POST(makeUploadRequest("anim.gif", "image/gif", 1024));
    expect(res.status).toBe(200);
  });

  it("rejects disallowed MIME types", async () => {
    const res = await POST(makeUploadRequest("script.sh", "application/x-sh", 100));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file type/i);
  });

  it("rejects disallowed extensions", async () => {
    const res = await POST(makeUploadRequest("malware.exe", "image/png", 100));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file extension/i);
  });

  it("rejects files over 50MB", async () => {
    const res = await POST(
      makeUploadRequest("huge.png", "image/png", 51 * 1024 * 1024)
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
