# Production — the server and the deploy pipeline

How this app runs on `194.99.21.120` (`blv.cabras.ch`), and how a release gets there:
push an annotated tag, and a systemd timer on the box notices within two minutes,
backs up, builds, health-checks, and rolls back if the check fails. Nothing is
copied to the server by hand and no CI is involved — the box pulls.

The box is **shared with a live application**, LeadDesk (`leaddesk.cabras.ch`).
Almost every deliberate choice below — the ports, the compose project name, the
separate proxy, the boot offset on the timer — exists because of that.

---

## Status

The repository half is complete: [install.sh](../install.sh), [deploy/](../deploy/),
`/api/health`, the Prisma baseline migration, a production-installable dependency
set, and this document.

**The server half has not been executed yet.** `/opt/blv` does not exist, `blv.cabras.ch`
has no certificate, and the app that is on the box is a stale, unserved checkout from
May under `/root`. The ordered runbook for that first install — including migrating the
legacy accounting data and extracting Caddy — is
[docs/plans/001-production-deployment.md](plans/001-production-deployment.md), Phase B.
This file is the durable description; the plan is the one-time migration.

---

## Server facts

Surveyed 2026-08-16.

| Fact | Value |
| --- | --- |
| Host | `194.99.21.120`, Ubuntu 24.04, KVM |
| Access | `ssh -i ~/.ssh/id_ed25519 root@leaddesk.cabras.ch`, then `sudo -iu blv` |
| CPU / RAM | 1 vCPU · 1.9 GB RAM · 2.4 GB swap |
| Disk | 23 GB total — **the binding constraint on this box** |
| Node | system-wide `v20.20.2` at `/usr/bin/node`, shared with LeadDesk |
| Docker | present; `/etc/docker/daemon.json` sets `"iptables": false` |
| Firewall | per-app scripts in `/usr/local/sbin`, persisted to `/etc/iptables/rules.v4` |
| DNS | `blv.cabras.ch` and `leaddesk.cabras.ch` both resolve here |

**Do not upgrade Node casually.** Both apps resolve the same `/usr/bin/node`, and both
sets of systemd units pin its absolute path. Next 16 needs `>= 20.9.0` and LeadDesk's
Next 14 needs `>= 18.17.0`, so 20.20.2 satisfies both. After any upgrade, re-run
`deploy/install-service.sh` and `deploy/install-updater.sh` — otherwise the units point
at a path that no longer exists and the service fails with "no such file".

**Do not "fix" `"iptables": false`.** Containers have outbound NAT only because of one
persisted masquerade rule. Changing the flag needs a daemon restart, which restarts
every container on the box, LeadDesk's database included.

---

## Ports

| Port | Owner | Exposure |
| --- | --- | --- |
| 80 / 443 | the shared Caddy container (`/opt/caddy`) | **the only public listeners** |
| 3000 | LeadDesk (`next start`) | loopback + Docker bridge, DROP otherwise |
| **3100** | **this app (`blv.service`)** | loopback + `172.16.0.0/12`, DROP otherwise |
| 5432 | the legacy `baleicomptes-postgres` container | loopback (removed at the end of Phase B) |
| 5433 | LeadDesk's Postgres | loopback |
| **5434** | **this app's Postgres (`blv-db-1`)** | loopback |

`next start` binds `0.0.0.0` and cannot be told otherwise, so :3100 would be reachable
without TLS if nothing stopped it. [deploy/blv-firewall.sh](../deploy/blv-firewall.sh) is
what stops it: ACCEPT from `127.0.0.1` (the health gate) and `172.16.0.0/12` (the proxy
container), DROP everything else. DROP and not REJECT — an external scan should time out,
not learn that something is listening.

The compose project is pinned `name: blv` in [app/docker-compose.yml](../app/docker-compose.yml).
That file lives in a directory called `app/`, which is the project name LeadDesk already
owns on this box; without the explicit name the two would fight over the container
`app-db-1`, and `docker compose exec db` from either directory could reach the other
project's database.

---

## Directory layout

```
/opt/blv/
  checkout/          the git working tree — the REPO ROOT, not the npm project
    app/             the Next project: WorkingDirectory of blv.service, and where
                     every npm/npx/docker-compose call runs
    app/.env         the only secrets file. Mode 600. Read by both the app and compose
    deploy/          the pipeline
    soa/             read at RUNTIME by the invoice PDF routes — not optional
  state/             deployed-tag · last-deploy.json · pending-/approved-/failed-<tag>
  backups/           pre-<tag>-<stamp>.zip — mode 700, newest 3 kept

/opt/caddy/          the shared proxy, owned by neither app
  docker-compose.yml · Caddyfile · .env · conf.d/{leaddesk,blv}.caddy
```

Two properties this layout exists to guarantee:

- **`state/` and `backups/` are beside the checkout, never inside it.** A deploy runs
  `git checkout --detach tags/<tag>` at the checkout root, so anything inside it is
  whatever the tag says it is. The pipeline's memory of what is live, and its snapshots,
  must not be.
- **The npm project is not the repo root.** `git` runs at `/opt/blv/checkout`; every
  `npm`, `npx` and `docker compose` runs in `/opt/blv/checkout/app`. The service's
  `WorkingDirectory` is the latter, and it must stay inside the git checkout because
  `app/api/invoices/[invoiceId]/pdf/route.ts` resolves
  `process.cwd()/../soa/qr/blv-logo-noir-render.png` at request time.

Uploads live in Postgres (`ExpenseReport.proofData`), so a `pg_dump` is a **complete**
backup. There is no blob store to snapshot alongside it.

---

## Deploy: push a tag

Releases are **annotated** tags matching `v*`, and the tag message is the instruction to
the pipeline. [deploy/self-update.sh](../deploy/self-update.sh) fetches tags every
~2 minutes, compares the highest semver tag against `state/deployed-tag`, and acts.

```bash
git tag -a v0.2.0 -m "non-breaking"
git push origin v0.2.0
```

### The tag vocabulary

| Directive | What the pipeline does |
| --- | --- |
| `non-breaking` | Backup, build, restart, health-check. The default shape of a release. |
| `requires-migration` | The same, plus `prisma migrate deploy` before the build — and the pre-deploy snapshot is restored if the deploy then fails. |
| `requires-env` | **Halts.** Writes `state/pending-<tag>` and waits for `deploy/approve.sh`. Use it whenever a release reads a variable that is not yet in `app/.env`. |
| `requires-manual: <note>` | **Halts** the same way, and the note is what the operator has to do first. |
| `no-deploy` | Recorded as seen and skipped. For tags that are not releases. |
| *(a lightweight tag)* | Ignored — a `git tag v0.2.0` with no `-m` carries no message, so it has nothing to say. Recorded as seen. |

**Directives are flags, not an enum.** A message carrying both `requires-env` and
`requires-migration` means "halt for the `.env` review, then migrate" — both are obeyed.
`no-deploy` wins over everything, because it means "not a release".

**Never tag blind.** The message is the only place the box learns that a release needs a
migration or a new variable. A schema change tagged `non-breaking` deploys code against
the old schema and the app starts throwing at runtime, not at build time.

### What the pipeline guarantees

- **A snapshot before every deploy.** `pg_dump` of the live database plus `app/.env`,
  zipped into `backups/pre-<tag>-<stamp>.zip`. A truncated dump is refused rather than
  kept — constraints live in the tail of a dump, and a truncated one restores rows with
  no foreign keys while `psql` still exits 0. If the snapshot fails, **nothing else runs**.
- **A health gate, not a "did it start" check.** `http://127.0.0.1:3100/api/health` does a
  real `SELECT 1` through Prisma, so a green check proves the app reached Postgres. It is
  in `proxy.ts`'s early-return list, so it answers 200 rather than a 307 to `/login`.
- **Automatic rollback.** A failed deploy rebuilds the previously deployed tag. The
  snapshot is restored **only when a migration ran** — restoring otherwise would discard
  every write made during the build window to fix a problem that was never in the database.
- **Quarantine.** A failed tag gets `state/failed-<tag>`, so the timer does not crash-loop
  through a backup and a full rebuild every two minutes. Remove the marker to retry.
- **One at a time.** An `flock` in `state/` keeps a slow build from overlapping the next
  tick, and `self-update.sh` calls `main "$@"` on its last line because a checkout rewrites
  the script while bash is still reading it.

What it cannot guarantee: **a migration is not undone by a checkout.** A destructive
schema change must be split across two releases — additive first, drop later. No pipeline
can enforce that.

### Watch and inspect

```bash
journalctl -u blv-updater.service -f      # deploys as they happen
journalctl -u blv -f                      # the app itself
cat /opt/blv/state/last-deploy.json       # {status, tag, message, at}
cat /opt/blv/state/deployed-tag           # what is live right now
systemctl list-timers blv-updater.timer   # when the next tick is
ls -lt /opt/blv/backups/                  # the newest 3 snapshots
```

`status` in `last-deploy.json` is one of `deployed`, `seen`, `pending`, `rolled-back`,
`failed`.

### Approving a halted release

```bash
sudo -iu blv
cd /opt/blv/checkout
# do the manual part first — edit app/.env, install the package, whatever the tag asked
./deploy/approve.sh v0.2.0     # then it deploys on the next tick, within ~2 minutes
```

To skip the wait, from an account with full sudo:
`sudo systemctl start blv-updater.service`. The `blv` user's sudoers rule
(`/etc/sudoers.d/blv-deploy`) covers only `systemctl restart blv` and `systemctl status blv`,
on purpose — a rule ending in a wildcard is a root shell with extra steps.

---

## First-time install

The full first install of *this* box, with the legacy data migration and the Caddy
extraction, is Phase B of
[docs/plans/001-production-deployment.md](plans/001-production-deployment.md). The
general shape, for this app on any box:

```bash
# 1. app user, system packages, clone (as root, once)
useradd --system --create-home --home-dir /home/blv --shell /bin/bash blv
usermod -aG docker blv                       # the pre-deploy pg_dump needs the socket
mkdir -p /opt/blv/{checkout,state,backups} && chown -R blv:blv /opt/blv
apt-get install -y zip unzip \
  libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2t64
sudo -iu blv git clone https://github.com/2lazy2debug/baleinev-backoffice.git /opt/blv/checkout

# 2. install — deps, .env, Postgres, migrations, build. Does NOT start the app.
sudo -iu blv
cd /opt/blv/checkout && git checkout tags/v0.1.0
./install.sh
$EDITOR app/.env                             # read it before starting anything

# 3. service, firewall, TLS
./deploy/install-service.sh                  # blv.service on 3100
curl -fsS http://127.0.0.1:3100/api/health   # must return {"status":"ok"}
exit
sudo /opt/blv/checkout/deploy/install-firewall.sh
sudo /opt/blv/checkout/deploy/install-caddy-site.sh

# 4. the deploy timer — re-run after any Node upgrade
sudo -iu blv
cd /opt/blv/checkout
./deploy/install-updater.sh
git describe --tags --exact-match > /opt/blv/state/deployed-tag   # NOT optional
```

That last line records what is live right now. Without it the first tick sees no
`deployed-tag`, treats the installed tag as new, and redeploys what is already running.

`zip`/`unzip` are the pipeline's own dependency — without them every deploy stops at the
snapshot. The Chromium libraries are Puppeteer's: skipping them does not fail the install,
it fails the first invoice PDF, months later, with a missing-`.so` error nobody connects
to deploy day.

Three values in `install.sh`'s prompts must be **carried over, not generated**, when this
install inherits an existing database:

| Prompt | Why |
| --- | --- |
| `PASSWORD_VAULT_KEY` | AES-256-GCM: a new key makes every existing vault entry permanently undecryptable, silently. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `npm run db:seed` upserts **by email**; a different address adds an account instead of keeping the existing one. |

`AUTH_SECRET` and the Postgres password are generated fresh — nothing that carries over
depends on either. Rotating `AUTH_SECRET` only signs everyone out.

---

## The shared proxy

One Caddy container serves both hosts, from `/opt/caddy`, owned by neither app user:

```
/opt/caddy/
  docker-compose.yml     name: caddy — extra_hosts: host.docker.internal:host-gateway
  Caddyfile              { email {$ACME_EMAIL} }  +  import /etc/caddy/conf.d/*.caddy
  .env                   ACME_EMAIL=…
  conf.d/leaddesk.caddy  leaddesk.cabras.ch -> host.docker.internal:3000
  conf.d/blv.caddy       blv.cabras.ch      -> host.docker.internal:3100
```

The certificate volumes are declared `external` and are the ones the original LeadDesk
project created (`app_caddy_data`, `app_caddy_config`), so the Let's Encrypt account key
and every issued certificate survive. Certificates are obtained on the first request over
HTTP-01 and renewed automatically ~30 days before expiry — no certbot, no cron entry.

This app's site block is version-controlled at [deploy/blv.caddy](../deploy/blv.caddy) and
installed by [deploy/install-caddy-site.sh](../deploy/install-caddy-site.sh), which stages
the change into a temp copy, validates the **whole** config, and only then copies the file
in and runs `caddy reload`. Graceful: no recreate, no downtime, no re-issue.

**A parse error takes down both hosts.** That is why validation is not optional and why
there is no path that skips it. Never edit `/opt/caddy/conf.d/blv.caddy` by hand — edit
`deploy/blv.caddy`, ship it, and run the installer.

---

## Failure modes

Each of these is here because the symptom does not name the cause.

- **Disk is the binding constraint.** Every deploy writes a snapshot and rebuilds `.next`.
  `BACKUP_KEEP=3`, the journald cap (`SystemMaxUse=200M`), and a `df -h` after the first
  deploy of any release are the whole discipline.
- **RAM is fine for serving and tight only for building.** Two idle `next start` processes
  are nothing; one `next build` on 1 vCPU with ~1 GB free swaps and finishes, and two at
  once will OOM. Both timers only build when a new tag exists, so this needs both repos
  tagged within the same two minutes — hence the 3-minute `OnBootSec` offset. If it ever
  actually bites, a shared `flock /var/lock/nextjs-build.lock` in both `self-update.sh`
  scripts removes it for good.
- **`npm ci` uses the server's npm, not yours.** A lockfile written by a newer npm can
  dedupe a transitive dependency in a way npm 10.8.2 rejects, and the build then dies with
  a confusing `Cannot find package`. Regenerate the lockfile with `npx npm@10.8.2 install
  --package-lock-only` after every dependency change.
- **`next build` must not need a devDependency.** `typescript`, `@types/*`, `tailwindcss`,
  `@tailwindcss/postcss`, `prisma` and `tsx` are in `dependencies` for exactly this reason;
  only `eslint` and `eslint-config-next` are dev deps. `install.sh` installs `--omit=dev`
  deliberately, so the trap springs on a machine someone is watching.
- **A Postgres volume keeps its original credentials.** `POSTGRES_*` only initialise an
  *empty* volume. Pointing a fresh `.env` at a pre-existing one fails as "Postgres never
  became ready", never as an auth error.
- **`prisma migrate deploy` needs `prisma/migrations/`.** This app used `db push` for its
  whole early life; `0_init` is the baseline generated from the schema. A database that
  predates it is baselined once by hand with `prisma migrate resolve --applied 0_init`.
  From there on, schema changes ship as real migrations and the tag says
  `requires-migration`.
- **Re-run both installers after any Node upgrade.** The units pin an absolute node path.
- **One Caddy, two sites, one config.** Validate offline before every reload, and keep a
  copy of the last known-good Caddyfile.
- **The `blv` user must be in the `docker` group.** Without it the pre-deploy `pg_dump`
  fails and no tag ever deploys. `install-updater.sh` warns when it is not.

---

## Local development

Unchanged by any of the above, and documented in [../README.md](../README.md): `docker
compose up -d db` from `app/`, on the same port 5434 and the same `app/.env` shape the
server uses. `install.sh` is a server script; do not run it on a workstation whose `.env`
you care about.
