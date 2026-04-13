"use client";

import { useCallback, useEffect, useState } from "react";

export type Workspace = {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
};

// Refetch on mount and on window focus. Workspaces rarely change, so no
// polling — keeps the rail quiet.
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Workspace[];
      setWorkspaces(data);
    } catch {
      // transient — retry on next focus
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    function onFocus() {
      refetch();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return { workspaces, loading, refetch };
}
