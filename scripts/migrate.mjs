#!/usr/bin/env node
/* Applies db/migrations/*.sql in filename order, once each.
 *
 * Deliberately not a migration framework: a single-user app with a handful of
 * tables needs an applied-set and a transaction, and little else. */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const { rows } = await client.query('SELECT filename FROM schema_migrations')
  const applied = new Set(rows.map((r) => r.filename))

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

  let count = 0
  for (const filename of files) {
    if (applied.has(filename)) continue

    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')

    // Each migration is atomic: a failure leaves no partial schema behind and
    // no row in schema_migrations, so a fixed migration can just be re-run.
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
      await client.query('COMMIT')
      console.log(`applied ${filename}`)
      count += 1
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(`failed ${filename}: ${error.message}`)
      process.exitCode = 1
      break
    }
  }

  if (process.exitCode !== 1) {
    console.log(count === 0 ? 'schema up to date' : `applied ${count} migration(s)`)
  }
} finally {
  await client.end()
}
