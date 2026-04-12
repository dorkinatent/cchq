export type SessionListEvent =
  | { type: "session_created"; sessionId: string; timestamp: number }
  | { type: "session_updated"; sessionId: string; timestamp: number }
  | { type: "session_deleted"; sessionId: string; timestamp: number }
  | { type: "message_added"; sessionId: string; messageId: string; timestamp: number };

export type SessionListHandler = (event: SessionListEvent) => void;

export class SessionListBus {
  private handlers = new Set<SessionListHandler>();

  subscribe(handler: SessionListHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  emit(event: SessionListEvent): void {
    for (const h of this.handlers) {
      try { h(event); } catch (err) {
        console.error("[session-list-bus] handler threw", err);
      }
    }
  }
}

export const sessionListBus = new SessionListBus();
