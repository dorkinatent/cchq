import { describe, it, expect } from "vitest";
import {
  parseDaemonStatus,
  parseAgents,
  parseReadyBeads,
  parseEventLine,
} from "../parsers";

describe("parseDaemonStatus", () => {
  it("returns running when stdout mentions running", () => {
    expect(parseDaemonStatus("Daemon is running (pid 12345)")).toBe("running");
  });

  it("returns stopped when stdout mentions stopped", () => {
    expect(parseDaemonStatus("Daemon is stopped")).toBe("stopped");
  });

  it("returns unknown on empty input", () => {
    expect(parseDaemonStatus("")).toBe("unknown");
  });
});

describe("parseAgents", () => {
  it("parses a simple agents listing", () => {
    const out = `mayor  Mayor   working    Reviewing PR #42  gt-abc12
scout  polecat idle       -                -`;
    const agents = parseAgents(out);
    expect(agents).toHaveLength(2);
    expect(agents[0]).toMatchObject({
      name: "mayor",
      role: "Mayor",
      state: "working",
      lastActivity: "Reviewing PR #42",
      currentBead: "gt-abc12",
    });
    expect(agents[1]).toMatchObject({
      name: "scout",
      role: "polecat",
      state: "idle",
    });
  });

  it("returns empty array for empty output", () => {
    expect(parseAgents("")).toEqual([]);
  });
});

describe("parseReadyBeads", () => {
  it("parses ready beads output", () => {
    const out = `gt-abc12  P1  Fix the auth middleware      auth,security
gt-def34  P2  Add streaming to chat view    frontend`;
    const beads = parseReadyBeads(out);
    expect(beads).toHaveLength(2);
    expect(beads[0]).toMatchObject({
      id: "gt-abc12",
      priority: "P1",
      title: "Fix the auth middleware",
      tags: ["auth", "security"],
    });
  });
});

describe("parseEventLine", () => {
  it("parses a JSON event line", () => {
    const line = JSON.stringify({
      type: "sling",
      actor: "mayor",
      timestamp: "2026-04-12T01:00:00Z",
      data: { bead: "gt-abc12" },
    });
    const event = parseEventLine(line);
    expect(event).toMatchObject({
      eventType: "sling",
      actor: "mayor",
      timestamp: "2026-04-12T01:00:00Z",
    });
    expect(event?.payload).toMatchObject({ data: { bead: "gt-abc12" } });
  });

  it("returns null on malformed input", () => {
    expect(parseEventLine("not json")).toBeNull();
  });
});
