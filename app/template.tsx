'use client'

/** Next.js remounts this on every navigation (unlike layout.tsx, which
 *  persists), so the CSS animation on .page-transition replays each time —
 *  a quick, dependency-free way to get a per-screen transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>
}
