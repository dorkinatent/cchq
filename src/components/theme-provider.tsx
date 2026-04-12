"use client";

import { useEffect } from "react";
import { getStoredTheme } from "@/lib/themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = getStoredTheme();
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  return <>{children}</>;
}
