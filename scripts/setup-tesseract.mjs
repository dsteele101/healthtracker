#!/usr/bin/env node
/* Stages Tesseract's runtime assets into public/tesseract/ so the browser loads
 * them from this app's own origin.
 *
 * Left to itself, tesseract.js fetches its worker, WASM core, and training
 * data from cdn.jsdelivr.net at runtime. For an app that is
 * deliberately self-hosted behind Cloudflare Access, that is wrong three ways:
 * it phones out to a third party, it breaks the "works offline" promise on
 * first use, and it stops working entirely if the CDN is blocked or down.
 *
 * The worker and core come from node_modules. Only the training data has to be
 * downloaded, and only once — it is gitignored rather than committed because it
 * is far too large for a repo.
 *
 * Usage:  npm run setup:tesseract
 */

import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(ROOT, 'public', 'tesseract')
const LANG = process.env.TESSERACT_LANG ?? 'eng'

// Matches the default tesseract.js uses for lstmOnly (the smaller, "best" set).
const LANG_URL = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${LANG}/4.0.0_best_int/${LANG}.traineddata.gz`

/* Every tesseract-core* file is copied rather than a hand-picked subset.
 *
 * At load time tesseract.js probes the browser for relaxed-SIMD, then SIMD,
 * then plain WASM, and requests the matching variant — so which file is needed
 * depends on the browser doing the asking. An enumerated list silently omitted
 * the relaxed-SIMD build, which is exactly the one current Chrome asks for, and
 * the whole provider failed with a 404 on a file nobody had thought about.
 * Copying the set removes that class of bug. */
const CORE_DIR = join(ROOT, 'node_modules', 'tesseract.js-core')
const WORKER_FILE = ['tesseract.js/dist/worker.min.js', 'worker.min.js']

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

await mkdir(TARGET, { recursive: true })

let copied = 0

const workerSource = join(ROOT, 'node_modules', WORKER_FILE[0])
if (await exists(workerSource)) {
  await copyFile(workerSource, join(TARGET, WORKER_FILE[1]))
  copied += 1
} else {
  console.error(`missing ${WORKER_FILE[0]} — is tesseract.js installed?`)
  process.exit(1)
}

if (!(await exists(CORE_DIR))) {
  console.error('missing node_modules/tesseract.js-core — run npm install first')
  process.exit(1)
}

for (const name of await readdir(CORE_DIR)) {
  if (!name.startsWith('tesseract-core')) continue
  await copyFile(join(CORE_DIR, name), join(TARGET, name))
  copied += 1
}

console.log(`copied ${copied} runtime file(s) from node_modules`)

const langFile = join(TARGET, `${LANG}.traineddata.gz`)
if (await exists(langFile)) {
  const { size } = await stat(langFile)
  console.log(`${LANG}.traineddata.gz already present (${(size / 1024 / 1024).toFixed(1)} MB)`)
} else {
  console.log(`downloading ${LANG}.traineddata.gz …`)
  const response = await fetch(LANG_URL)
  if (!response.ok || !response.body) {
    console.error(`failed to download ${LANG_URL}: ${response.status}`)
    process.exit(1)
  }
  // Streamed rather than buffered: this file is tens of megabytes.
  await pipeline(Readable.fromWeb(response.body), createWriteStream(langFile))
  const { size } = await stat(langFile)
  console.log(`wrote ${LANG}.traineddata.gz (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

console.log('\nTesseract will now load entirely from this app’s origin.')
