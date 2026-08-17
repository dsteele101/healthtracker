import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_COLOR, THEME_COOKIE, isThemeId } from "@/lib/theme";
// Self-hosted via @fontsource (files ship in the npm package itself), not
// next/font/google — `next build` runs with no network access. All three
// themes' fonts load upfront rather than per-theme, since @fontsource ships
// static CSS with no runtime lazy-load hook.
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "@fontsource/work-sans/latin-400.css";
import "@fontsource/work-sans/latin-600.css";
import "@fontsource/work-sans/latin-800.css";
import "./globals.css";
import { ActiveSessionBar } from "./components/active-session-bar";
import { NavBar } from "./components/nav-bar";
import { ServiceWorkerRegistration } from "./service-worker-registration";

/** The chosen theme, read once per request. No `cookies()` usage existed in
 *  this codebase before this feature — reading it here opts the whole route
 *  into dynamic rendering, an acceptable tradeoff since every page is
 *  already `'use client'` and reads from IndexedDB, not anything static. */
async function readTheme() {
  const store = await cookies();
  const raw = store.get(THEME_COOKIE)?.value;
  return isThemeId(raw) ? raw : DEFAULT_THEME;
}

export const metadata: Metadata = {
  title: "Health Tracker",
  description: "Exercise and Dance Dance Revolution logging",
  applicationName: "Health Tracker",
  // Lets iOS launch the installed app without Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Tracker",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await readTheme();
  return {
    themeColor: THEME_COLOR[theme],
    width: "device-width",
    initialScale: 1,
    // Entry forms are thumb-driven; keep zoom available rather than locking it.
    maximumScale: 5,
    // Let the app paint into the notch/home-indicator area in standalone mode.
    viewportFit: "cover",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await readTheme();

  return (
    <html lang="en" data-theme={theme}>
      <body>
        <NavBar />
        <ActiveSessionBar />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
