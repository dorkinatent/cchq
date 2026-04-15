import { describe, it, expect, afterEach } from "vitest";
import { writeFile, mkdir, appendFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createEventsTailer } from "../events";
import type { RigEvent } from "../types";

describe("createEventsTailer", () => {
  const tmp = join(tmpdir(), `cchq-events-test-${Date.now()}`);

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("emits events written to the file", async () => {
    await mkdir(tmp, { recursive: true });
    const filePath = join(tmp, "events.jsonl");
    await writeFile(filePath, "");

    const events: RigEvent[] = [];
    const tailer = createEventsTailer(filePath, (e) => events.push(e));
    await tailer.ready;

    await appendFile(
      filePath,
      JSON.stringify({ type: "sling", actor: "mayor", timestamp: "2026-01-01T00:00:00Z" }) + "\n"
    );

    await new Promise((r) => setTimeout(r, 200));

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("sling");

    tailer.stop();
  });

  it("waits for file to exist and then emits", async () => {
    await mkdir(tmp, { recursive: true });
    const filePath = join(tmp, "events.jsonl");

    const events: RigEvent[] = [];
    const tailer = createEventsTailer(filePath, (e) => events.push(e));

    await writeFile(filePath, JSON.stringify({ type: "handoff", timestamp: "2026-01-01T00:00:00Z" }) + "\n");

    await tailer.ready;
    await new Promise((r) => setTimeout(r, 300));

    tailer.stop();
  });
});
