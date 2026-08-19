## Docs
Update /docs when you change a core flow. Never let docs diverge from the
actual implementation. you don´t have to parse this folder upon receiving a prompt unless you redeem it necessary/

## Local database 
You can use it to perform tests. there is no production data into it.

# Git
Keep .gitignore up to date.
each time you do and validate either a bug fix, or a feature, do a git add . and a git commit -am [whatyoudid].
each step of a task (from a todo, e.g.) should represent a commit. 
No branches creation. 

## Design system rules

Design tokens live in `app/app/globals.css` (`:root` for colors, `@theme` for the
radius and micro-type scales) and are the **single source of truth**. Never hardcode a
color, an arbitrary radius (`#0f171f`, `rounded-[28px]`) or a pixel font size
(`text-[11px]`) in a component — pull from the tokens below. Run `npm run check:design`
to catch violations. **Before building UI, reuse what exists**: every shared component
lives in `app/components/ui/` (see the list below) — a screen should almost never write
a border/background/height recipe of its own.

**Aesthetic direction: dense and functional.** No large paddings, no heavy rounding,
few decorative elements. Prefer flat, token-driven surfaces over gradients, glows, and
large shadows.

**Colors** are the eight Baleinev tokens, used via Tailwind arbitrary values like
`bg-[var(--panel)]` or `text-[var(--muted)]` — do not introduce new hardcoded hex:

- `--page` — app background
- `--panel` / `--panel-strong` — surface backgrounds (strong = raised/nested)
- `--line` — borders and dividers
- `--ink` — primary text
- `--muted` — secondary text and labels
- `--accent` / `--accent-strong` — primary action color and its hover/pressed state

Destructive/error states use Tailwind `rose-*` utilities directly
(e.g. `border-rose-400/30 bg-rose-950/30 text-rose-200`).

**Components** — import from `@/components/ui`. If a screen needs a surface, a control
or a heading, one of these already covers it:

| Need | Use |
|---|---|
| Page title block | `<PageHeader eyebrow title description actions>` |
| Padded surface | `<Card span dashed>` inside `<CardGrid>` |
| Frame around flush content (tables, lists) | `<Panel>` + `<PanelHeader>` + `<SectionTitle>` |
| Surface nested in a Card/Modal | `<Panel nested>` or `nestedSurfaceClasses` |
| Action | `<Button variant size>` · `buttonClasses()` for links that read as buttons |
| Icon-only action | `<IconButton tone size label>` · `iconButtonClasses()` for non-buttons |
| Fields | `<Field>` + `<Input>` / `<Textarea>` / `<Select>` / `<MultiSelect>` / `<Checkbox>` / `<Radio>` |
| Table | `<Table frame dense desktopOnly>` + `<THead>` `<TR>` `<TH>` `<TD>` `<TFoot>` |
| Wide table on a phone | `<CardletList>` + `<Cardlet>` `<CardletHeader>` `<CardletFields>` `<CardletField>` `<CardletActions>` |
| Status pill / removable token | `<Badge tone>` · `<Chip>` + `<ChipRemoveButton>` |
| Inline message | `<Alert tone>` (`<FormError>` wraps it for server-action errors) |
| Dialog | `<Modal open onClose title size footer>` |

**Control size** is a two-step scale shared by `Button`, `IconButton`, `Input` and
`Select` (`app/components/ui/control.ts`) — this is what keeps a field and the button
next to it the same height:
- `md` (`h-10`, default) — section forms, modal footers, page-level actions
- `sm` (`h-8`) — table/list-row actions and toolbars

Those are the **desktop** heights. Below `lg` both sizes are `h-11` (44px), the
minimum touch target — the scale is responsive so no screen ever hand-sizes a control
for mobile. Everything in one row uses one size. Never hand-size a control (`h-9`,
`py-1.5` on a button); if a size is missing, change the scale, not the screen.

**Type scale**: `text-3xs` (10px) and `text-2xs` (11px) are tokens for micro labels;
above that use Tailwind's `text-xs`/`text-sm`. Headings are `text-3xl` (page, via
`PageHeader`), `text-xl` (modal title) and `text-lg` (section, via `SectionTitle`).

**Radius** is a deliberately tight scale defined as tokens in `@theme`, so every
`rounded-*` utility already resolves to it. Use the utilities — never an arbitrary
`rounded-[Npx]`:
- Buttons, inputs, selects and other controls: `rounded-md` (5px)
- Cards, panels and modals: `rounded-2xl` (10px) — the heaviest rounding in the app
- Tables and nested surfaces: `rounded-xl` (8px)
- Small chips / list rows: `rounded-lg` (8px) or `rounded-sm` (3px)
- Pills, badges, status dots, count bubbles, avatars: `rounded-full`

`rounded-full` is only for genuinely circular/pill elements (badges, dots, avatars) —
action buttons are `rounded-md`, not pills.

**Spacing** comes from Tailwind utilities on the 4px grid — the utilities *are* the
scale, there are no `--space-*` tokens (never write `var(--space-…)`). Dense elements
use `p-2`–`p-3`; cards use `p-4`–`p-5`. Vertical rhythm is `space-y-*` / `gap-*`. Keep
it functional — no gratuitous padding.

**Responsive** — `lg` (1024px) is the one structural breakpoint: above it the sidebar
shell and the dense control heights, below it the mobile bottom bar
(`components/mobile/`) and 44px touch targets. Wide tables switch earlier, at `sm`:
`<Table desktopOnly>` above, `<CardletList>` below, both fed by the same array.
`Card`/`CardGrid` spans already stack to one column below `sm` — never add a
`grid-cols-*` without a mobile override.

UI copy rules:
- Name things by what they do, not what they are internally
- No explanatory labels that state the obvious
- Empty states give direction, not mood
- Errors say what happened and what to do