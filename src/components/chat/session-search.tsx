"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "@/hooks/use-session-messages";

type SearchResult = Message;

export function SessionSearch({
  sessionId,
  onJumpToMessage,
}: {
  sessionId: string;
  onJumpToMessage: (messageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+F to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/messages/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      }
      setSearching(false);
    },
    [sessionId]
  );

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  function handleResultClick(messageId: string) {
    onJumpToMessage(messageId);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function truncateContent(content: string, maxLen = 120) {
    if (content.length <= maxLen) return content;
    return content.slice(0, maxLen) + "...";
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="px-2.5 py-1 text-xs bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        title="Search messages (Cmd+F)"
      >
        Search
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search messages..."
          className="px-2.5 py-1 text-xs bg-[var(--surface-raised)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] w-48 outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => {
            setOpen(false);
            setQuery("");
            setResults([]);
          }}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Esc
        </button>
      </div>

      {(results.length > 0 || searching) && (
        <div className="absolute top-full right-0 mt-1 w-80 max-h-64 overflow-y-auto bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg shadow-lg z-50">
          {searching && (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
              Searching...
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleResultClick(r.id)}
              className="w-full text-left px-3 py-2 hover:bg-[var(--bg)] border-b border-[var(--border)] last:border-b-0"
            >
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">
                {r.role === "user" ? "You" : "Claude"} &middot;{" "}
                {new Date(r.created_at).toLocaleTimeString()}
              </div>
              <div className="text-xs text-[var(--text-secondary)] line-clamp-2">
                {truncateContent(r.content)}
              </div>
            </button>
          ))}
          {!searching && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
