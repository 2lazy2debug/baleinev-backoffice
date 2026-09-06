# Testing & checks

There is **no CI**. Four commands, run from `app/`, are the whole safety net —
run all four before shipping, and the release protocol in
`docs/plans/` assumes a green `npm run build`.

| Command | What it catches |
|---|---|
| `npm run build` | The real type gate — `next build` type-checks and compiles every route. |
| `npm run lint` | ESLint. As of v0.34.0 there are 2 pre-existing errors in `app/(app)/tasks/client.tsx` (`copy: any`) — known, not yours. |
| `npm run check:design` | Hardcoded hex, arbitrary radius, bare `var(--space-…)` in markup (CLAUDE.md → "Design system rules"). |
| `npm run check:i18n` | `lib/i18n-dictionaries.ts` `en` and `fr` out of step — a key in one locale and not the other, an object where the other has a string. |
| `npm test` | Unit tests (`vitest run`). `npm run test:watch` to iterate. |

`npm run check:i18n --dead` additionally lists dictionary leaf keys whose name
appears nowhere in code — off by default (the repo carries some pre-existing
ones). Run it before and after a change that moves keys between blocks and
compare the two lists; a key that only you added should never appear.

## Unit tests

`vitest.config.ts` + `*.test.ts` files next to the code they cover. Node
environment, no DOM. The UI is covered by build + lint + check:design; the tests
cover the **logic** those cannot see:

- the "refuse X while Y exists" rules in server actions
- FormData → row parsing (`lib/articles.ts`, and anything like it)
- money maths once `lib/cash.ts` exists (integer rappen — never floats)

### Testing a server action

A `"use server"` file is just a module of async functions. Import it and mock the
three things a test process has no real version of — then assert on the
`{ error }` the action returns (actions catch and convert thrown sentences, they
do not propagate them):

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { stockItem: { count: vi.fn() }, /* … */ } }));

const { updateArticleAction } = await import("./actions");
// drive prisma.stockItem.count to 4, expect result.error to match /take it out/
```

`app/(app)/articles/actions.test.ts` is the worked example — the admin gate, the
`tracksStock`-off and `expireable`-off refusals, the `revalidatePath` fan-out.

What this style does **not** cover: the Prisma query shapes themselves, the
`$transaction` blocks, RSC rendering. Those still need the app.

## Manual / behavioural checks

The local database (`docker compose up -d db`, `localhost:5434`, no production
data) is for this. `SEED_DEV_FIXTURES=1 npm run db:seed` adds the accounts the
plan verification steps assume:

- `dev-department@baleinev.local` / `devpassword` — role **DEPARTMENT**, for
  "as a non-admin…" checks
- a **closed edition** ("DEV — Closed edition"), for read-only-path checks

Admin-only pages throw `Unauthorized` (HTTP 500, same as `/templates`,
`/editions`) for a non-admin — that is the expected negative, not a bug.

### Smoke-testing a page over curl

```bash
CJ=/tmp/cj.txt
CSRF=$(curl -s -c $CJ localhost:3000/api/auth/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0)).csrfToken')
curl -s -c $CJ -b $CJ -X POST localhost:3000/api/auth/callback/credentials \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" --data-urlencode "json=true"
curl -s -b $CJ localhost:3000/articles   # now an authenticated request
```

`.env` values are quoted; dotenv strips the quotes, a shell `grep | cut` does
not. Re-run `npm run db:seed` if the admin password has drifted from `.env`.
