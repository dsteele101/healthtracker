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

/* Reused across hot reloads in dev, where module state is discarded on every
 * edit and a fresh pool per reload would leak connections until Postgres
 * refuses new ones. */
export const pool: Pool = globalThis.__dbPool ?? createPool()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dbPool = pool
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}
