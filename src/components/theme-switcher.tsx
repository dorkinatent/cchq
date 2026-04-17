"use client";

import { useState, useEffect } from "react";
import { THEMES, THEME_LABELS, THEME_COLORS, getStoredTheme, setStoredTheme, type Theme } from "@/lib/themes";

export function ThemeSwitcher() {
  const [current, setCurrent] = useState<Theme>("fossil");

  useEffect(() => {
    setCurrent(getStoredTheme());
  }, []);

  function handleSwitch(theme: Theme) {
    setStoredTheme(theme);
    setCurrent(theme);
  }

  return (
    <div className="mt-auto pt-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
        Theme
      </div>
      <div className="flex flex-col gap-0.5">
        {THEMES.map((theme) => (
          <button
            key={theme}
            onClick={() => handleSwitch(theme)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left ${
              current === theme
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: THEME_COLORS[theme] }}
            />
            {THEME_LABELS[theme]}
          </button>
        ))}
      </div>
    </div>
  );
}
