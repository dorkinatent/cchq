import { describe, it, expect, vi } from "vitest";
import { SessionListBus } from "../session-list-bus";

describe("SessionListBus", () => {
  it("delivers events to all subscribers", () => {
    const bus = new SessionListBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.emit({ type: "session_updated", sessionId: "s1", timestamp: 1 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("unsubscribe stops delivery", () => {
    const bus = new SessionListBus();
    const h = vi.fn();
    const off = bus.subscribe(h);
    off();
    bus.emit({ type: "session_updated", sessionId: "s1", timestamp: 1 });
    expect(h).not.toHaveBeenCalled();
  });

  it("isolates handler exceptions", () => {
    const bus = new SessionListBus();
    bus.subscribe(() => { throw new Error("boom"); });
    const ok = vi.fn();
    bus.subscribe(ok);
    expect(() => bus.emit({ type: "session_updated", sessionId: "s1", timestamp: 1 })).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });
});
