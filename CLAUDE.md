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
| Page title block | `<PageHeader eyebrow title description actions controls>` |
| Screen with nothing to show yet | `<EmptyPage eyebrow title>` — never a `PageHeader` alone |
| One of two panels on a phone | `<SegmentedControl options value onChange>` in `<PageHeader controls>` |
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
`PageHeader`, `text-xl` on the mobile top bar), `text-xl` (modal title) and `text-lg`
(section, via `SectionTitle`).

**Radius** is a deliberately tight scale defined as tokens in `@theme`, so every
`rounded-*` utility already resolves to it. Use the utilities — never an arbitrary
`rounded-[Npx]`:
- Buttons, inputs, selects and other controls: `rounded-md` (5px)
- Cards, panels and modals: `rounded-2xl` (10px)
- The mobile bottom sheet: `rounded-t-4xl` (18px) — the heaviest rounding in the app,
  and the sheet is the only thing that gets it
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
(`components/mobile/`), the sticky top bar and 44px touch targets. Wide tables switch
earlier, at `sm`: `<Table desktopOnly>` above, `<CardletList>` below, both fed by the
same array. `Card`/`CardGrid` spans already stack to one column below `sm` — never add
a `grid-cols-*` without a mobile override.

**Cards in one row are the height of the tallest.** `<CardGrid>` stretches its items,
so a row of cards reads as one band instead of a ragged edge. This is a rule, not a
default to be turned off: never write `items-start` (or `self-start` on a `<Card>`) to
let a card shrink to its content. A card that looks empty beside a tall neighbour is a
content or `span` problem. Below `sm` every span is `col-span-12`, so a row holds one
card and there is nothing to equalise — the rule is desktop-only for free, with no
media query.

**A phone screen is a bar, a body and a bar.** Below `lg` the bottom bar names the
app and `<PageHeader>` becomes the top bar: full-bleed, sticky, on `--panel`, closed
by a rule. What that means when you build a screen:
- **Never hand-roll a mobile header.** No screen sets its own sticky strip, its own
  title size or its own `-mx-4` bleed. The bleed cancels `<main>`'s `p-4` gutter —
  those two are one decision, and they live in `PageHeader` and `app-shell.tsx`.
- **`PageHeader` must be the first element on the page**, or the bleed has nothing to
  cancel and the bar sticks to the wrong edge.
- **The description is desktop-only.** Write it as explanation. If the one line the
  screen needs is *direction* — "pick an edition first" — the screen is an
  `<EmptyPage>`, where that line is content and a phone still sees it.
- **A screen's own controls go in `<PageHeader controls>`**, not in a strip below it:
  a tab switcher or a search that scrolls away from the list it filters is a control
  in the wrong place.
- **Never say the same word twice on one screen.** If a `<SegmentedControl>` segment
  or the page title already names a section, its heading is `<SectionTitle desktopOnly>`
  and its frame is `<Card flushOnMobile>` — a cardlet is already a surface.
- **Copy cannot name desktop furniture.** There is no sidebar below `lg`; "pick an
  edition in the sidebar" is wrong on half the devices that read it.

**Making a screen work on a phone is a design-system change, not a screen change.**
The order to try things in, and it is strict:
1. **Reuse a primitive.** The table is `<CardletList>`, the toggle is
   `<SegmentedControl>`, the empty screen is `<EmptyPage>`, the dialog is
   `<Modal mobileFullScreen>`. Feed the mobile view the *same array* the desktop view
   reads — never a second status mapping, a second running balance or a second query.
2. **Add a prop to the primitive** when the rule is general — `desktopOnly`,
   `flushOnMobile`, `controls` all started as one screen's problem. Name it after the
   rule, document it in the component, and every later screen gets it for free.
3. **A layout class on the screen** — `w-full sm:w-auto`, `flex-col sm:flex-row` — is
   the last resort, and only ever about *layout*. Heights, colors, radii and type come
   from the scales; a screen that reaches for `h-11` or `text-[13px]` is a scale that
   needs fixing, not a screen that needs an exception.

**A mockup in `docs/plans/` is the approved target state.** A plan lands in that folder
because the look it draws was decided on, so where a mockup and the app disagree, the
app is what's out of date. An 18px radius or a 13.5px type size in a mockup is not a
violation to correct back to the current scale — it is a change *to* the scale.

The tokens stay the single source of truth in code, so the way to honour a mockup is to
move its value into the scale — `:root`, `@theme`, `control.ts`, the primitive in
`components/ui/` — and then build the screen from the token as always. Never paste a
mockup's raw CSS into a component; `npm run check:design` keeps that honest. The value
is the mockup's, the plumbing is still the design system's, and every other screen picks
up the change for free.

Two things follow from that:
- **Editing a token repaints the whole app.** That reach is the point of having one, but
  say what else moves before you change it, and look at the screens that share it.
- **A mockup decides what it is about, not everything it draws.** A plan to restyle a
  button decides buttons; the fields and panels it happens to render around them are
  backdrop, and a stale backdrop is not an instruction to touch them. When it is
  genuinely unclear whether something is the subject or the backdrop, ask.

UI copy rules:
- Name things by what they do, not what they are internally
- No explanatory labels that state the obvious
- Empty states give direction, not mood
- Errors say what happened and what to do