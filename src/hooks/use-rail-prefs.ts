"use client";

import { useCallback, useEffect, useState } from "react";

export type RailFilter = "all" | "active" | "paused" | "needs-you" | "recent";

type Prefs = {
  width: number;
  filter: RailFilter;
  collapsedGroups: Record<string, boolean>;
  completedOpen: boolean;
  pinned: string[]; // session ids, in ⌘1..9 order
  recent: string[]; // MRU session ids
};

const DEFAULTS: Prefs = {
  width: 240,
  filter: "all",
  collapsedGroups: {},
  completedOpen: false,
  pinned: [],
  recent: [],
};

const STORAGE_KEY = "cchq-rail-prefs-v1";
const MAX_PINS = 9;
const MAX_RECENT = 12;

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed, collapsedGroups: parsed.collapsedGroups ?? {} };
  } catch {
    return DEFAULTS;
  }
}

export function useRailPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(read());
    setHydrated(true);
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setPrefs(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => {
    setPrefs((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setWidth = useCallback((width: number) => update({ width }), [update]);
  const setFilter = useCallback((filter: RailFilter) => update({ filter }), [update]);
  const toggleGroup = useCallback(
    (projectId: string) =>
      update((p) => ({
        collapsedGroups: { ...p.collapsedGroups, [projectId]: !p.collapsedGroups[projectId] },
      })),
    [update]
  );
  const setCompletedOpen = useCallback((completedOpen: boolean) => update({ completedOpen }), [update]);

  const togglePin = useCallback(
    (sessionId: string) =>
      update((p) => {
        const has = p.pinned.includes(sessionId);
        if (has) return { pinned: p.pinned.filter((id) => id !== sessionId) };
        if (p.pinned.length >= MAX_PINS) return { pinned: [...p.pinned.slice(1), sessionId] };
        return { pinned: [...p.pinned, sessionId] };
      }),
    [update]
  );

  const recordRecent = useCallback(
    (sessionId: string) =>
      update((p) => {
        const next = [sessionId, ...p.recent.filter((id) => id !== sessionId)].slice(0, MAX_RECENT);
        return { recent: next };
      }),
    [update]
  );

  return {
    prefs,
    hydrated,
    setWidth,
    setFilter,
    toggleGroup,
    setCompletedOpen,
    togglePin,
    recordRecent,
  };
}
