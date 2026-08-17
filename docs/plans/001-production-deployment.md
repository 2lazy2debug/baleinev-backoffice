# 001 — Production deployment alongside LeadDesk

Install this app on `194.99.21.120` (the box already serving `leaddesk.cabras.ch`),
reachable at `https://blv.cabras.ch`, with the same **tag-driven, pull-based** deploy
pipeline the LeadDesk and InFaaS repos use: push an annotated `vX.Y.Z` tag, a systemd
timer on the box notices within two minutes, backs up, builds, health-checks, and rolls
back on failure.

**Phase A is done** and `v0.1.1` is on `origin`. **Phase B is in progress** — B1–B5 are done,
B0 has not been run, B6 is next. Every step below is ordered, and each numbered step is one
commit (per `CLAUDE.md`).

**Keep output minimal.** Briefly mention what changed and what is blocked, in a few lines. Do not narrate
steps, restate what this file already says, or summarise work back at the reader.

---

## 0. Brief for whoever executes this

Written so this file is sufficient on its own, with no prior conversation.

**The repo.** `/home/mcabras/Developer/baleinev-backoffice`, branch `main`, remote
`git@github.com:2lazy2debug/baleinev-backoffice.git` — **public**. The npm project is `app/`,
*not* the repo root; the root also holds `deploy/`, `docs/`, `soa/` and `install.sh`.

**Rules that bind this work.** `CLAUDE.md` at the repo root: no branches, one commit per
completed step (`git add . && git commit -am "…"`), keep `.gitignore` current, and never let
`docs/` diverge from the implementation. Its design-system rules (tokens in
`app/app/globals.css`, `npm run check:design`) apply to any UI touched — here only A3, which
renders nothing.

**Sibling repos on this workstation.** `../LeadDesk_3.0` is the app already live on the box —
read its `docs/production.md` and `docs/tls-and-certificates.md` before B9, since the Caddy
extraction changes what they describe. `../NurseAsAService` runs the same pipeline this repo's
`deploy/` was ported from.

**Server access.** `ssh -i ~/.ssh/id_ed25519 root@leaddesk.cabras.ch` (`194.99.21.120`).
Become an app user with `sudo -iu leaddesk` / `sudo -iu blv`. LeadDesk is live on that box;
every step below is written to leave it running.

**Workstation database.** Container `blv-db-1` (compose project `blv`) on `127.0.0.1:5434`,
database `baleinev_comptes`, user `postgres`. Reach it with `docker compose exec db psql -U
postgres -d baleinev_comptes` from `app/`. It holds the 6 password-vault entries B7 exports.
Not to be confused with `baleicomptes-postgres`, which is the **server's** legacy container.

**Secrets.** `app/.env` (gitignored at `app/.gitignore:34`) holds `DATABASE_URL`,
`AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`,
`PASSWORD_VAULT_KEY`. Those exact values are what the server install reuses (B5). **Never
write any of them into a tracked file** — this repo is public, so a credential committed here
is a credential published.

**Order.** B0→B12 on the server, in order. Do not reorder: B7's restore depends on B1's dump,
and B9's cutover assumes B6 has the app answering on 3100. Every B step says what "good" looks
like — if a verification fails, stop there. B9 is the only step that interrupts a live service,
and it carries an explicit rollback.

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

## 2. Three structural facts

They shape every script and every step below.

1. **The npm project is not the repo root.** The git checkout root holds `app/`, `deploy/`,
   `docs/`, `soa/`; the Next project is `<checkout>/app`. So `git checkout tags/<tag>` runs at
   the checkout root while every `npm`, `npx` and `docker compose` runs in `app/`.
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

Caddy today reads one file describing one site, from inside LeadDesk's checkout. B9 extracts it
into `/opt/caddy`, owned by neither app, re-attaching `app_caddy_data` (the certificates *and*
the ACME account key) as an external volume. Two consequences to accept up front:

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

## 4. Phase A — repository work — **DONE**

Committed and pushed; `v0.1.0` (annotated, `non-breaking`) is on `origin`. This is what exists
now, and only what Phase B depends on.

| # | What exists |
| --- | --- |
| A1 | `soa/.venv` untracked, `.venv/` in `.gitignore`. `soa/qr/*` stays tracked — the PDF routes read the logo from there at runtime. |
| A2 | `app/prisma/migrations/0_init`, generated from the schema, so it applies as-is to a **fresh** database. `npm run db:deploy` = `prisma migrate deploy`. The server's legacy database is older and is baselined by hand once, in B7. |
| A3 | `app/app/api/health/route.ts` — `SELECT 1` through Prisma, `200 {status:"ok"}` or `503`, `force-dynamic`. Sessionless: `/api/health` is in `proxy.ts`'s early-return list, so the health gate sees 200 and not a 307 to `/login`. |
| A4 | `typescript`, `@types/*`, `tailwindcss`, `@tailwindcss/postcss`, `prisma`, `tsx` are in `dependencies` so `npm ci --omit=dev` still builds; only `eslint` and `eslint-config-next` are dev deps. Lockfile regenerated with npm 10.8.2, the server's major. `.nvmrc` = `20`. **Next 16 has no `eslint` key in `NextConfig`** — adding one fails the build it was meant to save. |
| A5 | `app/docker-compose.yml`: one `db` service, `postgres:16-alpine`, `127.0.0.1:5434`, `pg_isready` healthcheck, project pinned `name: blv` so the containers are `blv-db-1` / `blv_postgres_data` and never collide with LeadDesk's `app` project. `POSTGRES_{USER,PASSWORD,DB,PORT}` live in `app/.env` beside `DATABASE_URL`, declared `${VAR:?}` so a missing one fails compose loudly. `docker/` is gone. |
| A6 | `deploy/` — the pipeline, below. |
| A7 | `install.sh` at the checkout root: preflight → `npm ci --omit=dev` in `app/` → interactive `app/.env` → `state/` and `backups/` (700) → `docker compose up -d db` → `prisma generate` → `migrate deploy` → optional seed → `npm run build`. Idempotent, and it **does not start the app**. It installs neither Node nor Docker on purpose: a per-user Node would shadow the one the units pin, and a daemon restart would bounce LeadDesk's containers. |
| A8 | `docs/production.md` — the durable description of the box, linked from `docs/overview.md`. This plan is the one-time migration; the two are not merged. |
| A9 | `v0.1.0` on `origin`, and `origin/main` carries A1–A8. B3 clones from there. |

### `deploy/`

| File | What it does |
| --- | --- |
| `self-update.sh` | flock · `git fetch --tags` · highest semver · directive flags · pre-deploy `pg_dump` zip (`BACKUP_KEEP=3`) · `git checkout --detach` at the **checkout root** · `npm ci --omit=dev` + `prisma generate` + optional `migrate deploy` + `npm run build` in **`app/`** · `sudo systemctl restart blv` · health-poll `:3100/api/health` for 90 s · rollback (restoring the dump only if a migration ran) · quarantine `failed-<tag>` · `last-deploy.json`. `main "$@"` is the **last line** — the script rewrites itself mid-run |
| `blv.service.template` | `WorkingDirectory=<checkout>/app`, absolute pinned node path, `next start -p 3100`, `Restart=always`, `NoNewPrivileges=true` |
| `blv-updater.service.template` | oneshot, `TimeoutStartSec=1800`, **no** `NoNewPrivileges` (it needs sudo), pinned node bin dir on `PATH` |
| `blv-updater.timer` | `OnBootSec=3min`, `OnUnitActiveSec=2min` — offset from LeadDesk's so the two rarely tick together |
| `install-service.sh` | Resolves the absolute node path on the box, refuses to install without `app/.env` and a `.next/BUILD_ID`, `chmod 600 app/.env` |
| `install-updater.sh` | Renders the units, writes `/etc/sudoers.d/blv-deploy` (`systemctl restart blv`, `systemctl status blv` — no wildcard, `visudo -c` first), enables the timer |
| `approve.sh` | Writes `state/approved-<tag>`, warns when no `pending-<tag>` exists |
| `blv-firewall.sh` + `install-firewall.sh` | For **3100**: ACCEPT from `127.0.0.1` and `172.16.0.0/12`, DROP the rest; installs `blv-firewall.service` and persists with `iptables-save > /etc/iptables/rules.v4` |
| `blv.caddy` + `install-caddy-site.sh` | The site block. The installer stages it into a temp copy of `/opt/caddy`, runs `caddy validate` on the whole config, then copies it in and `caddy reload`s — no recreate, no downtime |

Paths in every script: `CHECKOUT_ROOT="$SCRIPT_DIR/.."`, `PROJECT_ROOT="$CHECKOUT_ROOT/app"`,
`STATE_DIR="${BLV_STATE_DIR:-$CHECKOUT_ROOT/../state}"`, same for `backups`.

**Never exercised off the box, so B6/B8/B9 are their first real test:** `install-service.sh`,
`install-updater.sh`, `install-firewall.sh`, `install-caddy-site.sh`, and the build half of
`self-update.sh`'s `build_and_start`. Everything else — every non-building path of
`self-update.sh`, `make_backup` and its restore, both unit templates under
`systemd-analyze verify`, `blv.caddy` under `caddy validate` in a two-site config, and all three
`install.sh` paths ending in a full build — was verified against a scratch clone and the
workstation's database.

---

## 5. Phase B — server install, in order

Run as `root@leaddesk.cabras.ch` unless stated. Every step is verifiable before the next.


**B0 — Purge logs and caches.** Nothing on this box older than a week is worth keeping, and
this is the cheapest disk on offer. Please also uninstall pm2 from node : 

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

**B1 — Snapshot the legacy database and reclaim the stale build — DONE 2026-08-16.**
`/root/blv-legacy-2026-08-16.sql` is 137 KB, 22 `CREATE TABLE` + 22 `COPY public` blocks, one
completion marker. Disk went 4.0 GB → **6.0 GB free** (node_modules 962 MB + `.next` 188 MB +
two LeadDesk backups ~900 MB); `docker image prune` reclaimed nothing — both images are in use.
The dump is the safety net for everything in B7, so verify it before deleting anything:

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

**B2 — Create the app user and layout — DONE 2026-08-16.** `blv` is uid 996, gid 988, in
`docker` (990); `/opt/blv/{checkout,state,backups}` are `blv:blv`, `state` and `backups` 700.

```bash
useradd --system --create-home --home-dir /home/blv --shell /bin/bash blv
usermod -aG docker blv
mkdir -p /opt/blv/{checkout,state,backups}
chown -R blv:blv /opt/blv
chmod 700 /opt/blv/state /opt/blv/backups
```

**B3 — Clone — DONE 2026-08-16.** `/opt/blv/checkout` is detached at `v0.1.0` (`ab4bb45`),
clean, `blv`-owned, `soa/qr/blv-logo-noir-render.png` present. (B6 moved it on to `v0.1.1`,
which changes `deploy/` only — no rebuild.)
The GitHub repo answers anonymous `ls-remote`, so it is public and HTTPS needs
no key: `sudo -iu blv git clone https://github.com/2lazy2debug/baleinev-backoffice.git
/opt/blv/checkout`, then `git checkout tags/v0.1.0`. (If it is ever made private, add a deploy
key at `/home/blv/.ssh/id_ed25519` and switch the remote to SSH, exactly as `leaddesk` has.)

**B4 — Chromium's system libraries, as root, before the first `npm ci` — DONE 2026-08-16.**
On Ubuntu 24.04 three of these are `Provides` of the time_t transition packages, so apt
installs `libatk-bridge2.0-0t64`, `libatk1.0-0t64` and `libcups2t64` — `dpkg -l libcups2`
reporting *not-installed* afterwards is expected, not a failure. `puppeteer` is a
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

**B5 — `./install.sh` as `blv` — DONE 2026-08-16.** `app/.env` is mode 600 `blv:blv`;
`PASSWORD_VAULT_KEY` and `ADMIN_PASSWORD` hash identically to the workstation's, `ADMIN_EMAIL`
is `presidence@baleinev.ch`, `DATABASE_URL` points at `blv@127.0.0.1:5434/baleinev_comptes`.
`blv-db-1` is healthy, `0_init` applied ("Database schema is up to date"), 0 users — the seed
was skipped as intended — and `.next/BUILD_ID` exists. **Disk is back to 4.1 GB free**: `npm ci`
and the build cost ~1.3 GB and puppeteer's Chromium another 628 MB in `/home/blv/.cache`. B0 was
never run, so its ~750 MB is still on the table and should be reclaimed before B11's test deploy.
**By 2026-08-17 it had drifted down to 3.4 GB free with nothing deployed** — B0 is no longer
optional, and `install-updater.sh` warns below 3 GB.

From `/opt/blv/checkout`, three values are **copied from the workstation's `app/.env`, not
generated**, because generating them breaks something later:

| Prompt | Value | If generated instead |
| --- | --- | --- |
| `PASSWORD_VAULT_KEY` | the workstation's | every imported vault entry is permanently undecryptable |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | the workstation's (`presidence@baleinev.ch`) | the president cannot sign in with the credentials they already have |

`AUTH_SECRET` and the Postgres password *are* generated fresh — nothing carries over that
depends on them. **Skip the seed at this point** (B7 restores the real users first, and
seeding before that only creates a row to reconcile). Then read `app/.env` before continuing.

**B6 — Service — DONE 2026-08-17.** `blv.service` is enabled and active, `User=blv`,
`WorkingDirectory=/opt/blv/checkout/app`, `node=/usr/bin/node`, port 3100;
`curl http://127.0.0.1:3100/api/health` returns `200 {"status":"ok"}` — so Prisma reaches
`blv-db-1` too. As **root**, `/opt/blv/checkout/deploy/install-service.sh`.

Both installers used to render the unit for `${SUDO_USER:-$(id -un)}`, i.e. for the caller.
`blv` is a system account with **no sudo rights**, so on this box the caller can only be root —
and the unit would have been written `User=root`, running the app as root over `blv`'s 600-mode
`.env`. They now take the run user from the **owner of the checkout** (`BLV_RUN_USER` overrides),
which is right however they are invoked. That fix is `v0.1.1`, and B6 starts by moving the
checkout to it:

```bash
sudo -u blv git -C /opt/blv/checkout fetch --tags origin
sudo -u blv git -C /opt/blv/checkout checkout --detach tags/v0.1.1
```

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
# workstation, from app/ — the container is blv-db-1, NOT the server's
# baleicomptes-postgres. COPY … TO STDOUT, *not* \copy: \copy would write the file
# inside the container (psql is the client there), where scp cannot see it.
# Write them OUTSIDE the repo ($OUT below): this repo is public and CLAUDE.md's
# `git add .` would sweep a vault export straight into a public commit.
docker compose exec -T db psql -U postgres -d baleinev_comptes -c \
 "COPY (select id,name,login,website,\"passwordCipher\",\"passwordIv\",\"passwordTag\",
         \"totpCipher\",\"totpIv\",\"totpTag\",null::text,\"createdAt\",\"updatedAt\"
    from \"PasswordEntry\") TO STDOUT WITH CSV" > "$OUT/vault-entries.csv"

docker compose exec -T db psql -U postgres -d baleinev_comptes -c \
 "COPY (select j.\"B\", r.name from \"_DepartmentRoleToPasswordEntry\" j
          join \"DepartmentRole\" r on r.id = j.\"A\") TO STDOUT WITH CSV" > "$OUT/vault-roles.csv"

scp -i ~/.ssh/id_ed25519 "$OUT"/vault-{entries,roles}.csv root@leaddesk.cabras.ch:/tmp/
```

Both files are 6 lines, and every row of `vault-roles.csv` says `Administration` — that is the
export verified. Delete them from `/tmp` on both machines once the import is confirmed.

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

**B8 — Firewall.** `blv-firewall.sh` was written from §1's description of
`leaddesk-firewall.sh`, not copied from it — the box was not reachable at the time. **Diff the
two before running the installer**; anything LeadDesk's does that ours does not is probably
load-bearing:

```bash
diff /usr/local/sbin/leaddesk-firewall.sh /opt/blv/checkout/deploy/blv-firewall.sh
sudo /opt/blv/checkout/deploy/install-firewall.sh
```

Verify from the workstation that `nc -vz 194.99.21.120 3100` **times out** — a refused
connection means the DROP is missing.

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

As root, for the same reason B6 is:

```bash
/opt/blv/checkout/deploy/install-updater.sh
sudo -u blv git -C /opt/blv/checkout describe --tags --exact-match \
  > /opt/blv/state/deployed-tag                                   # NOT optional
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
- Push `v0.1.2` (`non-breaking`) and watch it land within ~2 minutes:
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

The repo is public. Credentials belong in `app/.env` (gitignored) and nowhere else — not in
this file, not in a commit message.
