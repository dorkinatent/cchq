export const THEMES = ["fossil", "midnight", "arctic", "terminal"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  fossil: "Fossil",
  midnight: "Midnight",
  arctic: "Arctic",
  terminal: "Terminal",
};

export const THEME_COLORS: Record<Theme, string> = {
  fossil: "#c8a060",
  midnight: "#7a7aff",
  arctic: "#2a6a9a",
  terminal: "#40b040",
};

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "fossil";
  return (localStorage.getItem("cchq-theme") as Theme) || "fossil";
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem("cchq-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}
