"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSessions, type Session } from "@/hooks/use-sessions";
import { useBlockedSessions, type BlockedSummary } from "@/hooks/use-blocked-sessions";
import { useRailPrefs } from "@/hooks/use-rail-prefs";
import { useWorkspaces, type Workspace } from "@/hooks/use-workspaces";
import { carouselOrder } from "@/lib/carousel-order";

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

function deriveState(session: Session, blocked: BlockedSummary, now: number): DerivedSessionState {
  if (blocked[session.id]) return "blocked";
  if (session.status === "errored") return "errored";
  if (session.status === "paused") return "paused";
  if (session.status === "completed") return "completed";
  // Active: treat recently-updated (<20s) as streaming, else idle.
  const ageMs = now - new Date(session.updated_at).getTime();
  return ageMs < 20_000 ? "streaming" : "idle";
}

// ──────────────────────────────────────────────────────────────────────────
// Context split: State vs Actions.
//
// Why: a 2s `now` tick drives `deriveState`, which flips `sessions` identity
// every 2s. If every consumer sits on one combined context, every consumer
// re-renders every 2s — including callers that only need a stable callback
// like `refetchWorkspaces` or `togglePin`.
//
// Actions are memoized with useCallback and live in their own provider, so
// action-only consumers never re-render from the tick. `useSessionSwitcher()`
// stays as the merged-shape hook for backwards compatibility.
// ──────────────────────────────────────────────────────────────────────────
type StateCtx = {
  projects: Project[];
  sessions: EnrichedSession[];
  blockedCount: number;
  prefs: ReturnType<typeof useRailPrefs>["prefs"];
  hydrated: boolean;
  currentSessionId: string | null;
  switcherOpen: boolean;
  newSessionOpen: boolean;
  mobileRailOpen: boolean;
  workspaces: Workspace[];
};

type ActionsCtx = {
  setWidth: (w: number) => void;
  setFilter: ReturnType<typeof useRailPrefs>["setFilter"];
  toggleGroup: (id: string) => void;
  setCompletedOpen: (open: boolean) => void;
  togglePin: (id: string) => void;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  navigateTo: (sessionId: string) => void;
  openNewSession: () => void;
  closeNewSession: () => void;
  openMobileRail: () => void;
  closeMobileRail: () => void;
  refetchWorkspaces: () => void;
};

type SwitcherCtx = StateCtx & ActionsCtx;

const StateCtxObj = createContext<StateCtx | null>(null);
const ActionsCtxObj = createContext<ActionsCtx | null>(null);

export function SessionSwitcherProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sessions: rawSessions } = useSessions();
  const blocked = useBlockedSessions();
  const { prefs, hydrated, setWidth, setFilter, toggleGroup, setCompletedOpen, togglePin, recordRecent } =
    useRailPrefs();
  const { workspaces, refetch: refetchWorkspaces } = useWorkspaces();

  const [projects, setProjects] = useState<Project[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  // Tick so `deriveState`'s 20s-recency check actually re-evaluates between
  // session polls (otherwise a session stays "streaming" until the next poll).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

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
          state: deriveState(s, blocked, now),
          blockedTool: block?.toolName,
          blockedPreview: block?.preview,
        };
      }),
    [rawSessions, blocked, now]
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
  const openMobileRail = useCallback(() => setMobileRailOpen(true), []);
  const closeMobileRail = useCallback(() => setMobileRailOpen(false), []);

  // Auto-close mobile rail on navigation.
  useEffect(() => {
    setMobileRailOpen(false);
  }, [pathname]);

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


      // ⌘⇧[ / ⌘⇧]: cycle prev/next session in carousel order.
      if (e.shiftKey && (e.key === "[" || e.key === "]" || e.code === "BracketLeft" || e.code === "BracketRight")) {
        e.preventDefault();
        const ids = carouselOrder(sessions, prefs.recent);
        if (!ids.length) return;
        const idx = currentSessionId ? ids.indexOf(currentSessionId) : -1;
        const dir = e.key === "]" || e.code === "BracketRight" ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : Math.max(0, Math.min(ids.length - 1, idx + dir));
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

  const stateValue = useMemo<StateCtx>(
    () => ({
      projects,
      sessions,
      blockedCount,
      prefs,
      hydrated,
      currentSessionId,
      switcherOpen,
      newSessionOpen,
      mobileRailOpen,
      workspaces,
    }),
    [
      projects,
      sessions,
      blockedCount,
      prefs,
      hydrated,
      currentSessionId,
      switcherOpen,
      newSessionOpen,
      mobileRailOpen,
      workspaces,
    ]
  );

  const actionsValue = useMemo<ActionsCtx>(
    () => ({
      setWidth,
      setFilter,
      toggleGroup,
      setCompletedOpen,
      togglePin,
      openSwitcher,
      closeSwitcher,
      navigateTo,
      openNewSession,
      closeNewSession,
      openMobileRail,
      closeMobileRail,
      refetchWorkspaces,
    }),
    [
      setWidth,
      setFilter,
      toggleGroup,
      setCompletedOpen,
      togglePin,
      openSwitcher,
      closeSwitcher,
      navigateTo,
      openNewSession,
      closeNewSession,
      openMobileRail,
      closeMobileRail,
      refetchWorkspaces,
    ]
  );

  return (
    <ActionsCtxObj.Provider value={actionsValue}>
      <StateCtxObj.Provider value={stateValue}>{children}</StateCtxObj.Provider>
    </ActionsCtxObj.Provider>
  );
}

/**
 * Backwards-compatible merged hook. Subscribes to BOTH state and actions
 * contexts, so consumers re-render whenever the state slice changes.
 * Prefer `useSessionSwitcherActions()` if you only need callbacks.
 */
export function useSessionSwitcher(): SwitcherCtx {
  const s = useContext(StateCtxObj);
  const a = useContext(ActionsCtxObj);
  if (!s || !a)
    throw new Error("useSessionSwitcher must be used inside SessionSwitcherProvider");
  return { ...s, ...a };
}

/** Actions-only hook. Does not subscribe to state changes. */
export function useSessionSwitcherActions(): ActionsCtx {
  const a = useContext(ActionsCtxObj);
  if (!a)
    throw new Error("useSessionSwitcherActions must be used inside SessionSwitcherProvider");
  return a;
}
