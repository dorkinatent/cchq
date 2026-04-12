"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocsTab } from "@/components/docs/docs-tab";
import { NotesTab } from "@/components/docs/notes-tab";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
};

type TabKey = "context" | "docs" | "notes";

export type MainOverlay =
  | null
  | { kind: "doc"; relativePath: string }
  | { kind: "note"; id: string };

const MIN_WIDTH = 288;
const MAX_WIDTH = 720;
const STORAGE_KEY = "ccui:context-panel-width";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function clampWidth(w: number): number {
  if (Number.isNaN(w)) return MIN_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)));
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-sm text-[var(--text-secondary)] tabular-nums text-right truncate">{value}</span>
    </div>
  );
}

function ContextView({
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
}: {
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
}) {
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  useEffect(() => {
    if (projectId) {
      fetch(`/api/knowledge?projectId=${projectId}`)
        .then((r) => r.json())
        .then((entries) => setKnowledge(entries.slice(0, 10)));
    }
  }, [projectId]);

  const shortPath = projectPath.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

  return (
    <div className="pt-6 px-5 pb-4 overflow-y-auto rail-scroll flex-1">
      <div>
        <div className="eyebrow mb-1.5">Working directory</div>
        <div
          className="font-mono text-[12px] text-[var(--text-primary)] break-all leading-snug"
          title={projectPath}
        >
          {shortPath}
        </div>
      </div>

      <div className="mt-6">
        <div className="eyebrow mb-1.5">Session</div>
        <div className="divide-y divide-[var(--border)]/40">
          <DefRow label="Model" value={<span className="font-mono">{model}</span>} />
          <DefRow label="Effort" value={effort || "high"} />
          <DefRow label="Messages" value={messageCount.toLocaleString()} />
          {usage && (
            <>
              <DefRow label="Turns" value={usage.numTurns.toLocaleString()} />
              <DefRow label="Tokens" value={formatTokens(usage.totalTokens)} />
              <DefRow label="Cost" value={`$${usage.totalCostUsd.toFixed(2)}`} />
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="eyebrow mb-2 flex items-center justify-between">
          <span>Injected knowledge</span>
          {knowledge.length > 0 && (
            <span className="text-[var(--text-muted)] tabular-nums normal-case tracking-normal">
              {knowledge.length}
            </span>
          )}
        </div>
        {knowledge.length === 0 ? (
          <div className="text-[12px] text-[var(--text-muted)] leading-relaxed">
            Nothing injected for this project yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {knowledge.map((k) => (
              <li key={k.id} className="text-[12px] leading-relaxed">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--accent)] mb-0.5">
                  {k.type}
                </div>
                <div className="text-[var(--text-secondary)]">{k.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SessionContextPanel({
  projectId,
  projectPath,
  model,
  effort,
  messageCount,
  usage,
  onExpandToMain,
}: {
  sessionId: string;
  projectId: string;
  projectPath: string;
  model: string;
  effort?: string;
  messageCount: number;
  usage?: { totalTokens: number; totalCostUsd: number; numTurns: number } | null;
  onExpandToMain?: (payload: MainOverlay) => void;
}) {
  const [tab, setTab] = useState<TabKey>("context");
  const [width, setWidth] = useState<number>(MIN_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Hydrate width from localStorage (after mount to avoid SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) setWidth(clampWidth(parsed));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist on change (but skip the initial MIN_WIDTH default).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  const tabs = [
    { key: "context", label: "Context" },
    { key: "docs", label: "Docs" },
    { key: "notes", label: "Notes" },
  ] as const;
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    context: null,
    docs: null,
    notes: null,
  });

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, currentKey: TabKey) {
    const idx = tabs.findIndex((t) => t.key === currentKey);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const nextKey = tabs[nextIdx].key;
      setTab(nextKey);
      tabRefs.current[nextKey]?.focus();
    }
  }

  // Drag-to-resize wiring.
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      setDragging(true);
    },
    [width]
  );

  useEffect(() => {
    if (!dragging) return;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    function onMove(ev: MouseEvent) {
      const state = dragStateRef.current;
      if (!state) return;
      // Handle is on the LEFT edge of the aside — dragging left grows the panel.
      const delta = state.startX - ev.clientX;
      setWidth(clampWidth(state.startWidth + delta));
    }
    function onUp() {
      dragStateRef.current = null;
      setDragging(false);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging]);

  function handleResizeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const STEP = 8;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => clampWidth(w + STEP));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => clampWidth(w - STEP));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(MIN_WIDTH);
    } else if (e.key === "End") {
      e.preventDefault();
      setWidth(MAX_WIDTH);
    }
  }

  return (
    <aside
      className="relative shrink-0 border-l border-[var(--border)] bg-[color-mix(in_oklch,var(--surface)_50%,transparent)] flex flex-col overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle — absolute on the aside's left edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-label="Resize context panel"
        tabIndex={0}
        onMouseDown={onResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        className={`group absolute left-0 top-0 bottom-0 w-1 -ml-0.5 z-10 cursor-ew-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        <div
          className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px transition-colors ${
            dragging
              ? "bg-[var(--accent)]"
              : "bg-[var(--border)] group-hover:bg-[var(--accent)] group-focus-visible:bg-[var(--accent)]"
          }`}
          aria-hidden
        />
      </div>

      <nav
        className="flex border-b border-[var(--border)] px-2"
        role="tablist"
        aria-label="Session context tabs"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => handleTabKeyDown(e, t.key)}
            className={`flex-1 text-[11px] uppercase tracking-[0.08em] py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 ${
              tab === t.key
                ? "text-[var(--accent)] border-b border-[var(--accent)] -mb-px"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "context" && (
        <div
          role="tabpanel"
          id="panel-context"
          aria-labelledby="tab-context"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <ContextView
            projectId={projectId}
            projectPath={projectPath}
            model={model}
            effort={effort}
            messageCount={messageCount}
            usage={usage}
          />
        </div>
      )}
      {tab === "docs" && (
        <div
          role="tabpanel"
          id="panel-docs"
          aria-labelledby="tab-docs"
          className="flex-1 overflow-hidden"
        >
          <DocsTab
            projectId={projectId}
            projectPath={projectPath}
            onExpandToMain={onExpandToMain}
          />
        </div>
      )}
      {tab === "notes" && (
        <div
          role="tabpanel"
          id="panel-notes"
          aria-labelledby="tab-notes"
          className="flex-1 overflow-hidden"
        >
          <NotesTab projectId={projectId} onExpandToMain={onExpandToMain} />
        </div>
      )}
    </aside>
  );
}
