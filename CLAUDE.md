## Docs
Update /docs when you change a core flow. Never let docs diverge from the
actual implementation. you don´t have to parse this folder upon receiving a prompt unless you redeem it necessary/


# Git
Keep .gitignore up to date.
each time you do and validate either a bug fix, or a feature, do a git add . and a git commit -am [whatyoudid].
each step of a task (from a todo, e.g.) should represent a commit. 
No branches creation. 

## Design system rules

All design tokens are defined in `app/app/globals.css` as CSS variables. Never use
a hardcoded color, spacing, or radius value outside that file.

**Aesthetic direction:** dense and functional.  No large paddings, no heavy rounding, few decorative elements. 


Component padding standard: `var(--space-2)` to `var(--space-3)` for dense
elements, `var(--space-4)` maximum for cards. Default border-radius is
`var(--radius-sm)`.

UI copy rules:
- Name things by what they do, not what they are internally
- No explanatory labels that state the obvious
- Empty states give direction, not mood
- Errors say what happened and what to do