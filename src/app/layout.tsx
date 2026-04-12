import type { Metadata } from "next";
import { Recursive } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionSwitcherProvider } from "@/components/session-switcher/context";
import { SessionRail } from "@/components/session-switcher/session-rail";
import { QuickSwitcher } from "@/components/session-switcher/quick-switcher";

// Recursive is a variable font with CASL (casual/warmth) and MONO axes — one
// family covers UI text and terminal contexts without loading a second family.
const recursive = Recursive({
  subsets: ["latin"],
  axes: ["CASL", "MONO", "slnt"],
  variable: "--font-recursive",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CCUI — Claude Code Dashboard",
  description: "Control multiple Claude Code instances from one place",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="fossil" className={recursive.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("ccui-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text-primary)] antialiased">
        <ThemeProvider>
          <SessionSwitcherProvider>
            <div className="flex h-screen overflow-hidden">
              <SessionRail />
              <main className="flex-1 overflow-auto min-w-0">{children}</main>
            </div>
            <QuickSwitcher />
          </SessionSwitcherProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
