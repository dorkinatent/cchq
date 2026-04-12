"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";
import type { StreamEvent } from "@/lib/sessions/stream-events";

export type StreamPhase = "idle" | "thinking" | "tool_use" | "streaming" | "error";

export type ActiveTool = {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  startedAt: number;
  elapsedSeconds: number;
  output?: unknown;
  done: boolean;
};

export type StreamState = {
  phase: StreamPhase;
  activeTools: ActiveTool[];
  streamingText: string;
  thinkingStartedAt: number | null;
  error: string | null;
  completedMessage: { messageId: string; content: string; toolUse: unknown[] | null } | null;
};

const initialState: StreamState = {
  phase: "idle",
  activeTools: [],
  streamingText: "",
  thinkingStartedAt: null,
  error: null,
  completedMessage: null,
};

type Action = { type: "EVENT"; event: StreamEvent } | { type: "RESET" };

export function streamReducer(state: StreamState, action: Action): StreamState {
  if (action.type === "RESET") return initialState;

  const event = action.event;

  switch (event.type) {
    case "thinking_start":
      return { ...state, phase: "thinking", thinkingStartedAt: event.timestamp, completedMessage: null, error: null };
    case "thinking_end":
      return { ...state, phase: "idle", thinkingStartedAt: null };
    case "tool_start":
      return {
        ...state,
        phase: "tool_use",
        activeTools: [
          ...state.activeTools,
          {
            toolUseId: event.toolUseId,
            toolName: event.toolName,
            input: event.input,
            startedAt: event.timestamp,
            elapsedSeconds: 0,
            done: false,
          },
        ],
      };
    case "tool_progress":
      return {
        ...state,
        activeTools: state.activeTools.map((t) =>
          t.toolUseId === event.toolUseId ? { ...t, elapsedSeconds: event.elapsedSeconds } : t
        ),
      };
    case "tool_end":
      return {
        ...state,
        activeTools: state.activeTools.map((t) =>
          t.toolUseId === event.toolUseId ? { ...t, done: true, output: event.output } : t
        ),
        // If all tools done, go back to idle (or streaming if text follows)
        phase: state.activeTools.every((t) => t.toolUseId === event.toolUseId || t.done)
          ? "idle"
          : "tool_use",
      };
    case "text_delta":
      return { ...state, phase: "streaming", streamingText: state.streamingText + event.text };
    case "message_complete":
      return {
        ...initialState,
        completedMessage: { messageId: event.messageId, content: event.content, toolUse: event.toolUse },
      };
    case "result":
      return { ...initialState };
    case "error":
      return { ...state, phase: "error", error: event.error };
    case "ping":
      return state;
    default:
      return state;
  }
}

export function useSessionStream(sessionId: string, isActive: boolean) {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!isActive) return;

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        dispatch({ type: "EVENT", event });
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      // Reconnect after 3s
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [sessionId, isActive]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      dispatch({ type: "RESET" });
    };
  }, [connect]);

  return state;
}
