# 101 — The articles app

**Read [100-cash-manager-pos.md](100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 102–107; their
context is not yours.

## What this builds

The catalogue behind stock — `StockElement`, the screen at `/stock/items` — stops
being a sub-page of the stock app and becomes an app of its own at **`/articles`**,
admin-only, in the sidebar.

It also gains one field: **`tracksStock`**. An article with it off can be sold but
never stocked. That is the beer glass you pour: the barrel is stocked, the glass
is not, and both have to exist in the catalogue for a till to sell them.

**The model is not renamed.** `StockElement` stays `StockElement` in the schema
and in every relation. This plan moves a *screen* and adds a *column*; a
table rename would touch six models and buy nothing. "Article" is the word the UI
uses; `StockElement` is the word the database uses.

Ships as **`requires-migration`**.

---

## Step 1 — The column

File: `app/prisma/schema.prisma`, the `StockElement` model.

```prisma
  /// Whether pieces of this are counted on a shelf. Off means the article exists
  /// only to be sold — a poured glass of beer is sold by the till and never
  /// stocked, while the barrel behind it is both. Off hides it from every stock
  /// screen; it never hides it from a POS template.
  tracksStock Boolean @default(true)
```

Run `npx prisma generate` from `app/`. **Do not run `prisma migrate dev`** — this
repo writes its migrations by hand.

New file:
`app/prisma/migrations/<YYYYMMDDHHMMSS>_stock_element_tracks_stock/migration.sql`

```sql
-- Add `StockElement.tracksStock`.
--
-- 101 splits the catalogue out of the stock app so a till can sell things that
-- are never counted on a shelf. Everything that exists today *is* stocked, so
-- the default is true and no backfill is needed.

ALTER TABLE "StockElement" ADD COLUMN "tracksStock" BOOLEAN NOT NULL DEFAULT true;
```

Commit.

---

## Step 2 — Move the shared pieces out of `/stock`

Three things in `app/app/(app)/stock/` are about to have two consumers. Move
them before moving the screen, so the move in step 3 is a pure move.

1. `stock/unit-size-fields.tsx` → **`app/components/unit-size-fields.tsx`**.
   It is imported by `stock/add-stock-modal.tsx` (which stays) and by the form
   this plan moves. Update both import paths to `@/components/unit-size-fields`.
   Do not change its contents.
2. `elementFieldsFrom()` and `assertBarcodeFree()`, currently private functions in
   `stock/actions.ts` → **`app/lib/articles.ts`**, exported. `addStockAction`
   still needs them for the scan-to-create path, and so does the new articles
   action file. Move them verbatim, export them, and import them back into
   `stock/actions.ts`. `elementFieldsFrom` gains one line:
   `tracksStock: String(formData.get("tracksStock") ?? "") === "on"`.
   **`addStockAction` must override it to `true`** — something being put on a
   shelf is by definition stocked, and that form has no such checkbox.
3. `lookupBarcodeAction` stays in `stock/actions.ts`; the article form imports it
   from there. It is a read, and duplicating it would mean two Open Food Facts
   call sites.

`npm run build` must be green here. Commit.

---

## Step 3 — The route moves

Move the four files, keeping their contents except where noted:

| From | To |
|---|---|
| `app/app/(app)/stock/items/page.tsx` | `app/app/(app)/articles/page.tsx` |
| `app/app/(app)/stock/items/client.tsx` | `app/app/(app)/articles/client.tsx` |
| `app/app/(app)/stock/items/item-form-modal.tsx` | `app/app/(app)/articles/article-form-modal.tsx` |
| `app/app/(app)/stock/items/create-item-button.tsx` | `app/app/(app)/articles/create-article-button.tsx` |

Then delete the now-empty `stock/items/` directory.

New file `app/app/(app)/articles/actions.ts`, holding the three element actions
moved out of `stock/actions.ts` — `createStockElementAction`,
`updateStockElementAction`, `deleteStockElementAction` — **renamed** to
`createArticleAction`, `updateArticleAction`, `deleteArticleAction`. Their bodies
are unchanged apart from:

- **They all start with `await requireAdmin()`** (from `@/lib/access`), replacing
  the `getCurrentUserAccess()` / `isAdmin` dance. This app is admin-only.
  The `isAdmin` check inside the old delete action becomes redundant — remove it,
  keep the "in a stock" refusal.
- `revalidatePath("/articles")` and `revalidatePath("/stock")` instead of the
  old `revalidateStock()` helper.

In the moved files, rename the symbols to match: `ItemFormModal` →
`ArticleFormModal`, `CreateItemButton` → `CreateArticleButton`,
`StockItemsClient` → `ArticlesClient`, `ItemDraft` → `ArticleDraft`.
`StockItemsPage` → `ArticlesPage`.

`app/app/(app)/articles/page.tsx` changes:
- `await requireAdmin()` instead of `getCurrentUserAccess()`; drop the
  `canDelete={isAdmin(access)}` prop and everything it gated — in an admin-only
  app every viewer can delete.
- Drop the "Back to stock" link from `PageHeader actions`. `/articles` is a
  sidebar app now; it is not somewhere you came from.
- `copy.articles.*` instead of `copy.stock.*` (step 6).

Commit.

---

## Step 4 — `tracksStock` in the UI

**`app/app/(app)/articles/article-form-modal.tsx`** — one `<Checkbox
name="tracksStock">` next to the existing `expireable` checkbox, labelled
`copy.articles.tracksStock` with `copy.articles.tracksStockHint` under it. Default
**checked** for a new article.

Refuse turning it **off** while pieces exist, the same way `expireable` already
is refused, in `updateArticleAction`:

```ts
if (!data.tracksStock) {
  const stocked = await prisma.stockItem.count({ where: { elementId } });
  if (stocked > 0) {
    throw new Error("This article is in a stock. Take it out of every stock before turning stock tracking off.");
  }
}
```

**`app/app/(app)/articles/client.tsx`** — the list already shows an "in stock"
figure per row. For an untracked article that figure is meaningless: draw a
`<Badge tone="neutral">{copy.articles.notStocked}</Badge>` in its place. Same
change in the desktop `<TD>` and in the mobile `<CardletField>` — the row data is
one array, so this is one conditional, not two.

**`app/app/(app)/stock/add-stock-modal.tsx`** and
**`app/app/(app)/stock/page.tsx`** — the element picker must not offer articles
that are not stocked. In `page.tsx`, the `prisma.stockElement.findMany` that feeds
`elements` gains `where: { tracksStock: true }`. Do the same in
`app/app/(app)/stock/items`… *(that path is gone; there is no other element list
in the stock app — if `npm run build` finds one, it is a screen this plan missed,
so filter it there too)*.

Commit.

---

## Step 5 — Navigation

File: `app/components/app-shell.tsx`

- Import `Tags` from `lucide-react`.
- In **`adminNavigation` only**, immediately before the `/stock` item:
  `{ type: "item", href: "/articles", label: copy.articles, icon: Tags },`
  `departmentNavigation` does not get it — the app is admin-only.
- Add `"/articles"` to the `GLOBAL_ROUTES` array. Articles are edition-independent
  like stock; a closed edition must not make them read-only.

File: `app/app/(app)/stock/page.tsx` — the `href="/stock/items"` link in the
header becomes `href="/articles"`, and it is rendered **only for admins**
(`isAdmin(access)`), since that is who the destination now admits. A link that
lands on a thrown "Unauthorized." is worse than no link.

File: `app/app/(app)/stock/actions.ts` — `revalidatePath("/stock/items")` inside
`revalidateStock()` becomes `revalidatePath("/articles")`.

`BAR_HREFS` in `mobile-shell.tsx` is not touched — `/articles` lands in the
"Other" drawer, which is where a fifth app belongs.

Commit.

---

## Step 6 — Copy

File: `app/lib/i18n-dictionaries.ts`, in **both** `en` and `fr`.

Add `shell.articles`: `Articles` / `Articles`.

Add a new top-level `articles` block. Move the catalogue keys out of the `stock`
block — `itemsTitle`, `itemsSubtitle`, `backToStock` and every key only the moved
screens use — and **delete them from `stock`**; leaving a dead key in both
dictionaries is how the two drift. Grep for each key before deleting it: if
anything still under `/stock` reads it, it stays.

New keys:

| Key | en | fr |
|---|---|---|
| `title` | `Articles` | `Articles` |
| `subtitle` | `Everything the festival can stock or sell.` | `Tout ce que le festival peut stocker ou vendre.` |
| `tracksStock` | `Counted in stock` | `Compté en stock` |
| `tracksStockHint` | `Off for something sold but never shelved — a poured glass, not the barrel.` | `Décoche pour ce qui se vend sans être stocké — un verre servi, pas le fût.` |
| `notStocked` | `Not stocked` | `Hors stock` |

Commit.

---

## Step 7 — Docs

- `docs/business-processes.md` — **§10 Stock** loses the catalogue paragraphs;
  append a new numbered section **Articles** at the end (next free number) saying:
  what an article is, that the app is admin-only, that `tracksStock` off means
  sellable-but-never-shelved, that turning it off is refused while pieces exist,
  and that a scan inside "add stock" still creates an article on the fly for any
  signed-in user because that is stock content, not configuration.
- `docs/database.md` — `StockElement` gains `tracksStock` in its field list and
  its description.
- `docs/file-structure.md` — remove the `/stock/items` entry, add `/articles` with
  its four files, add `components/unit-size-fields.tsx` and `lib/articles.ts`.

Commit.

---

## Step 8 — Verify

**Delegate the mechanical half** (see the master's delegation section). In one
message, spawn:

- an agent running `npm run lint`, `npm run check:design` and `npm run build` from
  `app/`, reporting pass/fail and exact failure lines;
- an agent listing every `file:line` under `app/` still referencing `stock/items`,
  `ItemFormModal`, `CreateItemButton` or `createStockElementAction`;
- an agent comparing the `articles` and `stock` blocks of `en` against `fr` in
  `app/lib/i18n-dictionaries.ts` and listing keys present in one and missing from
  the other.

Do the behavioural pass yourself against the local database:

- As an admin: `/articles` lists the catalogue, create/edit/delete all work.
- As a `DEPARTMENT` user: `/articles` is absent from the sidebar and the "Other"
  drawer, and the "manage articles" link on `/stock` is not drawn.
- Create an article with **Counted in stock off** → it does not appear in the
  "add stock" element picker; the list shows "Not stocked" instead of a count.
- Put an article in a stock, then try to turn its flag off → refused with a
  sentence, nothing saved.
- Scan-to-create inside "add stock" as a non-admin still works and produces an
  article with the flag **on**.
- 390px viewport: `/articles` cardlets and the form modal are usable.

Commit anything this changed.

---

## Step 9 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](100-cash-manager-pos.md).
Directive: **`requires-migration`**. Do not monitor the deployment.
