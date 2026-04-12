"use client";

import { useEffect, useRef } from "react";

type Command = {
  name: string;
  description: string;
  argumentHint: string;
};

export function SlashAutocomplete({
  commands,
  filter,
  selectedIndex,
  onSelect,
  visible,
}: {
  commands: Command[];
  filter: string;
  selectedIndex: number;
  onSelect: (command: Command) => void;
  visible: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!visible || commands.length === 0) return null;

  const filtered = filter
    ? commands.filter((c) => c.name.toLowerCase().startsWith(filter.toLowerCase()))
    : commands;

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg shadow-lg z-50">
      <div ref={listRef}>
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            className={`w-full flex items-start gap-3 px-3 py-2 text-left transition-colors ${
              i === selectedIndex
                ? "bg-[var(--surface)]"
                : "hover:bg-[var(--surface)]"
            }`}
          >
            <span className="text-[var(--accent)] font-mono text-sm shrink-0">
              /{cmd.name}
            </span>
            <span className="text-xs text-[var(--text-muted)] leading-relaxed">
              {cmd.description}
              {cmd.argumentHint && (
                <span className="text-[var(--text-muted)] opacity-60 ml-1">
                  {cmd.argumentHint}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
