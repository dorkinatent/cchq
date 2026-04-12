/**
 * Typed events emitted during session message processing.
 * These flow from the session manager → SSE endpoint → client.
 */

export type StreamEvent =
  | { type: "thinking_start"; timestamp: number }
  | { type: "thinking_end"; timestamp: number }
  | { type: "tool_start"; toolUseId: string; toolName: string; input: Record<string, unknown>; timestamp: number }
  | { type: "tool_progress"; toolUseId: string; toolName: string; elapsedSeconds: number; timestamp: number }
  | { type: "tool_end"; toolUseId: string; toolName: string; output: unknown; timestamp: number }
  | { type: "text_delta"; text: string; timestamp: number }
  | { type: "message_complete"; messageId: string; content: string; toolUse: unknown[] | null; timestamp: number }
  | { type: "result"; success: boolean; totalCostUsd: number; totalTokens: number; numTurns: number; timestamp: number }
  | { type: "error"; error: string; timestamp: number }
  | { type: "ping"; timestamp: number }
  | { type: "auto_approval_log"; toolName: string; input: Record<string, unknown>; decision: string; reason?: string; timestamp: number }
  | { type: "permission_request"; requestId: string; toolName: string; input: Record<string, unknown>; title: string; timestamp: number }
  | { type: "permission_timeout"; requestId: string; timestamp: number };

export type StreamEventHandler = (event: StreamEvent) => void;

/**
 * In-memory event bus for delivering stream events from the session manager
 * to SSE route handlers. Keyed by session ID so each SSE connection only
 * receives events for its session.
 */
export class SessionEventBus {
  private subscribers = new Map<string, Set<StreamEventHandler>>();

  subscribe(sessionId: string, handler: StreamEventHandler): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    const handlers = this.subscribers.get(sessionId)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  emit(sessionId: string, event: StreamEvent): void {
    const handlers = this.subscribers.get(sessionId);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(event);
    }
  }
}

/** Singleton event bus — shared across all route handlers and the session manager. */
export const sessionEventBus = new SessionEventBus();
