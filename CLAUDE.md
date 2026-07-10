## Docs
Update /docs when you change a core flow. Never let docs diverge from the
actual implementation. you don´t have to parse this folder upon receiving a prompt unless you redeem it necessary/


# Git
Keep .gitignore up to date.
each time you do and validate either a bug fix, or a feature, do a git add . and a git commit -am [whatyoudid].
each step of a task (from a todo, e.g.) should represent a commit. 
No branches creation. 

## Design system rules

**Colors** are the only CSS-variable tokens, defined in `:root` in `app/app/globals.css`.
Use these variables (via Tailwind arbitrary values like `bg-[var(--panel)]` or
`text-[var(--muted)]`) — do not introduce new hardcoded hex colors:

- `--page` — app background
- `--panel` / `--panel-strong` — surface backgrounds (strong = raised/nested)
- `--line` — borders and dividers
- `--ink` — primary text
- `--muted` — secondary text and labels
- `--accent` / `--accent-strong` — primary action color and its hover/pressed state

There are **no** `--space-*` or `--radius-*` tokens. Spacing and rounding come from Tailwind
utilities, and destructive/error states use Tailwind `rose-*` utilities directly
(e.g. `border-rose-400/30 bg-rose-950/30 text-rose-200`). Never write `var(--space-…)` or
`var(--radius-…)` — those variables are undefined and render as no spacing/no rounding.

**Radius conventions (match the surrounding element):**
- Inputs, buttons, and most controls: `rounded-xl`
- Pills, badges, and icon buttons: `rounded-full`
- Cards and panels: `rounded-2xl` (or `rounded-[28px]` for large outer cards)
- Small chips / list rows: `rounded-lg`

**Spacing:** dense elements use `p-2`–`p-3`; cards use `p-4`–`p-5`. Vertical rhythm is
`space-y-*` / `gap-*`. Keep it functional — few decorative elements, no gratuitous padding.

UI copy rules:
- Name things by what they do, not what they are internally
- No explanatory labels that state the obvious
- Empty states give direction, not mood
- Errors say what happened and what to do