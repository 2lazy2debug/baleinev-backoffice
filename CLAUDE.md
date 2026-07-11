## Docs
Update /docs when you change a core flow. Never let docs diverge from the
actual implementation. you don´t have to parse this folder upon receiving a prompt unless you redeem it necessary/


# Git
Keep .gitignore up to date.
each time you do and validate either a bug fix, or a feature, do a git add . and a git commit -am [whatyoudid].
each step of a task (from a todo, e.g.) should represent a commit. 
No branches creation. 

## Design system rules

Design tokens live in `app/app/globals.css` (`:root` for colors, `@theme` for the
radius scale) and are the **single source of truth**. Never hardcode a color or an
arbitrary radius (`#0f171f`, `rounded-[28px]`) in a component — pull from the tokens
below. Run `npm run check:design` to catch violations. Before building UI, reuse what
exists: shared components in `app/components/` and the button styles in
`app/lib/button-classes.ts`.

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

**Radius** is a deliberately tight scale defined as tokens in `@theme`, so every
`rounded-*` utility already resolves to it. Use the utilities — never an arbitrary
`rounded-[Npx]`:
- Buttons and most controls: `rounded-md` (5px)
- Inputs / selects: `rounded-md`–`rounded-xl` (5–8px)
- Cards and panels: `rounded-2xl` (10px) — the heaviest rounding in the app
- Small chips / list rows: `rounded-lg` (8px) or `rounded-sm` (3px)
- Pills, badges, status dots, count bubbles, avatars: `rounded-full`

`rounded-full` is only for genuinely circular/pill elements (badges, dots, avatars) —
action buttons are `rounded-md`, not pills.

**Spacing** comes from Tailwind utilities on the 4px grid — the utilities *are* the
scale, there are no `--space-*` tokens (never write `var(--space-…)`). Dense elements
use `p-2`–`p-3`; cards use `p-4`–`p-5`. Vertical rhythm is `space-y-*` / `gap-*`. Keep
it functional — no gratuitous padding.

UI copy rules:
- Name things by what they do, not what they are internally
- No explanatory labels that state the obvious
- Empty states give direction, not mood
- Errors say what happened and what to do