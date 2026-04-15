import type { Metadata, Viewport } from "next";
import { Recursive, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionSwitcherProvider } from "@/components/session-switcher/context";
import { SessionRail } from "@/components/session-switcher/session-rail";
import { QuickSwitcher } from "@/components/session-switcher/quick-switcher";
import { NewSessionPortal } from "@/components/session-switcher/new-session-portal";
import { MobileHeader, MobileRailOverlay } from "@/components/session-switcher/mobile-nav";
import { ToastProvider } from "@/components/ui/toast";

// Recursive is a variable font with CASL (casual/warmth) and MONO axes — one
// family covers UI text and terminal contexts without loading a second family.
const recursive = Recursive({
  subsets: ["latin"],
  axes: ["CASL", "MONO", "slnt"],
  variable: "--font-recursive",
  display: "swap",
});

// Bricolage Grotesque pairs with Recursive as the display face — variable,
// warm-mechanical-with-personality, reads like a museum caption or fabric
// label. Used for headings; body/UI text stays on Recursive.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "CCHQ — Claude Code Headquarters",
  description: "Control multiple Claude Code instances from one place",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="fossil" className={`${recursive.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("cchq-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text-primary)] antialiased">
        <ThemeProvider>
          <ToastProvider>
            <SessionSwitcherProvider>
              <div className="flex flex-col h-dvh overflow-hidden">
                <MobileHeader />
                <div className="flex flex-1 overflow-hidden min-h-0">
                  <SessionRail />
                  <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">{children}</main>
                </div>
              </div>
              <MobileRailOverlay />
              <QuickSwitcher />
              <NewSessionPortal />
            </SessionSwitcherProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
