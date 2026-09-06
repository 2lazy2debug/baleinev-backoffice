# 103 — POS templates

> **Done** — shipped in v0.36.0 on 2026-09-06.

**Read [100-cash-manager-pos.md](../100-cash-manager-pos.md) first** — the shared
context, the ground rules, the delegation policy and the release protocol live
there. Then work from that file and this one only. Do not read 101, 102 or
104–107; their context is not yours.

**Needs 101** (the articles app), because a template cell points at a
`StockElement` and the picker offers the catalogue.

## What this builds

A **template** is a saved till layout: a paginated 3×3 grid where each tile is an
article, a label and a price. It is what a bar picks when it opens for the night,
and the same article can be CHF 4 on one template and CHF 5 on another — **the
price lives on the cell, never on the article.**

Two screens, both admin-only: a list at **`/pos/templates`** and a grid editor at
**`/pos/templates/[templateId]`**. Nothing sells anything yet; that is 104.

Ships as **`requires-migration`**.

---

## The grid, decided

- A page is **3×3 = 9 tiles**. The **bottom-right tile of every page is always
  "Custom sale"** and is never stored — the renderer draws it. Same tile, same
  place, every page: a bar hits it without looking.
- That leaves **8 article slots per page**. `position` is a 0-based slot index
  across the whole template: `page = Math.floor(position / 8)`,
  `slot = position % 8`. Put `POS_PAGE_SLOTS = 8` in `app/lib/cash.ts` next to
  the denominations and import it — three files need it and none of them may
  hardcode an 8.
- **A page may have holes.** Removing a tile frees its slot and leaves the others
  where they are; muscle memory beats compaction. There is no drag-to-reorder in
  this plan, and no auto-fill.
- **A negative price is valid** — a bottle deposit coming back is a tile that
  takes money out of the till. Do not validate for positivity anywhere in this
  plan.

---

## Step 1 — The schema

File: `app/prisma/schema.prisma`

```prisma
/// A saved till layout: which articles a bar sells, at what price, in what
/// order on the grid. Prices live here rather than on the article, so the same
/// beer can be CHF 4 at one bar and CHF 5 at another on the same night.
model PosTemplate {
  id        String   @id @default(cuid())
  editionId String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  edition Edition           @relation(fields: [editionId], references: [id], onDelete: Cascade)
  cells   PosTemplateCell[]

  @@unique([editionId, name])
  @@index([editionId])
}

/// One tile. `position` is a 0-based slot index across the whole template;
/// eight slots make a page and the ninth tile of every page is the "custom
/// sale" button, which is drawn rather than stored.
///
/// `label` is a snapshot taken from the article when the tile was made and is
/// then free text: a bar tile says "Beer 3dl", not "Feldschlösschen Original
/// 30cl". Renaming the article later does not rewrite the tile.
model PosTemplateCell {
  id         String  @id @default(cuid())
  templateId String
  position   Int
  elementId  String
  label      String
  /// Negative is allowed and meaningful — a deposit handed back.
  price      Decimal @db.Decimal(10, 2)

  template PosTemplate  @relation(fields: [templateId], references: [id], onDelete: Cascade)
  element  StockElement @relation(fields: [elementId], references: [id], onDelete: Restrict)

  @@unique([templateId, position])
  @@index([elementId])
}
```

Back-relations: `Edition.posTemplates PosTemplate[]` and
`StockElement.posCells PosTemplateCell[]`.

`element` is `Restrict`: an article a template sells cannot be deleted out from
under it. The delete action in the articles app will surface Prisma's failure —
give it a sentence instead, in step 5.

Run `npx prisma generate` from `app/`, then hand-write
`app/prisma/migrations/<YYYYMMDDHHMMSS>_pos_templates/migration.sql` — both
tables, both foreign-key sets, the two unique indexes and the two indexes.

Commit.

---

## Step 2 — Actions

New file `app/app/(app)/pos/actions.ts`. Every action here starts with
`await requireAdmin()` and `await resolveWritableEditionId()` — a template is
configuration, and a closed edition does not get new ones.

```ts
export async function createPosTemplateAction(_prevState, formData): Promise<ActionState>   // name
export async function renamePosTemplateAction(_prevState, formData): Promise<ActionState>   // templateId, name
export async function deletePosTemplateAction(_prevState, formData): Promise<ActionState>   // templateId
export async function setPosTemplateCellAction(_prevState, formData): Promise<ActionState>  // templateId, position, elementId, label, price
export async function clearPosTemplateCellAction(_prevState, formData): Promise<ActionState> // templateId, position
```

Rules:

- Every action re-checks that the template belongs to the resolved edition →
  `"That template no longer exists. Refresh and try again."` Never trust a
  `templateId` from a form.
- `name` duplicated in the edition → `"A template with that name already exists."`
  Catch it explicitly; do not let the unique index throw a Prisma error at the
  user.
- `setPosTemplateCellAction` is an **upsert** on `@@unique([templateId, position])`
  — the same call creates a tile and edits one, so the editor has one dialog and
  one code path.
- `price`: accept `,` as a decimal separator (`raw.replace(",", ".")`, the
  convention in `journal/actions.ts`), require a finite number, and **allow
  negatives and zero**. Store as a `Decimal` string with two decimals.
- `position` must be a non-negative integer → `"That slot is not valid."`
- `elementId` must exist → `"That article no longer exists."` The picker only
  offers real ones, but a stale tab is a real thing.
- Deleting a template cascades its cells. In 103 nothing else points at a
  template, so no further guard is needed — 104 adds one.
- All of them `revalidatePath("/pos/templates")` and, where a `templateId` is in
  hand, `revalidatePath(`/pos/templates/${templateId}`)`.

Commit.

---

## Step 3 — The list screen

New files:

- `app/app/(app)/pos/templates/page.tsx` (server) — `requireAdmin()`,
  `resolveEditionIdOrNull()` (null → the standard "no edition" `<EmptyPage>`),
  then the edition's templates with `_count: { select: { cells: true } }`.
  `<PageHeader eyebrow={copy.pos.title} title={copy.pos.templatesTitle}
  description actions>`; the action is the create button, wrapped in
  `<WritableEditionOnly>`.
  No templates yet → `<EmptyPage>` with direction, not a bare header.
- `app/app/(app)/pos/templates/create-template-modal.tsx` (`"use client"`) — the
  standard header-button-plus-`<Modal>` pair. One `<Field>` + `<Input name="name">`,
  submit in the modal `footer` reaching the form by `form=…`, `useActionState`,
  `<FormError>`, `useCloseOnSuccess`. Copy the shape from
  `app/components/tasks-create-modal.tsx`. **Do not write an inline create form.**
- `app/app/(app)/pos/templates/client.tsx` (`"use client"`) — the list, as a
  `<Panel flushOnMobile>` around a `<Table desktopOnly dense>` plus a
  `<CardletList>` below `sm`, both fed by one array. Columns: name, tile count,
  page count (`Math.max(1, Math.ceil(cellCount / POS_PAGE_SLOTS))` — but derive it
  from the highest `position`, not the count, because a page may have holes).
  Row actions: a link to the editor, a rename `IconButton`, a delete
  `IconButton tone="danger"` behind a confirm.

Commit.

---

## Step 4 — The grid editor

New files:

- `app/app/(app)/pos/templates/[templateId]/page.tsx` (server) — `requireAdmin()`,
  load the template with its cells ordered by `position`, and the articles the
  picker offers: `prisma.stockElement.findMany({ orderBy: { name: "asc" } })`.
  **Every article, including ones with `tracksStock` off** — that flag is exactly
  what makes a poured glass sellable. Not found → `notFound()`.
  `<PageHeader>` with the template name as the title, `eyebrow={copy.pos.title}`,
  and a back link to `/pos/templates` in `actions` using
  `buttonClasses("secondary", "md", compactOnMobileWidths.md)`, as
  `app/app/(app)/articles/page.tsx`'s neighbours do.
- `app/app/(app)/pos/templates/[templateId]/grid-editor.tsx` (`"use client"`) —
  the editor:
  - `const [page, setPage] = useState(0)` and a pager row: a `ChevronLeft`
    `IconButton`, `copy.pos.pageOf` with the numbers, a `ChevronRight`
    `IconButton`. The last page is one past the highest used page **when that page
    has at least one tile**, so "add a page" is just paging right — there is no
    "add page" button and no page record to keep.
  - A `grid grid-cols-3 gap-2` of nine tiles. Slots 0–7 of the page are cells;
    the ninth is a static, non-interactive `copy.pos.customSale` tile drawn with
    the same recipe but muted, so the editor shows the layout the till will show.
  - An empty slot is a `<button>` with the dashed-surface look — reuse
    `<Card dashed>`'s classes via the component, do not re-invent a dashed border.
    A filled slot shows the label, the price via `formatCurrency`, and the article
    name muted underneath in `text-2xs`.
  - Tapping any slot opens **one** `<Modal>` (rendered once, driven by
    `useState<{ position: number; cell: Cell | null } | null>`): a `<Suggest>` or
    `<Select>` over the articles, a label `<Input>` that **prefills from the
    picked article's name and stays editable**, a price `<Input inputMode="decimal">`,
    and — when editing an existing tile — a "Remove from grid" button calling
    `clearPosTemplateCellAction`.
  - Both actions go through `useActionState`; on success `router.refresh()` and
    close.
  - A tile is a touch target first. The grid is the same 3×3 at every width — do
    **not** collapse it to one column on a phone; that is the one layout in this
    app that is *already* mobile-shaped.

Commit.

---

## Step 5 — Guard the article delete

File: `app/app/(app)/articles/actions.ts` (created by 101),
`deleteArticleAction`.

Before deleting, alongside the existing "in a stock" check:

```ts
const onTemplates = await prisma.posTemplateCell.count({ where: { elementId } });
if (onTemplates > 0) {
  throw new Error("This article is on a POS template. Remove it from every template before deleting it.");
}
```

Without this the `Restrict` foreign key throws a raw Prisma error at the user.

Commit.

---

## Step 6 — Navigation and copy

File: `app/components/app-shell.tsx` — import `LayoutGrid` from `lucide-react`
and add `{ type: "item", href: "/pos", label: copy.pos, icon: LayoutGrid },` to
`adminNavigation`, right after the `/cash` item if it is there and otherwise after
`/cost-centers`. **`departmentNavigation` does not get it in this plan** — there
is nothing at `/pos` for a non-admin until 104 opens sessions.
`/pos` is edition-scoped, so it stays out of `GLOBAL_ROUTES`. `BAR_HREFS` is not
touched.

Because the nav points at `/pos` and only `/pos/templates` exists, add
`app/app/(app)/pos/page.tsx` as a one-line `redirect("/pos/templates")`. 104
replaces it with the real screen.

File: `app/lib/i18n-dictionaries.ts`, both `en` and `fr`: `shell.pos`
(`Point of sale` / `Caisse enregistreuse`) and a new `pos` block:

| Key | en | fr |
|---|---|---|
| `title` | `Point of sale` | `Caisse enregistreuse` |
| `templatesTitle` | `Templates` | `Grilles` |
| `templatesSubtitle` | `The grid a bar sells from, and what each tile costs.` | `La grille depuis laquelle un bar vend, et le prix de chaque case.` |
| `newTemplate` | `New template` | `Nouvelle grille` |
| `noTemplates` | `No template yet` | `Aucune grille` |
| `noTemplatesHint` | `Build a grid of articles and prices, then a bar can open on it.` | `Compose une grille d'articles et de prix, puis un bar pourra l'ouvrir.` |
| `templateName` | `Name` | `Nom` |
| `tiles` | `Tiles` | `Cases` |
| `pages` | `Pages` | `Pages` |
| `pageOf` | `Page {page} of {total}` | `Page {page} sur {total}` |
| `editGrid` | `Edit the grid` | `Modifier la grille` |
| `emptySlot` | `Add` | `Ajouter` |
| `customSale` | `Custom sale` | `Vente libre` |
| `article` | `Article` | `Article` |
| `tileLabel` | `Label on the tile` | `Texte de la case` |
| `price` | `Price` | `Prix` |
| `priceHint` | `Negative for money handed back, like a deposit.` | `Négatif pour de l'argent rendu, une consigne par exemple.` |
| `removeTile` | `Remove from grid` | `Retirer de la grille` |

`pageOf` takes placeholders — interpolate with `.replace()`, the way the existing
dictionary entries with braces are used.

Commit.

---

## Step 7 — Docs

- `docs/business-processes.md` — append a new numbered section **Point of sale**
  with a "Templates" subsection: what a template is, that it is per edition and
  admin-only, that eight tiles make a page and the ninth is always custom sale,
  that the price is on the tile and not on the article, that a negative price is
  legal, and that removing a tile leaves its slot empty on purpose.
- `docs/database.md` — `PosTemplate`, `PosTemplateCell`, and the back-relations on
  `Edition` and `StockElement`.
- `docs/file-structure.md` — the `/pos` route with every file added here.

Commit.

---

## Step 8 — Verify

**Delegate the mechanical half** (see the master's delegation section): one agent
on `npm run lint`, `npm run check:design`, `npm run build`; one agent on `en`/`fr`
parity for the `pos` block and `shell.pos`.

Do the behavioural pass yourself against the local database:

- Create a template, open the editor, fill slot 0 → the tile shows label and
  price, the custom-sale tile is bottom-right.
- Fill all eight slots, page right → an empty page 2 appears; leave it empty and
  page back → the pager says 1 of 1 again.
- Edit a tile, then remove it → the slot goes empty and its neighbours do not
  move.
- A negative price saves and displays as a negative amount.
- Duplicate template name → refused with a sentence, not a Prisma error.
- Delete an article that a template uses → refused with the new sentence.
- An article with `tracksStock` off is offered in the tile picker.
- A closed edition: the create button is gone and every action refuses.
- A `DEPARTMENT` user: `/pos` is not in the sidebar or the drawer, and
  `/pos/templates` throws "Unauthorized."
- 390px viewport: the 3×3 grid stays 3×3, tiles are comfortable touch targets,
  the tile modal is usable.

Commit anything this changed.

---

## Step 9 — Release

Follow **Release protocol** in [100-cash-manager-pos.md](../100-cash-manager-pos.md).
Directive: **`requires-migration`**. Do not monitor the deployment.
