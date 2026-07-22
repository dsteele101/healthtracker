# Health Tracker

Personal exercise and Dance Dance Revolution log. A phone-installable PWA,
self-hosted, that keeps working with no signal.

- **Offline-first.** Every entry is written to IndexedDB and rendered from there,
  then synced. Logging in a basement gym works exactly the same as at home.
- **Self-hosted.** Next.js + Postgres in Docker on your own box, reached through
  a Cloudflare Tunnel at `tracker.dsteele.net`.
- **No login.** Cloudflare Access authenticates at the edge, so the app has no
  sign-in screen, no sessions, and no user table.
- **Exportable.** JSON (complete, re-importable) and CSV (spreadsheet-friendly),
  generated on-device so they work with the server down.
- **Photo import.** Snap a DDR results screen and the entry form pre-fills.
  Four interchangeable OCR providers behind one interface; nothing saves without
  confirmation.

## Setup and operations

See **[docs/operations.md](docs/operations.md)** for Cloudflare Tunnel + Access,
deployment, backups, and restore procedure.

## Local development

Needs Node 20.9+ and a Postgres 17 you can reach.

```bash
npm install
cp .env.example .env        # set DATABASE_URL
npm run migrate             # apply db/migrations/*.sql
npm run dev
```

| Command | |
|---|---|
| `npm run dev` | dev server on :3000 |
| `npm run build` / `npm start` | production build and serve |
| `npm run migrate` | apply pending migrations (idempotent) |
| `npm run setup:tesseract` | stage local OCR assets (only for the tesseract provider) |
| `npm run lint` | eslint |
| `npx tsc --noEmit` | typecheck |

`/dev/sync-test` runs the local-store and sync-engine suite in the browser. It
404s in production.

## Layout

```
app/                  routes; all data-driven screens are client components
  api/sync/           push + pull endpoints
  log/exercise|ddr/   entry forms
  types/              exercise type management
  data/               export and import
lib/
  local-db.ts         IndexedDB store — every write lands here first
  sync.ts             push/pull engine, offline and auth handling
  export.ts           JSON + CSV export, JSON import
  validate.ts         server-side row validation
  ocr/                photo import: provider registry + shared parse layer
db/migrations/        numbered SQL, applied in order on container start
scripts/              migrate, backup, restore-check
docs/operations.md    runbook
```

## How sync works

Writes go to IndexedDB and are flagged pending. A push sends the pending rows;
a pull asks for everything after a cursor. Two details carry most of the weight:

- **Conflicts resolve on `updated_at`** (set by the client at edit time), but the
  **pull cursor is a server-assigned sequence** — never a timestamp. A client
  clock as a cursor breaks under skew: a phone running slow writes rows that
  another device's cursor steps straight over, and they never arrive.
- **Deletes are tombstones.** Without them a deleted row is resurrected by
  whichever device still holds a copy.

Anything short of an explicit success leaves the queue untouched, so an offline
gym session, a dead server, and an expired Access session are all safe.
