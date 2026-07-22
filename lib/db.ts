import { Pool } from 'pg'

declare global {
  var __dbPool: Pool | undefined
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  // Small pool: one user, and Postgres is a container away on the same host.
  return new Pool({ connectionString, max: 10 })
}

/* Lazily created on first use, not at module load, so that importing this
 * module during `next build` (e.g. via static prerendering) doesn't require
 * DATABASE_URL or a reachable Postgres instance at build time.
 *
 * Reused across hot reloads in dev, where module state is discarded on every
 * edit and a fresh pool per reload would leak connections until Postgres
 * refuses new ones. */
function getPool(): Pool {
  if (!globalThis.__dbPool) {
    globalThis.__dbPool = createPool()
  }
  return globalThis.__dbPool
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver)
  },
})

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(text, params)
  return result.rows as T[]
}
