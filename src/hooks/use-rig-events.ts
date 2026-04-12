"use client";

import { useEffect, useRef, useState } from "react";
import type { RigEvent } from "@/lib/engines/types";

export function useRigEvents(projectId: string, enabled: boolean) {
  const [events, setEvents] = useState<RigEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`/api/rigs/${projectId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "ping") return;
        setEvents((prev) => [event, ...prev].slice(0, 500));
      } catch {}
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectId, enabled]);

  return events;
}
