"use client";

import { useEffect, useReducer, useRef, useCallback, useState } from "react";
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
  resultReceived: boolean;
};

const initialState: StreamState = {
  phase: "idle",
  activeTools: [],
  streamingText: "",
  thinkingStartedAt: null,
  error: null,
  completedMessage: null,
  resultReceived: false,
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
      return { ...initialState, resultReceived: true };
    case "error":
      return { ...state, phase: "error", error: event.error };
    case "ping":
      return state;
    default:
      return state;
  }
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

const HEARTBEAT_TIMEOUT = 30_000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

export function useSessionStream(sessionId: string, isActive: boolean) {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeartbeatRef = useRef<number>(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!isActive) return;

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus("disconnected");
      return;
    }

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      lastHeartbeatRef.current = Date.now();
      reconnectAttemptsRef.current = 0;
      setConnectionStatus("connected");
    };

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        if (event.type === "ping") {
          lastHeartbeatRef.current = Date.now();
          setConnectionStatus("connected");
        }
        dispatch({ type: "EVENT", event });
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      reconnectAttemptsRef.current += 1;

      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus("disconnected");
      } else {
        setConnectionStatus("reconnecting");
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };
  }, [sessionId, isActive]);

  // Heartbeat check interval
  useEffect(() => {
    if (!isActive) return;

    heartbeatIntervalRef.current = setInterval(() => {
      if (lastHeartbeatRef.current === 0) return;
      const elapsed = Date.now() - lastHeartbeatRef.current;
      if (elapsed > HEARTBEAT_TIMEOUT) {
        if (eventSourceRef.current) {
          setConnectionStatus("reconnecting");
        }
      }
    }, 5000);

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [isActive]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectAttemptsRef.current = 0;
      dispatch({ type: "RESET" });
    };
  }, [connect]);

  return { ...state, connectionStatus };
}
