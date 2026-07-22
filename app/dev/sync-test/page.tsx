import { notFound } from 'next/navigation'
import { SyncTestHarness } from './harness'

/** Dev-only. Exercises the local store and sync engine in a real browser,
 *  where IndexedDB actually exists. Never reachable in production. */
export default function SyncTestPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <SyncTestHarness />
}
