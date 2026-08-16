# 001 — Production deployment alongside LeadDesk

Install this app on `194.99.21.120` (the box already serving `leaddesk.cabras.ch`),
reachable at `https://blv.cabras.ch`, with the same **tag-driven, pull-based** deploy
pipeline the LeadDesk and InFaaS repos use: push an annotated `vX.Y.Z` tag, a systemd
timer on the box notices within two minutes, backs up, builds, health-checks, and rolls
back on failure.

Nothing here has been executed. Every step below is ordered, and each numbered step is
one commit (per `CLAUDE.md`).

---

## 0. Brief for whoever executes this

Written so this file is sufficient on its own, with no prior conversation.

**The repo.** `/home/mcabras/Developer/baleinev-backoffice`, branch `main`, remote
`git@github.com:2lazy2debug/baleinev-backoffice.git` — **public**. The npm project is `app/`,
*not* the repo root; the root also holds `docker/`, `docs/`, `soa/`.

**Rules that bind this work.** `CLAUDE.md` at the repo root: no branches, one commit per
completed step (`git add . && git commit -am "…"`), keep `.gitignore` current, and never let
`docs/` diverge from the implementation. Its design-system rules (tokens in
`app/app/globals.css`, `npm run check:design`) apply to any UI touched — here only A3, which
renders nothing.

**Reference implementations.** Two sibling repos already run this exact pipeline in
production. Copy from them rather than inventing:

- `../NurseAsAService/deploy/` — the more refined generation: `self-update.sh`,
  `install-service.sh`, `install-updater.sh`, `approve.sh`, the `*.service.template` and
  `*.timer` files. `../NurseAsAService/install.sh` is the model for A7.
- `../LeadDesk_3.0/deploy/self-update.sh` — its in-script `pg_dump` backup, which this repo
  needs because it has no `npm run backup`.
- Read first: `../NurseAsAService/docs/production.md`, `../LeadDesk_3.0/docs/production.md`,
  `../LeadDesk_3.0/docs/tls-and-certificates.md`.

**Server access.** `ssh -i ~/.ssh/id_ed25519 root@leaddesk.cabras.ch` (`194.99.21.120`).
Become an app user with `sudo -iu leaddesk` / `sudo -iu blv`. LeadDesk is live on that box;
every step below is written to leave it running.

**Local database.** Container `baleicomptes-postgres` on `127.0.0.1:5434`, database
`baleinev_comptes`, user `postgres` —
`docker exec baleicomptes-postgres psql -U postgres -d baleinev_comptes`.

**Secrets.** `app/.env` (gitignored at `app/.gitignore:34`) holds `DATABASE_URL`,
`AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`,
`PASSWORD_VAULT_KEY`. Those exact values are what the server install reuses (B5). **Never
write any of them into a tracked file** — this repo is public, so a credential committed here
is a credential published.

**Order.** A1→A9 locally, one commit each, then B0→B12 on the server. Do not reorder: A9's
tag must exist before B3 clones it, B7's restore depends on B1's dump, and B9's cutover
assumes B6 has the app answering on 3100. Every B step says what "good" looks like — if a
verification fails, stop there. B9 is the only step that interrupts a live service, and it
carries an explicit rollback.

**If reality disagrees with this document, the document is wrong.** Re-survey, correct the
file, and commit that correction as part of the step.

---

## 1. What is actually on the server today

Surveyed over SSH on 2026-08-16 (`ssh -i ~/.ssh/id_ed25519 root@leaddesk.cabras.ch`).

| Fact | Value |
| --- | --- |
| Host | `194.99.21.120`, Ubuntu 24.04, KVM, up 110 days |
| CPU / RAM / swap | 1 vCPU · 1.9 GB RAM (≈1.0 GB available) · 2.4 GB swap |
| Disk | 23 GB total, **18 GB used, 4.0 GB free (82 %)** |
| Node / npm | `v20.20.2` / `10.8.2`, system-wide at `/usr/bin` |
| Docker | present; `/etc/docker/daemon.json` sets `"iptables": false` |
| Firewall | `/usr/local/sbin/leaddesk-firewall.sh` via `docker-egress-nat.service`; rules also in `/etc/iptables/rules.v4` |
| fail2ban | active (`sshd` jail) |
| DNS | `leaddesk.cabras.ch` **and** `blv.cabras.ch` both already resolve to the box |
| `https://blv.cabras.ch` | TLS handshake error — Caddy has no site block for it yet |
| Reclaimable | journal 318 MB · apt cache 377 MB · `/var/log/apache2` 64 MB · `btmp` 19 MB |

### Containers and ports in use

| Port | Owner | Notes |
| --- | --- | --- |
| 80 / 443 (tcp+udp) | `app-caddy-1` | Compose project `app`, workdir `/opt/leaddesk/app`. **The only public listener.** |
| 3000 | `leaddesk.service` (`next start`) | INPUT rules allow loopback + `172.16.0.0/12`, DROP otherwise |
| 5432 | `baleicomptes-postgres` | **This app's legacy DB, and it holds the real accounting data** — compose project `docker`, workdir `/root/baleinev-backoffice/docker`, volume `docker_postgres_data` |
| 5433 | `app-db-1` | LeadDesk's Postgres, loopback only |
| 3306 | `mariadbd` | Unrelated project, loopback only |

### LeadDesk's deployment, which we are copying

- App user `leaddesk` (uid 999, home `/home/leaddesk`, member of `docker`), deploy key at
  `/home/leaddesk/.ssh/id_ed25519` with an `~/.ssh/config` entry for `github.com`.
- Checkout `/opt/leaddesk/app`; `state/` and `backups/` **beside** it in `/opt/leaddesk/`.
- Units: `leaddesk.service`, `leaddesk-updater.{service,timer}` (2 min), `leaddesk-sync.{service,timer}`.
- Live tag `v3.13.6`; `state/` holds `deployed-tag`, `last-deploy.json`, `failed-v3.2.1`, `failed-v3.4.0`.
- Caddy reads a **single-site** `Caddyfile` bind-mounted from `/opt/leaddesk/app/caddy/Caddyfile`
  — i.e. from inside LeadDesk's git checkout, so a LeadDesk deploy overwrites any hand edit.

### The stale half-deployment of *this* app that already exists

- `/root/baleinev-backoffice` — a `git clone` over **HTTPS** on branch `main`, pinned at
  commit `2376807` (**2026-05-07**, ~3 months stale), working tree dirty (`app/package-lock.json`,
  `docker/docker-compose.yml` modified; untracked `app/ecosystem.config.js`, a compose `.bak`).
  It carries `node_modules` and a `.next` build — **1.2 GB of disk**.
- An `ecosystem.config.js` for PM2, but **PM2 is not installed** and nothing listens on any
  app port. The app is not being served, and has not been for months.
- `baleicomptes-postgres` on `127.0.0.1:5432`, database `baleinev_comptes`, user `postgres`,
  9 MB, 22 tables — **and it is not empty.** Exact counts:

  | Table | Rows | | Table | Rows |
  | --- | --- | --- | --- | --- |
  | `JournalEntry` | 214 | | `MoneyAccount` | 2 |
  | `BudgetLine` | 101 | | `User` | 2 |
  | `Department` | 16 | | `DocumentTemplate` | 1 |
  | `DepartmentRole` | 16 | | `Edition` | 1 |
  | `CostCenter` | 10 | | everything else | 0 |

  Its schema predates the Passwords feature — no `PasswordEntry`, no
  `_DepartmentRoleToPasswordEntry`, and no `_prisma_migrations`.

So there **is** production data, and it stays: §5 migrates it into the new database rather
than dropping it. The workstation's dev database is the complement — 1 user, 2 department
roles (`Administration`, `Comptabilité`), 1 template, 1 edition and the **6 password-vault
entries**, all six scoped to `Administration`, and no accounting rows at all. The two halves
get merged on the box.

---

## 2. What this repo is missing

The two reference repos ship a complete deploy surface. This one ships none of it.

| Missing | Consequence |
| --- | --- |
| `deploy/` (self-update, unit templates, timer, approve, installers) | No pipeline at all |
| `install.sh` | No first-time install |
| `/api/health` | The pipeline's health gate has nothing to poll |
| `prisma/migrations/` | The app has only ever used `db push`. **`prisma migrate deploy` fails with no migrations directory** |
| Build-time deps in `devDependencies` | `typescript`, `@types/*`, `tailwindcss`, `@tailwindcss/postcss`, `prisma`, `tsx` are all dev deps — `npm ci --omit=dev` then breaks `next build` |
| `.nvmrc` | Nothing records which Node the app is built against |
| A production `docker-compose.yml` | `docker/docker-compose.yml` is a dev-only DB whose port comes from an untracked `.env` |
| Backup/restore tooling | Nothing to snapshot before a deploy |
| Deployment docs | `docs/` has no `production.md` |

Three structural facts that shape every script below:

1. **The npm project is not the repo root.** The git checkout root holds `app/`, `docker/`,
   `docs/`, `soa/`; the Next project is `<checkout>/app`. So `git checkout tags/<tag>` runs at
   the checkout root while every `npm`/`npx` runs in `app/`.
2. **The app reads `soa/` at runtime.** `app/api/invoices/[invoiceId]/pdf/route.ts` resolves
   `process.cwd()/../soa/qr/blv-logo-noir-render.png`. The checkout must keep `soa/qr/*`, and
   the service's `WorkingDirectory` must be `<checkout>/app` — not a copied-out build.
3. **Uploads live in Postgres** (`ExpenseReport.proofData Bytes?`), so a `pg_dump` is a
   *complete* backup. No blob store, no `BLOB_STORE_PATH` — one less thing than InFaaS needs.

---

## 3. Target architecture

```
/opt/blv/
  checkout/        the git working tree (repo root)
    app/           the Next project — WorkingDirectory for the service and every npm call
    deploy/        the pipeline
  state/           deployed-tag · last-deploy.json · pending-/approved-/failed-<tag>
  backups/         pre-<tag>-<stamp>.zip (pg_dump + .env), mode 700, newest 3 kept

/opt/caddy/        the shared proxy, owned by neither app (§ "The proxy decision")
  docker-compose.yml · Caddyfile · .env · conf.d/{leaddesk,blv}.caddy
```

| Concern | Choice | Why |
| --- | --- | --- |
| App user | `blv` (system user, home `/home/blv`, in `docker` group) | Mirrors `leaddesk`; the docker group is needed for `docker compose exec db pg_dump` |
| App port | **3100** | 3000 is LeadDesk's |
| Postgres host port | **5434**, bound to `127.0.0.1` | 5432 is the legacy container, 5433 is LeadDesk's — and 5434 is already what the workstation uses, so one `DATABASE_URL` shape fits both |
| Compose file | `app/docker-compose.yml`, one `db` service, project pinned `name: blv` | Compose reads `.env` from its own directory, and the app's `.env` is `app/.env`. One directory, one `.env`, one set of `POSTGRES_*` — no duplication. The explicit `name` keeps `app/` from colliding with LeadDesk's `app` project (A5) |
| TLS | Its own `/opt/caddy` compose project | Port 443 can only be held once |
| Service name | `blv` → `blv.service`, `blv-updater.{service,timer}` | |
| Health URL | `http://127.0.0.1:3100/api/health` | Real DB round trip, so it proves Postgres too |
| Node | The box's system `v20.20.2` | Next 16 declares `node >= 20.9.0`, LeadDesk's Next 14 declares `>= 18.17.0`. **20.20.2 satisfies both** — no upgrade, and no second plan needed |

### The proxy decision

Caddy currently reads one file, from inside LeadDesk's checkout, describing one site.

- **Extract Caddy into its own `/opt/caddy` compose project** owned by neither app.
  Architecturally the cleanest, but it means stopping the running proxy and re-attaching the
  `app_caddy_data` volume (which holds the certificates *and* the ACME account key) as an
  external volume. More moving parts for the same outcome.

Two consequences to accept up front:

- **A cutover window of ~10 seconds on 443**, for both hosts, while the old container is
  stopped and the new one starts. Rollback is one command (B9.7) as long as it is needed
  before the LeadDesk repo change ships.
- **The LeadDesk repo must give the proxy up**, or a later `docker compose up -d` in
  `/opt/leaddesk/app` resurrects a second Caddy that cannot bind 443 — and a
  `docker compose down -v` there would delete the certificate volume. That is a LeadDesk
  release (B9.8), and it is what makes the extraction real rather than notional.

`blv.cabras.ch`'s certificate is issued on first request; the Let's Encrypt account email and
the account key are the existing ones, carried over with the volume.

---

## 4. Phase A — repository work (local, before touching the server)

Each step is a commit. Nothing here changes the server.

**A1 — `.gitignore` hygiene.** — **DONE — 2026-08-16 18:34** `soa/.venv` is a committed Python
virtualenv: 844 tracked files. `git rm -r --cached soa/.venv`, add `.venv/` and `**/.venv/` to
`.gitignore`. Keep `soa/qr/*` — the PDF routes read the logo from there at runtime.

**A2 — Baseline the Prisma migrations.** — **DONE — 2026-08-16 18:38** The pipeline runs `prisma migrate deploy`, which
requires `prisma/migrations/`. The app has only ever used `db push`, so generate the baseline
from the schema:

```bash
cd app
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init   # against the workstation database
```

Add `"db:deploy": "prisma migrate deploy"` to `app/package.json`. `0_init` describes the
**current** schema, so it applies as-is to a fresh database. The server's legacy database is
older than that and gets caught up by hand once, in B7 — the standard Prisma baselining
recipe, not a migration this repo carries. From here on, schema changes ship as real
migrations and the tag message says `requires-migration`.

**A3 — Add `/api/health`.** — **DONE — 2026-08-16 18:44** `app/app/api/health/route.ts`: `export const dynamic =
"force-dynamic"`, `SELECT 1` through `prisma.$queryRaw`, `200 {status:"ok"}` or `503`. Must
not require a session — `proxy.ts` currently redirects everything unauthenticated to
`/login`, so add `/api/health` to its early-return list, otherwise the pipeline's health gate
sees a 307 and `curl -f` fails every deploy.

**A4 — Make the build survive `npm ci --omit=dev`.** — **DONE — 2026-08-16 18:56** Move
`typescript`, `@types/*`, `tailwindcss`, `@tailwindcss/postcss`, `prisma`, `tsx` into
`dependencies`; leave `eslint` and `eslint-config-next` in `devDependencies`. Then regenerate
the lockfile **with the server's npm major** and rehearse the production install in a scratch
copy:

```bash
npx npm@10.8.2 install --package-lock-only
npx npm@10.8.2 ci --omit=dev --ignore-scripts   # in a scratch copy
npx prisma generate && npm run build
```

Add `.nvmrc` containing `20`.

**Correction — no `eslint.ignoreDuringBuilds`.** An earlier draft called for it. Next 16
**removed the `eslint` key from `NextConfig`**: `next build` no longer runs eslint at all, so
the key is rejected (`Unrecognized key(s) in object: 'eslint'`) *and* it fails the TypeScript
pass on `next.config.ts` itself — the config that was meant to save the build is the one thing
that breaks it. Nothing is needed: the rehearsal above builds all 26 routes with eslint absent.
That advice applies to Next ≤ 15, which is where the reference repos are.

**A5 — `app/docker-compose.yml`.** — **DONE — 2026-08-16 19:12** One `db` service:
`postgres:16-alpine`, `restart: unless-stopped`, `ports: ["127.0.0.1:5434:5432"]`, `pg_isready`
healthcheck, named volume. Delete `docker/` and point `README`/docs at the new file. Local dev
then runs `docker compose up -d db` from `app/`, on the same port it already uses.

**Correction — the compose project must be named `blv` explicitly.** Compose derives the project
name from the directory, and this file lives in `app/` — which is exactly the project name
LeadDesk already uses on the box (§1: `app-caddy-1`, `app-db-1`, workdir `/opt/leaddesk/app`).
Left to default, `/opt/blv/checkout/app` would claim the container name `app-db-1`, which
LeadDesk's Postgres already holds, and `docker compose exec db` from either directory could
reach the other project's database. `name: blv` at the top of the file gives `blv-db-1` and
`blv_postgres_data` instead. B7's `docker compose exec -T db …` is unaffected — run from
`/opt/blv/checkout/app` it resolves through this file.

Two consequences of the move, handled here rather than left to discover:

- **The volume changes identity.** The old `docker/` project owned `docker_postgres_data`; the
  new one creates `blv_postgres_data`. The workstation's database — including the 6 vault
  entries B7 exports — was carried across with `pg_dump` → `compose down` → `up -d db` →
  restore, and verified: 6 entries, 6 role links, 1 user, 2 roles, `migrate status` clean.
  `docker_postgres_data` is deliberately left in place as a rollback until B12.
- **`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` now live in
  `app/.env`** alongside `DATABASE_URL`, and are documented in `app/.env.example`. They are
  declared with `${VAR:?}` so a missing value fails compose loudly instead of silently
  initialising a database with different credentials than `DATABASE_URL` expects — the §6
  "Postgres never became ready" trap, caught at the right moment.

**A6 — `deploy/`.** — **DONE — 2026-08-16 19:00** Ported from `NurseAsAService/deploy` (the more
refined generation), with LeadDesk's in-script `pg_dump` backup (this repo has no
`npm run backup`, and a shell backup has no dependency on the app building):

| File | Notes |
| --- | --- |
| `self-update.sh` | flock · `git fetch --tags` · highest semver · directive flags · pre-deploy `pg_dump` zip (`BACKUP_KEEP=3`) · `git checkout --detach` at the **checkout root** · `npm ci --omit=dev` + `prisma generate` + optional `migrate deploy` + `npm run build` in **`app/`** · `sudo systemctl restart blv` · health-poll `:3100/api/health` for 90 s · rollback (restoring the dump only if a migration ran) · quarantine `failed-<tag>` · `last-deploy.json`. `main "$@"` stays the **last line** — the script rewrites itself mid-run |
| `blv.service.template` | `WorkingDirectory=<checkout>/app`, absolute pinned node path, `next start -p 3100`, `Restart=always`, `NoNewPrivileges=true` |
| `blv-updater.service.template` | oneshot, `TimeoutStartSec=1800`, **no** `NoNewPrivileges` (it needs sudo), pinned node bin dir on `PATH` |
| `blv-updater.timer` | `OnBootSec=3min`, `OnUnitActiveSec=2min` — offset from LeadDesk's so the two rarely tick together |
| `install-service.sh` | Resolves the absolute node path on the box, refuses to install without `app/.env` and a `.next/BUILD_ID`, `chmod 600 app/.env` |
| `install-updater.sh` | Renders the units, writes `/etc/sudoers.d/blv-deploy` (`systemctl restart blv`, `systemctl status blv` — no wildcard, `visudo -c` first), enables the timer |
| `approve.sh` | Writes `state/approved-<tag>`, warns when no `pending-<tag>` exists |
| `blv-firewall.sh` + `install-firewall.sh` | Same shape as `leaddesk-firewall.sh`, for **3100**: ACCEPT from `127.0.0.1` and `172.16.0.0/12`, DROP the rest; installs `blv-firewall.service` and persists with `iptables-save > /etc/iptables/rules.v4` |
| `blv.caddy` + `install-caddy-site.sh` | The site block, version-controlled here. The installer copies it to `/opt/caddy/conf.d/blv.caddy`, runs `caddy validate`, then `caddy reload` — no container recreate, no downtime |

Path handling in every script: `CHECKOUT_ROOT="$SCRIPT_DIR/.."`, `PROJECT_ROOT="$CHECKOUT_ROOT/app"`,
`STATE_DIR="${BLV_STATE_DIR:-$CHECKOUT_ROOT/../state}"`, same for `backups`. State lives beside
the checkout so a tag checkout cannot touch it.

**What was verified locally, and what was not.** Everything that does not need the server was
exercised against a scratch clone and the workstation's database, not merely written:

- Every non-building path of `self-update.sh` — no tags, lightweight tag, repeat tick,
  `no-deploy`, the `requires-env` halt, `approve.sh`, and the `failed-<tag>` quarantine — each
  producing the right `state/` markers and `last-deploy.json`.
- `make_backup` against the live dev database: the zip carries `dump.sql` + `.env`, the dump
  **restores into a scratch database with all 45 foreign keys and the 6 vault entries intact**,
  a truncated archive is refused, and `BACKUP_KEEP=3` prunes to exactly three.
- Both unit templates render with no placeholder left and pass `systemd-analyze verify`.
- `blv.caddy` passes `caddy validate` inside a two-site config alongside a `leaddesk.cabras.ch`
  block — the arrangement B9 builds.

Not verifiable off the box, so B6/B8/B9 are the first real test of them: `install-service.sh`,
`install-updater.sh`, `install-firewall.sh`, `install-caddy-site.sh`, and the build half of
`build_and_start`.

Three deviations from the table above, each deliberate:

- **`blv-firewall.sh` was written from §1's description of `leaddesk-firewall.sh`, not copied
  from it** — the box was not reachable while A6 was written. The rules are the ones §1
  specifies (ACCEPT `127.0.0.1`, ACCEPT `172.16.0.0/12`, DROP the rest, `-I` so they land at the
  top of INPUT). **At B8, diff it against `/usr/local/sbin/leaddesk-firewall.sh` before running
  it**; if LeadDesk's does something extra, that something is probably load-bearing.
- **`install-caddy-site.sh` validates against a staged temp copy of `/opt/caddy`**, not by
  mounting `/opt/caddy` directly as B9.3 does, so the live directory never holds an unvalidated
  file even for a moment. It then reloads with `docker compose exec caddy caddy reload` — no
  recreate, no downtime, no certificate re-issue.
- **`blv.caddy` sets `Strict-Transport-Security: max-age=31536000`**, which LeadDesk's block does
  not. That is fine and is not a change to LeadDesk: `blv.cabras.ch` is a new host, so nothing is
  being walked back. B9.1's rule that `leaddesk.caddy` reproduce the current block *exactly*
  still stands.

**Two prerequisites this adds to Phase B.** `self-update.sh` shells out to `zip` and `unzip` for
every snapshot, and to `docker compose exec db` for the `pg_dump` itself. So:

- Add `zip unzip` to B4's `apt-get install` line. Without them every deploy fails at the
  snapshot — safely, since nothing is changed before it, but no tag ever lands.
- `blv` must be in the `docker` group before B10, exactly as B2 does it. `install-updater.sh`
  warns when it is not, because the symptom otherwise is a pipeline that backs up nothing and
  deploys nothing.

**A7 — `install.sh`** at the repo root, modelled on `NurseAsAService/install.sh`: — **DONE —
2026-08-16 19:14** Node check against `.nvmrc` → Docker check → `npm ci --omit=dev` in `app/` →
interactive `.env` → create `state/` and `backups/` (mode 700) → `docker compose up -d db` and
wait for `pg_isready` → `prisma generate` → `prisma migrate deploy` → optional `db:seed` →
`npm run build`. It **does not start the app** — `.env` gets read by a human first. Idempotent.

The `.env` prompts generate `AUTH_SECRET` and the Postgres password (percent-encoded into
`DATABASE_URL` on port 5434), default `NEXTAUTH_URL` to `https://blv.cabras.ch`, and — the one
deviation from InFaaS — **offer to paste an existing `PASSWORD_VAULT_KEY` instead of
generating one**, because a generated key makes every imported vault entry permanently
unreadable. Same for `ADMIN_EMAIL` / `ADMIN_PASSWORD`: prompted, never defaulted in code.

Four deviations from the reference installer, each deliberate:

- **It installs neither Node nor Docker**, where `NurseAsAService/install.sh` installs both. On
  a box that is shared with a live app, an nvm Node under `blv` would shadow the system one the
  units pin (§3, decision 6), and installing or restarting the Docker daemon would bounce
  LeadDesk's database. Both are checked and explained instead, which is the half that was ever
  useful here.
- **The pasted `PASSWORD_VAULT_KEY` is validated to decode to exactly 32 bytes**, the same rule
  `app/lib/secret-crypto.ts` enforces at runtime — so a truncated paste is one retry at install
  time rather than a vault that throws on first read months later.
- **`zip`/`unzip` are checked and warned about, not required.** They are the *pipeline's*
  dependency (B4), not this script's; a missing one must not block the install, but it must be
  visible on the day someone can fix it.
- **`POSTGRES_USER` defaults to `blv`**, not `.env.example`'s dev default of `postgres`. The
  legacy dump B7 restores was taken `--no-owner --no-privileges`, so it loads under any user.

Rehearsed end to end three times against a scratch clone and the workstation's database — fresh
`.env`, rewrite-existing (`.env.bak.<stamp>`, mode 600), and keep-existing — each ending in a
complete 26-route production build. The vault-key check rejects a bad paste and accepts a good
one, `migrate deploy` is a clean no-op on an up-to-date database, and `urlencode` walks bytes
under `LC_ALL=C` so a non-ASCII password percent-encodes as UTF-8 rather than one wrong `%XX`.

**A8 — `docs/production.md`.** — **DONE — 2026-08-16 19:20** Server facts, the port map, the tag
vocabulary table, the first-install runbook, the `/opt/caddy` arrangement, and the failure modes
in §6 below. Linked from `docs/overview.md`. Per `CLAUDE.md`, this ships *with* the code, not
after it.

It opens with a **Status** section saying plainly that the repository half is done and the server
half has not run — `/opt/blv` does not exist yet — and points at Phase B here for the one-time
migration. `production.md` is the durable description of how the box works; this plan is the
record of how it got that way, and the two must not be merged.

Two corrections to `docs/overview.md` made in the same commit, because the link went there and
the surrounding text was wrong: its root-layout tree showed `docs/` *inside* `app/` and omitted
`deploy/`, `soa/` and `install.sh` entirely, which is exactly the "the npm project is not the
repo root" confusion §2 warns about. It now says so in one line above the tree, and a short
"where to look next" list points at the other docs.

**A9 — Tag `v0.1.0`** (annotated, message `non-breaking`) and push. This is what the box
installs first. — **NOT DONE — the only Phase A step still open.** `main` is 17 commits ahead
of `origin/main` and carries no tags; both the tag and the push have to be run by hand:

```bash
git tag -a v0.1.0 -m "non-breaking"
git push origin main
git push origin v0.1.0
```

The message matters as much as the tag: `self-update.sh` reads it as the directive, and a
**lightweight** tag (`git tag v0.1.0`, no `-m`) carries no message at all — the pipeline
records it as seen and deploys nothing. `-a` is not optional.

Pushing `main` is not incidental to the tag. B3 clones from GitHub over HTTPS, so everything
A1–A8 added exists on the box only once `origin/main` has it. Nothing in the 17 commits is a
credential — `app/.env` is gitignored and the only tracked env file is `app/.env.example`,
whose values are placeholders — but the repo is public, so it is worth confirming that once
more before the first push in three months.

Phase A ends here; there is no A10.

---

## 5. Phase B — server install, in order

Run as `root@leaddesk.cabras.ch` unless stated. Every step is verifiable before the next.

**B0 — Purge logs and caches.** Nothing on this box older than a week is worth keeping, and
this is the cheapest disk on offer:

```bash
journalctl --disk-usage                       # 318 MB before
journalctl --vacuum-time=7d
apt-get clean                                 # 377 MB of /var/cache/apt
apt-get autoremove --purge -y                 # 3 kernels installed (/boot is its own 2 GB fs)
rm -f /var/log/apache2/*.gz /var/log/apache2/*.[0-9]   # 64 MB, a dead project's rotated logs
find /var/log -type f \( -name '*.gz' -o -name '*.[0-9]' \) -mtime +7 -delete
truncate -s 0 /var/log/btmp /var/log/wtmp     # 19 MB, almost all failed SSH logins
```

Then cap it permanently — `/etc/systemd/journald.conf.d/99-cap.conf`:

```ini
[Journal]
SystemMaxUse=200M
MaxRetentionSec=1week
```

`systemctl restart systemd-journald` (safe — it touches no container). Expect ~750 MB back.

**Deliberately not done: Docker's `log-opts`.** All three container logs together are under
1 MB, and setting them in `daemon.json` needs a Docker daemon restart, which takes down every
container on the box — including LeadDesk's database — to fix a problem that does not exist.
Revisit only if `docker inspect --format '{{.LogPath}}'` ever shows real growth.

**B1 — Snapshot the legacy database and reclaim the stale build.** The dump is the safety net
for everything in B7, so verify it before deleting anything:

```bash
docker exec baleicomptes-postgres pg_dump -U postgres -d baleinev_comptes \
  --clean --if-exists --no-owner --no-privileges > /root/blv-legacy-2026-08-16.sql
grep -c 'PostgreSQL database dump complete' /root/blv-legacy-2026-08-16.sql   # must print 1
grep -c 'INSERT INTO\|COPY public' /root/blv-legacy-2026-08-16.sql            # must be > 0

rm -rf /root/baleinev-backoffice/app/node_modules /root/baleinev-backoffice/app/.next  # ~1.1 GB
ls -1t /opt/leaddesk/backups/*.zip | tail -n +4 | xargs -r rm -f    # keep newest 3 of 2.2 GB
docker image prune -f
df -h /                                        # target: >= 6 GB free before B5
```

The container, its volume and the checkout's git metadata stay until B12 — they are the
rollback for the data migration.

**B2 — Create the app user and layout.**

```bash
useradd --system --create-home --home-dir /home/blv --shell /bin/bash blv
usermod -aG docker blv
mkdir -p /opt/blv/{checkout,state,backups}
chown -R blv:blv /opt/blv
chmod 700 /opt/blv/state /opt/blv/backups
```

**B3 — Clone.** The GitHub repo answers anonymous `ls-remote`, so it is public and HTTPS needs
no key: `sudo -iu blv git clone https://github.com/2lazy2debug/baleinev-backoffice.git
/opt/blv/checkout`, then `git checkout tags/v0.1.0`. (If it is ever made private, add a deploy
key at `/home/blv/.ssh/id_ed25519` and switch the remote to SSH, exactly as `leaddesk` has.)

**B4 — Chromium's system libraries, as root, before the first `npm ci`.** `puppeteer` is a
runtime dependency of both PDF routes; its postinstall downloads a browser into
`/home/blv/.cache/puppeteer` (persisted across deploys), but the shared objects it links
against are not installed by npm:

```bash
apt-get update && apt-get install -y libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 \
  zip unzip
```

Skipping the Chromium libraries does not fail the install — it fails the first invoice PDF,
months later, with a missing-`.so` error nobody connects to deploy day. `zip`/`unzip` are the
pipeline's own dependency: `self-update.sh` writes and reads its snapshots with them, and
without them every deploy stops at the backup.

**B5 — `./install.sh` as `blv`**, from `/opt/blv/checkout`. Three values are **copied from the
workstation's `app/.env`, not generated**, because generating them breaks something later:

| Prompt | Value | If generated instead |
| --- | --- | --- |
| `PASSWORD_VAULT_KEY` | the workstation's | every imported vault entry is permanently undecryptable |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | the workstation's (`presidence@baleinev.ch`) | the president cannot sign in with the credentials they already have |

`AUTH_SECRET` and the Postgres password *are* generated fresh — nothing carries over that
depends on them. **Skip the seed at this point** (B7 restores the real users first, and
seeding before that only creates a row to reconcile). Then read `app/.env` before continuing.

**B6 — Service.** `./deploy/install-service.sh` (starts `blv.service` on 3100).
Verify: `curl -fsS http://127.0.0.1:3100/api/health`.

**B7 — Migrate the data.** The new database is empty and on the current schema; the legacy one
has the accounting rows and an older schema. Standard Prisma baselining, as `blv`, from
`/opt/blv/checkout/app` with `DATABASE_URL` loaded from `.env`:

```bash
# 1. Start from the legacy schema + data, not from the fresh one
docker compose exec -T db psql -U "$PGUSER" -d "$PGDATABASE" \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec -T db psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
  < /root/blv-legacy-2026-08-16.sql

# 2. Catch it up to the current schema — additive only: PasswordEntry,
#    _DepartmentRoleToPasswordEntry, their indexes and FKs. READ IT before applying.
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > /tmp/catchup.sql
docker compose exec -T db psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < /tmp/catchup.sql

# 3. Record the baseline, then prove the schema and the ledger agree
npx prisma migrate resolve --applied 0_init
npx prisma migrate status          # "Database schema is up to date"
```

Verify the counts survived: `JournalEntry` 214, `BudgetLine` 101, `Department` 16,
`DepartmentRole` 16, `CostCenter` 10, `MoneyAccount` 2, `User` 2, `DocumentTemplate` 1,
`Edition` 1.

Then the 6 vault entries, from the workstation. Two columns cannot travel as-is:

- **`PasswordEntry.createdById`** points at a workstation user id that does not exist on the
  server. The column is nullable (`onDelete: SetNull`), so it is exported as NULL.
- **Department scoping** lives in `_DepartmentRoleToPasswordEntry` as ids, and the ids differ
  on the two sides. It maps by **name** instead, which is safe because `DepartmentRole.name`
  is `@unique`. All six entries are scoped to the single role `Administration`, which exists
  on the server as `ADMINISTRATION` — same role, different casing, so the match is
  case-insensitive.

```bash
# workstation — COPY … TO STDOUT, *not* \copy: \copy would write the file inside the
# container (psql is the client there), where scp cannot see it.
docker exec baleicomptes-postgres psql -U postgres -d baleinev_comptes -c \
 "COPY (select id,name,login,website,\"passwordCipher\",\"passwordIv\",\"passwordTag\",
         \"totpCipher\",\"totpIv\",\"totpTag\",null::text,\"createdAt\",\"updatedAt\"
    from \"PasswordEntry\") TO STDOUT WITH CSV" > vault-entries.csv

docker exec baleicomptes-postgres psql -U postgres -d baleinev_comptes -c \
 "COPY (select j.\"B\", r.name from \"_DepartmentRoleToPasswordEntry\" j
          join \"DepartmentRole\" r on r.id = j.\"A\") TO STDOUT WITH CSV" > vault-roles.csv

scp -i ~/.ssh/id_ed25519 vault-entries.csv vault-roles.csv root@leaddesk.cabras.ch:/tmp/
```

On the server the CSVs must be *inside* the `db` container for `\copy`, and the whole import
is one psql session — the temp table does not survive a second one:

```bash
docker compose cp /tmp/vault-entries.csv db:/tmp/
docker compose cp /tmp/vault-roles.csv   db:/tmp/
docker compose exec -T db psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 <<'SQL'
begin;
\copy "PasswordEntry"(id,name,login,website,"passwordCipher","passwordIv","passwordTag","totpCipher","totpIv","totpTag","createdById","createdAt","updatedAt") from '/tmp/vault-entries.csv' csv

create temp table vault_link(entry_id text, role_name text);
\copy vault_link from '/tmp/vault-roles.csv' csv

-- Refuse the whole import rather than silently drop a scoping we cannot resolve.
do $$
declare missing text;
begin
  select string_agg(distinct v.role_name, ', ') into missing
    from vault_link v
    left join "DepartmentRole" r on upper(r.name) = upper(v.role_name)
   where r.id is null;
  if missing is not null then
    raise exception 'no DepartmentRole matches: %', missing;
  end if;
end $$;

insert into "_DepartmentRoleToPasswordEntry"("A","B")
select r.id, v.entry_id
  from vault_link v
  join "DepartmentRole" r on upper(r.name) = upper(v.role_name);
commit;
SQL
```

Expect 6 entries and 6 links, all to `ADMINISTRATION`. The `begin`/`commit` plus
`ON_ERROR_STOP=1` make it atomic: a name that does not resolve aborts before anything is
inserted, so the fix-and-retry is clean.

Confirm in the UI that a password decrypts — that is the only real proof the
`PASSWORD_VAULT_KEY` was carried over correctly. If it does not, the key is wrong; fix `.env`
and restart rather than re-importing.

Finally, the admin account. `install.sh` wrote the workstation's `ADMIN_EMAIL`
(`presidence@baleinev.ch`), `ADMIN_NAME` and `ADMIN_PASSWORD` into `app/.env` at B5, and
`prisma/seed.ts` **upserts by email**, so running it over the restored data is additive:

```bash
npm run db:seed
sudo systemctl restart blv
```

The legacy database already carries `compta@baleinev.ch` (ADMIN) and one DEPARTMENT user; the
seed adds the président as a third and leaves both untouched.

**B8 — Firewall.** `sudo ./deploy/install-firewall.sh`. Verify from the workstation that
`nc -vz 194.99.21.120 3100` times out.

**B9 — Extract Caddy into `/opt/caddy`.** Build the whole thing before touching the running
proxy; the only irreversible-feeling moment is step 5, and step 7 undoes it.

1. Lay it out as root:

   ```
   /opt/caddy/
     docker-compose.yml     name: caddy
     Caddyfile              { email {$ACME_EMAIL} }  +  import /etc/caddy/conf.d/*.caddy
     .env                   ACME_EMAIL=<copied from /opt/leaddesk/app/.env>
     conf.d/leaddesk.caddy  leaddesk.cabras.ch -> host.docker.internal:3000
     conf.d/blv.caddy       blv.cabras.ch      -> host.docker.internal:3100
   ```

   `leaddesk.caddy` reproduces the current block **exactly** (`encode zstd gzip` +
   `reverse_proxy`, nothing more) — the cutover must not quietly change LeadDesk's behaviour.
   `blv.caddy` is the copy installed by `deploy/install-caddy-site.sh`.

2. Reuse the certificates. The volumes are declared external so nothing is re-issued and the
   ACME account key survives:

   ```yaml
   volumes:
     caddy_data:   { external: true, name: app_caddy_data }
     caddy_config: { external: true, name: app_caddy_config }
   ```

3. Validate offline, while the old proxy is still serving:
   `docker run --rm -e ACME_EMAIL=<email> -v /opt/caddy:/etc/caddy caddy:2-alpine \
   caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`
4. Keep the rollback in reach: `cp /opt/leaddesk/app/caddy/Caddyfile /root/Caddyfile.bak`.
5. Cut over — `cd /opt/leaddesk/app && docker compose stop caddy && docker compose rm -f caddy`,
   then `cd /opt/caddy && docker compose up -d`. **`stop caddy`, never `down`** — `down` would
   take LeadDesk's database with it.
6. Verify **both** hosts: `curl -sI https://leaddesk.cabras.ch` and
   `curl -sI https://blv.cabras.ch` (fresh certificate, issued on the first request).
7. Rollback, if either fails: `cd /opt/caddy && docker compose down`, then
   `cd /opt/leaddesk/app && docker compose up -d caddy`. Back to the old proxy in seconds.
8. Only once it is verified, ship the LeadDesk repo change: delete the `caddy` service and the
   `caddy_data`/`caddy_config` volume declarations from its `docker-compose.yml`, delete
   `caddy/Caddyfile`, and update `install.sh`, `docs/production.md` and
   `docs/tls-and-certificates.md` to point at `/opt/caddy`. Tag it `non-breaking` — the
   pipeline never runs `docker compose`, so this deploys without touching the proxy.

**B10 — The updater.**

```bash
sudo -iu blv && cd /opt/blv/checkout
./deploy/install-updater.sh
git describe --tags --exact-match > /opt/blv/state/deployed-tag   # NOT optional
```

Without that last line the first tick sees no `deployed-tag`, treats `v0.1.0` as new, and
redeploys what is already running.

**B11 — Verification checklist.**

- `systemctl status blv` active; `systemctl list-timers blv-updater.timer` scheduled.
- `https://blv.cabras.ch` shows the login page over a valid certificate; `presidence@baleinev.ch`
  can sign in, the journal shows 214 entries, and a vault password decrypts and shows its
  `ADMINISTRATION` scoping.
- `https://leaddesk.cabras.ch` still 200 — the proxy move touched both.
- External `:3100` times out; `:5434` is unreachable from outside.
- Push `v0.1.1` (`non-breaking`) and watch it land within ~2 minutes:
  `journalctl -u blv-updater.service -f`, then `cat /opt/blv/state/last-deploy.json`.
- Reboot once, while nobody depends on it: `blv`, `blv-updater.timer`, both databases, the new
  Caddy project and both firewall units must all come back.

**B12 — Retire the legacy deployment.** Only after B11 passes end to end:

```bash
docker compose -f /root/baleinev-backoffice/docker/docker-compose.yml down
rm -rf /root/baleinev-backoffice
docker volume rm docker_postgres_data
```

Keep `/root/blv-legacy-2026-08-16.sql` until the app has been used in anger for a week, then
delete it — it contains the whole ledger in plaintext.

---

## 6. Failure modes to design against

Each is here because the symptom does not name the cause.

- **Disk is the binding constraint, and it is the *only* resource one that is.** 4.0 GB free
  before B0/B1, which together return ~3 GB. Every deploy then writes a snapshot and rebuilds
  `.next`. `BACKUP_KEEP=3`, the journal cap from B0, and a `df -h` after the first pipeline
  deploy are the whole discipline.
- **RAM is fine for serving and tight only for building.** Five concurrent users on this app
  and one on LeadDesk is nothing for two idle `next start` processes; the pressure is entirely
  in `next build` on 1 vCPU with ~1.0 GB free plus 2.4 GB swap. A single build swaps and
  finishes; two at once will OOM. Both timers only build when a *new tag* exists, so that
  needs both repos tagged within the same two minutes — the 3-minute `OnBootSec` offset covers
  the boot case, and if it ever actually bites, a shared `flock /var/lock/nextjs-build.lock` in
  both `self-update.sh` scripts removes it for good.
- **`npm ci` uses the server's npm, not yours.** A lockfile written by a newer npm can dedupe a
  transitive dependency in a way npm 10.8.2 rejects; the build then dies with a confusing
  `Cannot find package`. Regenerate the lockfile with `npm@10.8.2` after every dependency change.
- **`next build` must not need a devDependency** — the whole point of A4. `install.sh` installs
  `--omit=dev` deliberately, so the trap springs on a machine someone is watching.
- **A migration is not undone by a checkout.** The pipeline restores the pre-deploy dump when a
  migration ran, but a destructive migration must still be split across two releases (additive
  first, drop later). No pipeline can enforce that.
- **The catch-up in B7 must be additive.** Read `/tmp/catchup.sql` before applying it. A `DROP`
  or an `ALTER … TYPE` in there means the legacy schema diverged in a way that costs data, and
  the answer is to fix the diff by hand, not to run it and see.
- **A Postgres volume keeps its original credentials.** `POSTGRES_*` only initialise an *empty*
  volume. Pointing a fresh `.env` at a pre-existing volume fails as "Postgres never became
  ready", never as an auth error.
- **Re-run both installers after any Node upgrade.** The units pin an absolute node path; an
  upgrade moves it and the service fails with "no such file".
- **One Caddy, two sites, one config.** A parse error takes down both hosts. Validate offline
  (B9.3) before every reload, and keep `/root/Caddyfile.bak` until the extraction has survived
  a reboot.
- **`docker daemon.json` has `"iptables": false`.** Containers only have outbound NAT because
  of the one persisted masquerade rule. Do not "fix" the flag — it would restart every
  container on a shared host.

---

## 7. Decisions on record

No open questions remain. Each of these is already implemented in the steps above; they are
listed here so a later reader knows which choices were deliberate.

| # | Decision | Where it lives |
| --- | --- | --- |
| 1 | The server's legacy database **holds the real accounting data and is kept**, not dropped. The workstation contributes only the password vault. | §1, B1, B7 |
| 2 | Admin account = the workstation's `ADMIN_*` values (`presidence@baleinev.ch`), carried over at install and applied with `npm run db:seed`. | B5, B7 |
| 3 | Vault department scoping maps by **role name, case-insensitively** (`Administration` → `ADMINISTRATION`), and the import aborts on any name it cannot resolve. | B7 |
| 4 | `PASSWORD_VAULT_KEY` is **copied, never generated** — a new key makes every imported entry undecryptable. | B5 |
| 5 | Caddy is **extracted into its own `/opt/caddy` project** owned by neither app. | §3, B9 |
| 6 | **No Node change.** Next 16 declares `node >= 20.9.0`, LeadDesk's Next 14 `>= 18.17.0`, the box runs 20.20.2 — both satisfied, so no compatibility plan is needed. | §3 |
| 7 | **No bigger VPS.** Disk is managed by B0's purge, the journal cap and `BACKUP_KEEP=3`. | B0, §6 |
| 8 | Backups keep the **newest 3**, on-box only. A disk failure loses both projects' backups; accepted. | A6, B1 |
| 9 | **No scheduled jobs**, and tags are cut **from this workstation only** — no CI. | — |
| 10 | Importing `soa/compta_2025-2026.xlsx` through the workbook scripts is **deferred**, out of scope here. | — |

**One security note, deliberately kept.** An earlier draft of this file carried the admin
password in plaintext. It was removed before any commit — `git log --all -S` confirms it never
entered history — but it did exist in the working tree of a **public** repository. Credentials
belong in `app/.env` (gitignored) and nowhere else in this repo; rotating that one password at
some point is cheap insurance.
