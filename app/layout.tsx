import type { Metadata, Viewport } from "next";
// Self-hosted via @fontsource (files ship in the npm package itself), not
// next/font/google — `next build` runs with no network access.
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "./globals.css";
import { ActiveSessionBar } from "./components/active-session-bar";
import { ServiceWorkerRegistration } from "./service-worker-registration";

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

export const viewport: Viewport = {
  themeColor: "#0d1128",
  width: "device-width",
  initialScale: 1,
  // Entry forms are thumb-driven; keep zoom available rather than locking it.
  maximumScale: 5,
  // Let the app paint into the notch/home-indicator area in standalone mode.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ActiveSessionBar />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
