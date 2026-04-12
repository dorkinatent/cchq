"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSessions, type Session } from "@/hooks/use-sessions";
import { useBlockedSessions, type BlockedSummary } from "@/hooks/use-blocked-sessions";
import { useRailPrefs } from "@/hooks/use-rail-prefs";

type Project = { id: string; name: string; path: string; engine: "sdk" | "gastown" };

export type DerivedSessionState =
  | "blocked"
  | "errored"
  | "streaming"
  | "idle"
  | "paused"
  | "completed";

export type EnrichedSession = Session & {
  state: DerivedSessionState;
  blockedTool?: string;
  blockedPreview?: string;
};

function deriveState(session: Session, blocked: BlockedSummary): DerivedSessionState {
  if (blocked[session.id]) return "blocked";
  if (session.status === "errored") return "errored";
  if (session.status === "paused") return "paused";
  if (session.status === "completed") return "completed";
  // Active: treat recently-updated (<20s) as streaming, else idle.
  const ageMs = Date.now() - new Date(session.updated_at).getTime();
  return ageMs < 20_000 ? "streaming" : "idle";
}

type SwitcherCtx = {
  projects: Project[];
  sessions: EnrichedSession[];
  blockedCount: number;
  prefs: ReturnType<typeof useRailPrefs>["prefs"];
  hydrated: boolean;
  setWidth: (w: number) => void;
  setFilter: ReturnType<typeof useRailPrefs>["setFilter"];
  toggleGroup: (id: string) => void;
  setCompletedOpen: (open: boolean) => void;
  togglePin: (id: string) => void;
  currentSessionId: string | null;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  switcherOpen: boolean;
  navigateTo: (sessionId: string) => void;
  newSessionOpen: boolean;
  openNewSession: () => void;
  closeNewSession: () => void;
};

const Ctx = createContext<SwitcherCtx | null>(null);

export function SessionSwitcherProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sessions: rawSessions } = useSessions();
  const blocked = useBlockedSessions();
  const { prefs, hydrated, setWidth, setFilter, toggleGroup, setCompletedOpen, togglePin, recordRecent } =
    useRailPrefs();

  const [projects, setProjects] = useState<Project[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => void 0);
  }, []);

  const sessions = useMemo<EnrichedSession[]>(
    () =>
      rawSessions.map((s) => {
        const block = blocked[s.id];
        return {
          ...s,
          state: deriveState(s, blocked),
          blockedTool: block?.toolName,
          blockedPreview: block?.preview,
        };
      }),
    [rawSessions, blocked]
  );

  const blockedCount = useMemo(() => sessions.filter((s) => s.state === "blocked").length, [sessions]);

  const currentSessionId = useMemo(() => {
    const match = pathname?.match(/^\/sessions\/([^/?#]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Record MRU on nav
  useEffect(() => {
    if (currentSessionId) recordRecent(currentSessionId);
  }, [currentSessionId, recordRecent]);

  const navigateTo = useCallback(
    (sessionId: string) => {
      router.push(`/sessions/${sessionId}`);
      setSwitcherOpen(false);
    },
    [router]
  );

  const openSwitcher = useCallback(() => setSwitcherOpen(true), []);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);
  const openNewSession = useCallback(() => {
    setSwitcherOpen(false);
    setNewSessionOpen(true);
  }, []);
  const closeNewSession = useCallback(() => setNewSessionOpen(false), []);

  // Global keyboard shortcuts. Registered once here so rail + overlay + any
  // page can rely on them.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // ⌘K: open switcher. Allow from anywhere, even inputs.
      if (e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSwitcherOpen((o) => !o);
        return;
      }


      // ⌘⇧[ / ⌘⇧]: cycle prev/next session in the visible list.
      if (e.shiftKey && (e.key === "[" || e.key === "]" || e.code === "BracketLeft" || e.code === "BracketRight")) {
        e.preventDefault();
        const ids = sessions.map((s) => s.id);
        if (!ids.length) return;
        const idx = currentSessionId ? ids.indexOf(currentSessionId) : -1;
        const dir = e.key === "]" || e.code === "BracketRight" ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : (idx + dir + ids.length) % ids.length;
        router.push(`/sessions/${ids[nextIdx]}`);
        return;
      }

    }

    function onAlt(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;

      // ⌥⇧N: open new-session dialog. ⌘N / ⌘⇧N are taken by browsers.
      // We rely on e.code because ⌥ produces glyphs (⌥N = "˜", ⌥⇧N = "˜").
      if (e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        setSwitcherOpen(false);
        setNewSessionOpen(true);
        return;
      }

      // ⌥1..9: jump to pinned. Avoids ⌘1..9 which macOS browsers steal
      // for tab switching and won't let us preventDefault.
      if (e.shiftKey) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const id = prefs.pinned[Number(m[1]) - 1];
      if (!id) return;
      e.preventDefault();
      router.push(`/sessions/${id}`);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onAlt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onAlt);
    };
  }, [sessions, currentSessionId, prefs.pinned, router]);

  const value = useMemo<SwitcherCtx>(
    () => ({
      projects,
      sessions,
      blockedCount,
      prefs,
      hydrated,
      setWidth,
      setFilter,
      toggleGroup,
      setCompletedOpen,
      togglePin,
      currentSessionId,
      openSwitcher,
      closeSwitcher,
      switcherOpen,
      navigateTo,
      newSessionOpen,
      openNewSession,
      closeNewSession,
    }),
    [
      projects,
      sessions,
      blockedCount,
      prefs,
      hydrated,
      setWidth,
      setFilter,
      toggleGroup,
      setCompletedOpen,
      togglePin,
      currentSessionId,
      openSwitcher,
      closeSwitcher,
      switcherOpen,
      navigateTo,
      newSessionOpen,
      openNewSession,
      closeNewSession,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionSwitcher() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSessionSwitcher must be used inside SessionSwitcherProvider");
  return v;
}
