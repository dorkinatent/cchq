import { describe, it, expect, vi } from "vitest";
import { SessionEventBus, type StreamEvent } from "../stream-events";

describe("SessionEventBus", () => {
  it("delivers events to subscribers for a specific session", () => {
    const bus = new SessionEventBus();
    const handler = vi.fn();
    const sessionId = "sess-1";

    bus.subscribe(sessionId, handler);
    const event: StreamEvent = { type: "thinking_start", timestamp: Date.now() };
    bus.emit(sessionId, event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not deliver events to subscribers of other sessions", () => {
    const bus = new SessionEventBus();
    const handler = vi.fn();

    bus.subscribe("sess-1", handler);
    bus.emit("sess-2", { type: "thinking_start", timestamp: Date.now() });

    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", () => {
    const bus = new SessionEventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe("sess-1", handler);
    unsub();
    bus.emit("sess-1", { type: "thinking_start", timestamp: Date.now() });

    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers per session", () => {
    const bus = new SessionEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.subscribe("sess-1", h1);
    bus.subscribe("sess-1", h2);
    bus.emit("sess-1", { type: "thinking_start", timestamp: Date.now() });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("cleans up session when last subscriber leaves", () => {
    const bus = new SessionEventBus();
    const unsub1 = bus.subscribe("sess-1", vi.fn());
    const unsub2 = bus.subscribe("sess-1", vi.fn());

    unsub1();
    unsub2();

    // Emitting to a session with no subscribers should not throw
    bus.emit("sess-1", { type: "thinking_start", timestamp: Date.now() });
  });
});
