# Operations runbook

Everything needed to stand this up on your own box and keep it running.
The app is at `tracker.dsteele.net`, served from a local machine through a
Cloudflare Tunnel, with Cloudflare Access in front of it.

---

## 1. Cloudflare: DNS, tunnel, and Access

Registration for `dsteele.net` stays at Porkbun. Cloudflare only needs to be the
**DNS provider** — that's what Tunnel requires, and the two are separate things.

### 1.1 Move nameservers

1. Add `dsteele.net` as a site in Cloudflare on the **Free** plan. It scans and
   imports the existing DNS records.
2. **Before cutting over, screenshot the current Porkbun DNS records and diff them
   against what Cloudflare imported.** This is the one step here that can break
   something unrelated: Cloudflare becomes authoritative for the whole zone, so a
   missing `MX` or `TXT` record silently stops mail for the domain. If nothing is
   parked on `dsteele.net`, this is risk-free.
3. In Porkbun, replace the nameservers with the two Cloudflare provides.
4. Wait for the zone to show **Active** (usually well under an hour).

### 1.2 Create the tunnel

On the server:

```bash
# Debian/Ubuntu
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared

cloudflared tunnel login          # pick dsteele.net; writes ~/.cloudflared/cert.pem
cloudflared tunnel create healthtracker    # note the UUID it prints
cloudflared tunnel route dns healthtracker tracker.dsteele.net
```

That last command creates the subdomain — a proxied `CNAME` to
`<uuid>.cfargotunnel.com`. Don't hand-create the record; doing it manually is
where people leave the proxy off and break the tunnel.

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/derrick/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: tracker.dsteele.net
    service: http://localhost:3000
  - service: http_status:404      # required; cloudflared won't start without it
```

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### 1.3 Lock it down — do not skip

Zero Trust → **Access → Applications → Add a self-hosted application**:

- Application domain: `tracker.dsteele.net`
- Policy: **Allow**, rule type **Emails**, value `derrick.l.steele@gmail.com`

> Between creating the DNS route and adding this policy, the app is on the public
> internet with no authentication at all. Do both in one sitting, or add the
> Access application before running `tunnel route dns`.

The app still has no login screen, no password, and no session table — Access
does the authenticating. What it does have is a `users` table, because it now
reads the identity Access established rather than assuming there is only one
person behind it.

### 1.4 Tell the app who Access says you are

Access signs a JWT and sends it on every request it proxies. The app verifies
that signature and reads the email claim. Two values are needed for that, both
required — with either missing, every data route returns 503 rather than falling
open:

| Variable | Where to find it |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | The `<team>.cloudflareaccess.com` hostname you log in at. No scheme. |
| `CF_ACCESS_AUD` | Access → Applications → `tracker.dsteele.net` → **Overview** → *Application Audience (AUD) Tag*. |

Put both in `.env`. `docker-compose.yml` guards them with `:?`, so a missing
value fails `docker compose up` immediately instead of becoming a 503 on every
request an hour later.

The AUD tag is what stops a token minted for a *different* Access application in
the same account from opening this one, so it is not optional decoration.

> The plaintext `Cf-Access-Authenticated-User-Email` header sitting next to the
> JWT is deliberately ignored. `cloudflared` forwards client headers verbatim, so
> anything reaching the app another way — a `curl` at `127.0.0.1:3000`, a second
> tunnel — could set it to anything. Only the signature is evidence. A side
> effect worth knowing: hitting `127.0.0.1:3000` directly no longer yields data.

### 1.5 Adding a person

Zero Trust → **Access → Applications → `tracker.dsteele.net` → Policies** → the
Allow policy → add their address to the **Emails** rule.

That is the whole procedure. They visit the URL, Access authenticates them, and
the app creates their account on the first request. No redeploy, no restart, no
second list to keep in step.

What they get: their own entries, workouts, routines and DDR history, private to
them. What they share: the **exercise catalog** — one list everyone picks from
and can add to, so nobody re-creates "Push-up". Anyone can add or correct an
exercise; only whoever added one can retire it.

Their account starts named after the local part of their address, with a default
icon. Both are theirs to change from the account menu in the top right of any
screen, which is also where they log out.

The free Access tier covers 50 users.

### 1.6 Removing a person

Remove their address from the Emails rule. That takes effect at the edge
immediately and is all that's needed to cut off access.

Their rows stay in the database. To delete them as well — foreign key order
matters, and their contributions to the shared exercise catalog stay behind:

```sql
DELETE FROM exercise_entries WHERE user_id = :id;
DELETE FROM ddr_entries      WHERE user_id = :id;
DELETE FROM workout_sessions WHERE user_id = :id;
DELETE FROM workout_templates WHERE user_id = :id;
UPDATE exercise_types SET created_by = NULL WHERE created_by = :id;
DELETE FROM users WHERE id = :id;
```

Their DDR photos are named after their `ddr_entries.id` values, so collect those
before the first delete if you want to remove the files too.

### 1.7 Notes

- **No ports are opened.** The tunnel is an outbound connection from the server
  to Cloudflare, so the router firewall stays closed and this works behind CGNAT.
- **More subdomains later**: repeat `tunnel route dns` and add another `ingress`
  entry. One tunnel handles many hostnames.
- **Scripted access**: anything non-interactive hitting the hostname gets an
  Access redirect instead of the app. To `curl` it from a script you need an
  Access **service token**. This does not affect the PWA, which authenticates
  through the browser.

---

## 2. Deploy

```bash
git clone <repo> /srv/healthtracker && cd /srv/healthtracker
cp .env.example .env
# Set POSTGRES_PASSWORD at minimum:  openssl rand -base64 32
docker compose up -d --build
```

Compose binds the app to `127.0.0.1:3000` only, so `cloudflared` on the host can
reach it and nothing else on the LAN can. Postgres publishes no ports at all and
is reachable only from inside the compose network.

Migrations run automatically on every container start. Already-applied files are
skipped, so restarts and redeploys are safe.

To update:

```bash
git pull && docker compose up -d --build
```

---

## 3. Backups

Self-hosting means backups are yours. Two scripts handle it.

### 3.1 Nightly dump

```bash
crontab -e
```

```cron
15 3 * * *  cd /srv/healthtracker && scripts/backup.sh >> backups/backup.log 2>&1
```

`scripts/backup.sh`:

- writes a compressed custom-format dump to `./backups/tracker-<timestamp>.dump`
- writes to a `.partial` name first, so an interrupted run never leaves a
  truncated file that later looks like a valid backup
- **verifies** the dump before keeping it: size, archive readability, and the
  presence of table data for every table that holds data (`users`,
  `exercise_types`, `exercise_entries`, `ddr_entries`, `workout_templates`,
  `workout_sessions`). That list lives in both `scripts/backup.sh` and
  `scripts/restore-check.sh` and has to be extended whenever a migration adds a
  table — a backup only verifies what it is told to look for.
- **prunes only after that verification passes**, so a broken run can't delete
  the good backups it was supposed to replace (retention: 30 days,
  `RETENTION_DAYS` to change)

It exits non-zero and logs `ERROR:` on any failure. Check `backups/backup.log`
occasionally, or wire it to whatever alerting you already have.

### 3.2 Prove a backup restores

```bash
scripts/restore-check.sh              # newest backup
scripts/restore-check.sh backups/tracker-20260721T194233Z.dump
```

Restores into a throwaway database inside the Postgres container, compares row
counts against live, and drops it again. Never touches live data.

**Run this after first setting up the cron, and again whenever the schema
changes.** An untested backup is a guess.

### 3.3 Offsite copy

The `./backups` directory lives on the same disk as the database, which means it
does not survive that disk dying. Copy it somewhere else weekly — wherever you
already keep backups:

```cron
30 4 * * 0  rsync -a --delete /srv/healthtracker/backups/ /path/to/offsite/healthtracker/
```

### 3.4 Restoring for real

```bash
docker compose stop app
docker compose exec -T postgres dropdb -U tracker tracker
docker compose exec -T postgres createdb -U tracker tracker
docker compose exec -T postgres pg_restore -U tracker -d tracker --no-owner --no-privileges \
  < backups/tracker-<timestamp>.dump
docker compose start app
```

Devices that still hold local data will push it back on their next sync, and
last-write-wins keeps the newer copy — so restoring an older dump doesn't
silently discard newer entries still sitting on your phone.

### 3.5 The other backup

The in-app **Export JSON** (under Data) is a second, independent path. It runs
entirely on the device against its own copy, so it works with the server down or
the database gone, and **Import** reads it straight back. It includes deletions,
so a restore doesn't resurrect entries you removed.

Worth pulling one occasionally and keeping it with the dumps — different failure
mode, different storage, no shared dependency on Docker or Postgres being intact.

---

## 4. Photo import (OCR)

Set `OCR_PROVIDER` in `.env`. All four implement the same interface, so
switching is a config change and a restart — nothing else moves.

| Provider | Runs | Credential | Notes |
|---|---|---|---|
| `google-vision` (default) | server | `GOOGLE_VISION_API_KEY` | Free tier ~1000 images/month |
| `claude` | server | `ANTHROPIC_API_KEY` | Haiku 4.5; ~$0.003/photo. Returns fields directly |
| `gemini` | server | `GEMINI_API_KEY` | Free tier, rate limited. Returns fields directly |
| `tesseract` | browser | none | Fully offline; weakest on stylized titles |

Leaving all of them unconfigured is valid: the "Fill from photo" button simply
doesn't appear and DDR entry stays manual.

**Google Vision** wants an **API key**, not a service account — create one in the
Google Cloud console and restrict it to the Cloud Vision API.

**Gemini** model IDs change often. If the default 404s, set `GEMINI_MODEL` to a
current one; the request shape is stable across them.

**Tesseract** needs a one-time asset staging step:

```bash
npm run setup:tesseract
```

Without it, tesseract.js fetches its worker, WASM core, and training data from
`cdn.jsdelivr.net` at runtime — which for an app deliberately self-hosted behind
Access means phoning out to a third party, and means "works offline" isn't true
on first use. The script copies the runtime out of `node_modules` and downloads
the 2.8 MB English training data into `public/tesseract/` (gitignored). After
that, OCR runs with no external requests at all.

Re-run it after `npm install` bumps `tesseract.js`.

### How a photo becomes an entry

Text-only providers (Vision, Tesseract) return raw text, which is parsed
locally: the score and difficulty come from regexes, and the song title is
fuzzy-matched against titles already in your history. That matching is why a
plain-OCR provider works at all — a mangled `PARAN0iA` only has to land nearer
`PARANOiA` than anything else you've logged.

The corpus is derived from your DDR entries, which sync, so it arrives with your
data on a new device.

Structured providers (Claude, Gemini) return the five fields directly and skip
the parse step. Their output is still range-checked before it reaches the form.

Nothing is ever saved automatically. The form is pre-filled and shows what it
read — `Matched "PARAN0iA" to PARANOiA (88%)` — so a wrong guess is visible
before you confirm.

### Photo storage

Saving the entry also stores the photo — resized and re-encoded in the browser
(max 1600px edge, JPEG) before it ever leaves the phone, so only the
compressed copy is uploaded or written to disk. The original never reaches the
server.

Upload happens through the same offline-first queue as everything else: the
compressed photo is staged in IndexedDB at save time and uploaded by the sync
engine, so a save made with no signal still succeeds and the photo catches up
once the connection returns. It lands in the `photos` volume
(`PHOTO_DIR`, default `/app/data/photos` in compose) named after the entry's
id, and is served back through `/api/photos/<id>.jpg` — a route handler rather
than a static file, so Access still gates it like everything else. A photo is
only served to the account whose entry it belongs to.

**Profile pictures** share that volume, in `avatars/` beneath it. They are
cropped to a square and scaled to 256px in the browser, and named with a fresh
random id on each upload so a replaced picture can't be served from a cache. The
previous file is deleted when a new one is uploaded or when the account switches
back to a preset icon, so this directory holds at most one file per account.

Back the volume up the same way as `pgdata`; it isn't covered by
`scripts/backup.sh`, which only dumps Postgres. Losing it costs photos and
profile pictures, not entries — the rows in Postgres survive and simply render
without an image.

---

## 5. Generated exercise icons

Adding or editing an exercise offers a **Generate icon** button, which asks
Claude to draw a small pictogram of the movement from its name. Needs
`ANTHROPIC_API_KEY` — the same key the `claude` OCR provider uses, and the only
thing it's gated on. Without it the button doesn't appear and the preset emoji
grid is the whole feature.

`claude-opus-5` by default; override with `CLAUDE_ICON_MODEL`. A deliberately
more expensive model than photo import's Haiku (a fraction of a cent per icon):
drawing something recognisable is where model quality shows, and an icon is
generated once per exercise rather than once per log.

What comes back isn't an image file. It's the *contents* of an
`<svg viewBox="0 0 100 100">` — shape elements only — stored in
`exercise_types.icon_svg` and synced with the row, so the icon reaches every
device the same way the name does and costs nothing to render offline. The
wrapper, the size and the color come from the app, which is why a generated icon
matches the hand-drawn presets instead of looking pasted in.

A type has either a preset icon or a generated one, never both: picking from the
grid drops the drawing, generating one clears the pick. The column has a check
constraint saying so.

**On trusting the output.** Model output is untrusted markup heading for a
column that gets rendered into the page on everyone's device, so it goes through
the whitelist in `lib/icon-svg.ts` — a fixed set of shape elements, a fixed set
of geometry and color attributes, and a value charset with no `:` in it. Both
writers use it: the generation route, and the sync endpoint, which has to assume
a pushed row was hand-crafted. Anything not positively recognised is refused
rather than cleaned up.

---

## 6. Health checks

```bash
docker compose ps                       # both services up, postgres healthy
docker compose logs -f app              # app logs, including migrations on boot
systemctl status cloudflared            # tunnel connected
tail -n 40 backups/backup.log           # last night's backup
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200 from the host
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/me   # 401 from the host
```

`/api/me` returning **401** is the check that the identity gate is on: bypassing
the tunnel means no signed Access token, which means no data. A **503** there
means `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is missing or Cloudflare's
signing keys are unreachable — the app is failing closed, look at the app logs.
A **200** means the gate is off; fix that immediately.

From outside, `https://tracker.dsteele.net` should present the Access login
first. If it serves the app without asking, the Access policy is missing —
fix that immediately.
