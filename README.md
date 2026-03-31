# Baleicomptes - Run Guide

This project has two main parts:
- `docker/` for PostgreSQL
- `app/` for the Next.js web application

## Prerequisites

- Docker + Docker Compose
- Node.js + npm

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

## 1. Start PostgreSQL (Docker)

```bash
cd docker
cp .env.example .env
docker compose up -d
```

Check status:

```bash
docker compose ps
```

Stop database:

```bash
docker compose down
```

## 2. Configure app environment

```bash
cd ../app
cp .env.example .env
```

Open `app/.env` and set real values for:
- `AUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

If you keep Docker defaults, `DATABASE_URL` can stay as-is.

## 3. Install dependencies

```bash
npm install
```

## 4. Prepare database schema

```bash
npm run db:push
npm run db:generate
```

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

From `app/`:

```bash
npm run lint
npm run build
npm run start
```

From `docker/`:

```bash
docker compose logs -f postgres
docker compose down -v
```
