# Baleicomptes - Run Guide

Everything runs from `app/`: the Next.js application, and the Postgres container it
talks to (`app/docker-compose.yml`). The repo root also holds `docs/` and `soa/` —
the latter is read at runtime by the invoice PDF routes, so it is not optional.

## Prerequisites

- Docker + Docker Compose
- Node.js 20 (see `.nvmrc`) + npm

### macOS: install Docker with Homebrew

If Docker is not installed on your Mac, you can install Docker Desktop via Homebrew:

```bash
brew update
brew install --cask docker
```

Then start Docker Desktop once (from Applications), and wait until Docker is running.

Verify installation:

```bash
docker --version
docker compose version
```

If `docker compose` is available, you are ready to continue.

## 1. Configure the environment

```bash
cd app
cp .env.example .env
```

Both the app and the database read this one file. Set real values for:
- `AUTH_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
- `PASSWORD_VAULT_KEY`

The `POSTGRES_*` defaults work as-is; `DATABASE_URL` must agree with them.

## 2. Start PostgreSQL

From `app/`:

```bash
docker compose up -d db
```

Check status:

```bash
docker compose ps
```

Stop the database:

```bash
docker compose down
```

## 3. Install dependencies

```bash
npm install
```

## 4. Prepare the database schema

```bash
npm run db:deploy
npm run db:generate
```

`db:deploy` applies `prisma/migrations/`. Use `npm run db:push` only for throwaway
experiments — anything that ships needs a migration.

## 5. Seed first admin user

```bash
npm run db:seed
```

## 6. Run the app

```bash
npm run dev
```

Open:
- http://localhost:3000

Login using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `app/.env`.

## Useful commands

All from `app/`:

```bash
npm run lint
npm run check:design
npm run build
npm run start

docker compose logs -f db
docker compose down -v      # also deletes the database volume
```

## Deploying

See [docs/plans/001-production-deployment.md](docs/plans/001-production-deployment.md).
