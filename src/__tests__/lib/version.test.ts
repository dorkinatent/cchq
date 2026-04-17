import { describe, it, expect } from "vitest";
import { isNewerVersion, APP_VERSION } from "@/lib/version";

describe("isNewerVersion", () => {
  it("returns true when remote is newer (patch)", () => {
    expect(isNewerVersion("0.1.0", "0.1.1")).toBe(true);
  });

  it("returns true when remote is newer (minor)", () => {
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(true);
  });

  it("returns true when remote is newer (major)", () => {
    expect(isNewerVersion("0.1.0", "1.0.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
  });

  it("returns false when remote is older", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(false);
  });

  it("handles v prefix in remote version", () => {
    expect(isNewerVersion("0.1.0", "v0.2.0")).toBe(true);
  });

  it("APP_VERSION is a valid semver string", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
