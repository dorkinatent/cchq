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
      // Don't drop to idle — keep phase and let the next event (tool_start,
      // text_delta, message_complete, etc.) pick the correct phase. Just clear
      // the thinking timer so the 'Thinking Xs' label doesn't keep ticking.
      return { ...state, thinkingStartedAt: null };
    case "tool_start": {
      // If we just completed a message and are now seeing a fresh tool,
      // this is a new sub-turn — clear old tools so they don't pile up.
      const isNewTurn = state.completedMessage !== null;
      const baseTools = isNewTurn ? [] : state.activeTools;
      return {
        ...state,
        phase: "tool_use",
        completedMessage: null,
        activeTools: [
          ...baseTools,
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
    }
    case "tool_progress":
      return {
        ...state,
        activeTools: state.activeTools.map((t) =>
          t.toolUseId === event.toolUseId ? { ...t, elapsedSeconds: event.elapsedSeconds } : t
        ),
      };
    case "tool_end":
      // Just mark the tool as done — stay in tool_use phase so the indicator
      // keeps showing. The phase will transition out of tool_use when the next
      // thinking_start, text_delta, message_complete, or result event arrives.
      return {
        ...state,
        activeTools: state.activeTools.map((t) =>
          t.toolUseId === event.toolUseId ? { ...t, done: true, output: event.output } : t
        ),
      };
    case "text_delta": {
      // New sub-turn starting with text — clear old tools.
      const isNewTurn = state.completedMessage !== null;
      return {
        ...state,
        phase: "streaming",
        completedMessage: null,
        activeTools: isNewTurn ? [] : state.activeTools,
        streamingText: state.streamingText + event.text,
      };
    }
    case "message_complete":
      // Don't go to idle — more assistant messages or a final result may
      // follow. Keep the completed tools visible until the next turn's
      // tool_start or text_delta actually arrives (avoids empty-thinking
      // flicker between SDK turns).
      return {
        ...state,
        phase: "thinking",
        streamingText: "",
        thinkingStartedAt: null,
        completedMessage: { messageId: event.messageId, content: event.content, toolUse: event.toolUse },
        // activeTools preserved — cleared when the next tool_start arrives
        // with a toolUseId not in the current list.
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
