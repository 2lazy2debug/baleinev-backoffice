# 001 — Production deployment alongside LeadDesk

Install this app on `194.99.21.120` (the box already serving `leaddesk.cabras.ch`),
reachable at `https://blv.cabras.ch`, with the same **tag-driven, pull-based** deploy
pipeline the LeadDesk and InFaaS repos use: push an annotated `vX.Y.Z` tag, a systemd
timer on the box notices within two minutes, backs up, builds, health-checks, and rolls
back on failure.

Nothing here has been executed. Every step below is ordered, and each numbered step is
one commit (per `CLAUDE.md`).

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

### Containers and ports in use

| Port | Owner | Notes |
| --- | --- | --- |
| 80 / 443 (tcp+udp) | `app-caddy-1` | Compose project `app`, workdir `/opt/leaddesk/app`. **The only public listener.** |
| 3000 | `leaddesk.service` (`next start`) | INPUT rules allow loopback + `172.16.0.0/12`, DROP otherwise |
| 5432 | `baleicomptes-postgres` | **This app's own legacy DB** — compose project `docker`, workdir `/root/baleinev-backoffice/docker`, volume `docker_postgres_data` |
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

This matters, because it is the thing we are replacing:

- `/root/baleinev-backoffice` — a `git clone` over **HTTPS** on branch `main`, pinned at
  commit `2376807` (**2026-05-07**, ~3 months stale), working tree dirty (`app/package-lock.json`,
  `docker/docker-compose.yml` modified; untracked `app/ecosystem.config.js`, a compose `.bak`).
  It carries `node_modules` and a `.next` build — **1.2 GB of disk**.
- An `ecosystem.config.js` for PM2, but **PM2 is not installed** and nothing listens on any
  app port. The app is not running and never was, in any supervised way.
- `baleicomptes-postgres` on `127.0.0.1:5432`, database `baleinev_comptes`, user `postgres`,
  9 MB, 22 tables — and **0 live rows in every single table**. There is no production data.
  Its schema predates the Passwords feature (`PasswordEntry` is absent).

So: no data to preserve, no service to keep alive, and 1.2 GB to reclaim.

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
| `eslint.ignoreDuringBuilds` | Next fails a build when a lint config exists but eslint was omitted |
| `.nvmrc` | Nothing records which Node the app is built against |
| A production `docker-compose.yml` | `docker/docker-compose.yml` is a local-dev DB on 5432, which is the *legacy* port |
| Backup/restore tooling | Nothing to snapshot before a deploy |
| Deployment docs | `docs/` has no `production.md` |

Two structural facts that shape every script below:

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
  backups/         pre-<tag>-<stamp>.zip (pg_dump + .env), mode 700, newest 5 kept
```

| Concern | Choice | Why |
| --- | --- | --- |
| App user | `blv` (system user, home `/home/blv`, in `docker` group) | Mirrors `leaddesk`; the docker group is needed for `docker compose exec db pg_dump` |
| App port | **3100** | 3000 is LeadDesk's |
| Postgres host port | **5434**, bound to `127.0.0.1` | 5432 is the legacy container we are deleting, 5433 is LeadDesk's. Picking a fresh number means no window where two containers fight over one port |
| Compose file | `app/docker-compose.yml`, one `db` service | Compose reads `.env` from its own directory, and the app's `.env` is `app/.env`. One directory, one `.env`, one set of `POSTGRES_*` — no duplication |
| TLS | A site block added to the **existing** Caddy | Port 443 can only be held once, and `app-caddy-1` holds it |
| Service name | `blv` → `blv.service`, `blv-updater.{service,timer}` | |
| Health URL | `http://127.0.0.1:3100/api/health` | Real DB round trip, so it proves Postgres too |

### The proxy decision

Caddy currently reads one file, from inside LeadDesk's checkout, describing one site. Three
ways to add a second site; **Option A is the recommendation** and the rest of this plan
assumes it:

- **A — a shared drop-in directory (recommended).** In the *LeadDesk* repo, append
  `import /etc/caddy/conf.d/*.caddy` to `caddy/Caddyfile` and add a
  `- /opt/caddy/conf.d:/etc/caddy/conf.d:ro` mount to the `caddy` service. Ship it as one
  LeadDesk tag. From then on this repo owns `/opt/caddy/conf.d/blv.caddy` and changes it with
  a `caddy reload` — zero further LeadDesk involvement. Cost: one container recreate
  (a few seconds of 443 downtime) and one LeadDesk release.
- **B — extract Caddy into its own `/opt/caddy` compose project** owned by neither app.
  Architecturally the cleanest, but it means stopping the running proxy and re-attaching the
  `app_caddy_data` volume (which holds the certificates *and* the ACME account key) as an
  external volume. More moving parts for the same outcome.
- **C — an untracked `docker-compose.override.yml` on the box** that re-points the Caddyfile
  bind mount outside the checkout. Survives LeadDesk deploys because git never touches
  untracked files, and needs no LeadDesk release — but it is unversioned state on a server,
  invisible to both repos. Rejected for that reason.

`blv.cabras.ch`'s certificate is issued by the same Caddy on first request; the Let's Encrypt
account email comes from the existing global block, so nothing new is needed there.

---

## 4. Phase A — repository work (local, before touching the server)

Each step is a commit. Nothing here changes the server.

**A1 — `.gitignore` hygiene.** `soa/.venv` is a committed Python virtualenv: 854 tracked
files. `git rm -r --cached soa/.venv`, add `.venv/` and `**/.venv/` to `.gitignore`. Keep
`soa/qr/*` — the PDF routes read the logo from there at runtime.

**A2 — Baseline the Prisma migrations.** The pipeline runs `prisma migrate deploy`, which
requires `prisma/migrations/`. The app has only ever used `db push`, so generate the baseline
from the schema:

```bash
cd app
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init   # against any EXISTING dev database
```

Add `"db:deploy": "prisma migrate deploy"` to `app/package.json`. On the (empty) production
database `0_init` simply runs. From here on, schema changes ship as real migrations and the
tag message says `requires-migration`.

**A3 — Add `/api/health`.** `app/app/api/health/route.ts`: `export const dynamic =
"force-dynamic"`, `SELECT 1` through `prisma.$queryRaw`, `200 {status:"ok"}` or `503`. Must
not require a session — `proxy.ts` currently redirects everything unauthenticated to
`/login`, so add `/api/health` to its early-return list, otherwise the pipeline's health gate
sees a 307 and `curl -f` fails every deploy.

**A4 — Make the build survive `npm ci --omit=dev`.** Move `typescript`, `@types/*`,
`tailwindcss`, `@tailwindcss/postcss`, `prisma`, `tsx` into `dependencies`; leave `eslint` and
`eslint-config-next` in `devDependencies` and set `eslint: { ignoreDuringBuilds: true }` in
`app/next.config.ts`. Then regenerate the lockfile **with the server's npm major** and rehearse
the production install in a scratch copy:

```bash
npx npm@10.8.2 install --package-lock-only
npx npm@10.8.2 ci --omit=dev --ignore-scripts   # in a scratch copy
npm run build
```

Add `.nvmrc` containing `20` — the box's Node, and Next 16's floor is 20.9.

**A5 — `app/docker-compose.yml`.** One `db` service: `postgres:16-alpine`, `restart:
unless-stopped`, `ports: ["127.0.0.1:5434:5432"]`, `pg_isready` healthcheck, named volume.
Delete `docker/` (its 5432 mapping is the legacy container) and point `README`/docs at the new
file. Local dev then runs `docker compose up -d db` from `app/`.

**A6 — `deploy/`.** Ported from `NurseAsAService/deploy` (the more refined generation), with
LeadDesk's in-script `pg_dump` backup (this repo has no `npm run backup`, and a shell backup
has no dependency on the app building):

| File | Notes |
| --- | --- |
| `self-update.sh` | flock · `git fetch --tags` · highest semver · directive flags · pre-deploy `pg_dump` zip · `git checkout --detach` at the **checkout root** · `npm ci --omit=dev` + `prisma generate` + optional `migrate deploy` + `npm run build` in **`app/`** · `sudo systemctl restart blv` · health-poll `:3100/api/health` for 90 s · rollback (restoring the dump only if a migration ran) · quarantine `failed-<tag>` · `last-deploy.json`. `main "$@"` stays the **last line** — the script rewrites itself mid-run |
| `blv.service.template` | `WorkingDirectory=<checkout>/app`, absolute pinned node path, `next start -p 3100`, `Restart=always`, `NoNewPrivileges=true` |
| `blv-updater.service.template` | oneshot, `TimeoutStartSec=1800`, **no** `NoNewPrivileges` (it needs sudo), pinned node bin dir on `PATH` |
| `blv-updater.timer` | `OnBootSec=3min`, `OnUnitActiveSec=2min` — offset from LeadDesk's so the two rarely tick together |
| `install-service.sh` | Resolves the absolute node path on the box, refuses to install without `app/.env` and a `.next/BUILD_ID`, `chmod 600 app/.env` |
| `install-updater.sh` | Renders the units, writes `/etc/sudoers.d/blv-deploy` (`systemctl restart blv`, `systemctl status blv` — no wildcard, `visudo -c` first), enables the timer |
| `approve.sh` | Writes `state/approved-<tag>`, warns when no `pending-<tag>` exists |
| `blv-firewall.sh` + `install-firewall.sh` | Same shape as `leaddesk-firewall.sh`, for **3100**: ACCEPT from `127.0.0.1` and `172.16.0.0/12`, DROP the rest; installs `blv-firewall.service` and persists with `iptables-save > /etc/iptables/rules.v4` |
| `blv.caddy` + `install-caddy-site.sh` | The site block, version-controlled here; the installer copies it to `/opt/caddy/conf.d/`, runs `caddy validate`, then `caddy reload` |

Path handling in every script: `CHECKOUT_ROOT="$SCRIPT_DIR/.."`, `PROJECT_ROOT="$CHECKOUT_ROOT/app"`,
`STATE_DIR="${BLV_STATE_DIR:-$CHECKOUT_ROOT/../state}"`, same for `backups`. State lives beside
the checkout so a tag checkout cannot touch it.

**A7 — `install.sh`** at the repo root, modelled on `NurseAsAService/install.sh`: Node check
against `.nvmrc` → Docker check → `npm ci --omit=dev` in `app/` → interactive `.env` (generating
`AUTH_SECRET`, `PASSWORD_VAULT_KEY`, the Postgres password; `DATABASE_URL` on port 5434 with the
password percent-encoded; `NEXTAUTH_URL=https://blv.cabras.ch`) → create `state/` and `backups/`
(mode 700) → `docker compose up -d db` and wait for `pg_isready` → `prisma generate` →
`prisma migrate deploy` → optional `db:seed` for the first admin → `npm run build`. It
**does not start the app** — `.env` gets read by a human first. Idempotent; re-running is safe.

**A8 — `docs/production.md`.** Server facts, the port map, the tag vocabulary table, the
first-install runbook, the shared-Caddy arrangement, and the failure modes in §6 below. Link
it from `docs/overview.md`. Per `CLAUDE.md`, this ships *with* the code, not after it.

**A9 — Tag `v0.1.0`** (annotated, message `non-breaking`) and push. This is what the box
installs first.

---

## 5. Phase B — server install, in order

Run as `root@leaddesk.cabras.ch` unless stated. Every step is verifiable before the next.

**B1 — Reclaim disk. Do this first; 4.0 GB free is not enough for a Next build plus
`node_modules` plus a Chromium download.**

```bash
# Safety copy of the (empty) legacy DB, then stop and remove the stale deployment
docker exec baleicomptes-postgres pg_dump -U postgres -d baleinev_comptes \
  --clean --if-exists --no-owner --no-privileges > /root/blv-legacy-2026-08-16.sql
docker compose -f /root/baleinev-backoffice/docker/docker-compose.yml down
rm -rf /root/baleinev-backoffice           # frees ~1.2 GB
docker volume rm docker_postgres_data      # only after the dump above is verified
docker image prune -f
ls -1t /opt/leaddesk/backups/*.zip | tail -n +4 | xargs -r rm -f   # keep newest 3 of 2.2 GB
df -h /                                     # target: >= 6 GB free before B5
```

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
  libpango-1.0-0 libcairo2 libasound2t64
```

Skipping this does not fail the install — it fails the first invoice PDF, months later, with a
missing-`.so` error nobody connects to deploy day.

**B5 — `./install.sh` as `blv`**, from `/opt/blv/checkout`. Then read `app/.env`.

**B6 — Service.** `./deploy/install-service.sh` (starts `blv.service` on 3100).
Verify: `curl -fsS http://127.0.0.1:3100/api/health`.

**B7 — Firewall.** `sudo ./deploy/install-firewall.sh`. Verify from the workstation that
`nc -vz 194.99.21.120 3100` times out.

**B8 — Proxy (the one cross-project step).**

1. `mkdir -p /opt/caddy/conf.d` and install the site file first, so Caddy's first parse after
   the recreate already has real content: `sudo ./deploy/install-caddy-site.sh`.
2. In the **LeadDesk repo**: append `import /etc/caddy/conf.d/*.caddy` to `caddy/Caddyfile`,
   add the `- /opt/caddy/conf.d:/etc/caddy/conf.d:ro` mount to the `caddy` service in
   `docker-compose.yml`, and (recommended, see §6) wrap its `self-update.sh` build in a shared
   `flock /var/lock/nextjs-build.lock`. Tag it
   `requires-manual: run 'docker compose up -d caddy' in /opt/leaddesk/app after this lands`.
3. After that tag deploys, on the box: `cp /opt/leaddesk/app/caddy/Caddyfile /root/Caddyfile.bak`,
   then `cd /opt/leaddesk/app && docker compose up -d caddy`, then
   `docker exec app-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
4. Verify **both** hosts: `curl -sI https://leaddesk.cabras.ch` and `https://blv.cabras.ch`.
   A parse error here takes down *both* sites — that is why the backup copy and the validate
   step are in the list.

**B9 — The updater.**

```bash
sudo -iu blv && cd /opt/blv/checkout
./deploy/install-updater.sh
git describe --tags --exact-match > /opt/blv/state/deployed-tag   # NOT optional
```

Without that last line the first tick sees no `deployed-tag`, treats `v0.1.0` as new, and
redeploys what is already running.

**B10 — Verification checklist.**

- `systemctl status blv` active; `systemctl list-timers blv-updater.timer` scheduled.
- `https://blv.cabras.ch` returns the login page over a valid Let's Encrypt certificate.
- `https://leaddesk.cabras.ch` still 200 — the proxy change touched both.
- External `:3100` times out; `:5434` is not reachable from outside.
- `cat /opt/blv/state/last-deploy.json` after the first pipeline run.
- Optional but worth it once, while nobody depends on it: reboot and confirm `blv`,
  `blv-updater.timer`, both Postgres containers, Caddy and the firewall units all come back.

---

## 6. Failure modes to design against

Each is here because the symptom does not name the cause.

- **Disk is the binding constraint.** 4.0 GB free before B1. A Next build plus `node_modules`
  plus a Chromium download plus a pre-deploy dump is comfortably 2 GB of new resident data,
  and every deploy writes another snapshot and rebuilds `.next`. Keep `BACKUP_KEEP` at 3–5 and
  re-check `df -h` after the first pipeline deploy.
- **RAM is the second one, and it bites unpredictably.** 1.9 GB total, ~1.0 GB free, 1 vCPU.
  Two `next build`s at once will OOM. Both timers only build when a *new tag* exists, so a
  collision needs both repos tagged within the same couple of minutes — unlikely, not
  impossible. The 3-minute `OnBootSec` offset reduces the boot-time case; a shared
  `flock /var/lock/nextjs-build.lock` in both `self-update.sh` scripts removes it entirely.
- **`npm ci` uses the server's npm, not yours.** A lockfile written by a newer npm can dedupe a
  transitive dependency in a way npm 10.8.2 rejects; the build then dies with a confusing
  `Cannot find package`. Regenerate the lockfile with `npm@10.8.2` after every dependency change.
- **`next build` must not need a devDependency** — the whole point of A4. `install.sh` installs
  `--omit=dev` deliberately, so the trap springs on a machine someone is watching.
- **A migration is not undone by a checkout.** The pipeline restores the pre-deploy dump when a
  migration ran, but a destructive migration must still be split across two releases (additive
  first, drop later). No pipeline can enforce that.
- **A Postgres volume keeps its original credentials.** `POSTGRES_*` only initialise an *empty*
  volume. Pointing a fresh `.env` at a pre-existing volume fails as "Postgres never became
  ready", never as an auth error.
- **Re-run both installers after any Node upgrade.** The units pin an absolute node path; an
  upgrade moves it and the service fails with "no such file".
- **The Caddyfile is a single point of failure for two sites.** Validate before reloading, and
  keep the backup copy from B8.3.
- **`docker daemon.json` has `"iptables": false`.** Containers only have outbound NAT because
  of the one persisted masquerade rule. Do not "fix" the flag — it would restart every
  container on a shared host.

---

## Open Questions

1. **The legacy database is empty — confirm we drop it.** All 22 tables in `baleinev_comptes`
   have 0 rows, and the schema predates the Passwords feature. B1 dumps it to
   `/root/blv-legacy-2026-08-16.sql` and then deletes the container, the checkout and the
   `docker_postgres_data` volume. Is there any reason to keep it, or any *other* place where
   real Baleinev data lives that should be imported instead?
2. **Seed data.** `soa/compta_2025-2026.xlsx` plus `npm run db:import:workbook` and
   `db:import:budget` exist. Should the first install import the workbook, or start empty and
   let you enter data through the UI?
3. **First admin account.** `install.sh` writes `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`
   and runs the seed. Which email and display name? (The password can be generated and printed
   once, then changed in-app.)
4. **`PASSWORD_VAULT_KEY`.** A fresh key gets generated on the box, which means any vault entry
   created locally is unreadable there. Confirm there is nothing in a local vault to carry over
   — if there is, the key must be copied instead of generated.
5. **Proxy option.** §3 recommends A (a `conf.d` drop-in added to the LeadDesk repo, one tag,
   one container recreate). Confirm — B and C are still open, and A is the only one that puts a
   change into the LeadDesk repository.
6. **Node version.** The box has 20.20.2 system-wide and this app targets Next 16 / React 19
   (floor: Node 20.9). Plan A4 pins `.nvmrc` to `20` and shares the system Node with LeadDesk.
   Alternative: install Node 22 under the `blv` user via nvm, leaving LeadDesk on 20 — more
   isolation, one more thing to re-pin after upgrades. Stay on 20?
7. **The box is small for two Next apps** — 1 vCPU, 1.9 GB RAM, 4 GB free disk before cleanup.
   §6 lists the mitigations and they should hold, but is upgrading the VPS on the table? It
   would remove the OOM and disk-pressure classes of failure outright rather than managing them.
8. **Backup retention and off-box copies.** Pre-deploy dumps are complete backups (uploads live
   in Postgres). Keep the newest 5 on the box, as LeadDesk does? And should anything pull them
   off the server — right now a disk failure loses both projects' backups with the projects.
9. **Scheduled jobs.** LeadDesk has a nightly sync timer. This app appears to need none.
   Confirm nothing recurring is expected (reminders, recurring tasks, budget rollovers).
10. **`git push --tags` from where.** Deploys trigger on tags pushed to `origin`. Confirm you
    are happy tagging from this workstation (SSH remote, key present) and that no CI should be
    involved.
