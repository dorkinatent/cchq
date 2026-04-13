import { v4 as uuidv4 } from "uuid";

export type QueuedMessage = {
  id: string;
  sessionId: string;
  content: string;
  attachments?: { path: string; name: string }[];
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  maxAttempts: number;
  error?: string;
  retryAfter?: number; // timestamp when retry is allowed
  createdAt: number;
};

export class MessageQueue {
  private key = "ccui-message-queue";
  private listeners = new Set<() => void>();

  private readAll(): QueuedMessage[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private writeAll(messages: QueuedMessage[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.key, JSON.stringify(messages));
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private update(id: string, patch: Partial<QueuedMessage>): void {
    const all = this.readAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...patch };
    this.writeAll(all);
  }

  getMessages(sessionId: string): QueuedMessage[] {
    return this.readAll().filter((m) => m.sessionId === sessionId);
  }

  enqueue(
    sessionId: string,
    content: string,
    attachments?: { path: string; name: string }[]
  ): QueuedMessage {
    const msg: QueuedMessage = {
      id: uuidv4(),
      sessionId,
      content,
      attachments,
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
    };
    const all = this.readAll();
    all.push(msg);
    this.writeAll(all);
    return msg;
  }

  markSending(id: string): void {
    this.update(id, { status: "sending" });
  }

  markSent(id: string): void {
    this.update(id, { status: "sent" });
  }

  markFailed(id: string, error: string, retryAfter?: number): void {
    const all = this.readAll();
    const msg = all.find((m) => m.id === id);
    if (!msg) return;
    msg.status = "failed";
    msg.error = error;
    msg.attempts += 1;
    if (retryAfter !== undefined) {
      msg.retryAfter = retryAfter;
    }
    this.writeAll(all);
  }

  retry(id: string): void {
    this.update(id, { status: "queued", error: undefined, retryAfter: undefined });
  }

  remove(id: string): void {
    const all = this.readAll().filter((m) => m.id !== id);
    this.writeAll(all);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** On init, reset any "sending" messages to "queued" (page refresh recovery) */
  recover(): void {
    const all = this.readAll();
    let changed = false;
    for (const msg of all) {
      if (msg.status === "sending") {
        msg.status = "queued";
        changed = true;
      }
    }
    if (changed) {
      this.writeAll(all);
    }
  }
}

export const messageQueue = new MessageQueue();
