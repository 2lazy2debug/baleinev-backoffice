# design consistency check and improvements
You recently implemented @docs/plans/done/003_design_system_update plan. 

## improvements before check
### sidebar collapse behaviour : 
- sign out label should be replaced with the sign out icon
- username should disappear
- the expand arrow should now lay between the settings icon and the sign out icon vertically
-- the three icons aforementioned should be aligned and same-sized

### text size in buttons
- text size in buttons should be reduced by 1 or 2 pts overall.

## consistency check and correction

when browsing the website, i can still see different button sizes. 
Eg : /events page : "new event type" and "new event" button differ in height

another issue, always in /events, sometimes elements aren't the same size in the same row : 
"name" "description" "new event type" aren´t consistent in height (the button has a smaller height)

please parse the codebase and ensure that : 
- hardcoded elements disappear as much as possible
- centralize components as indicated in the design system aforementioned
- make sure again that all elements across the platform are consistent to eachother. 
---

## Outcome (shipped in v0.10.0)

**Sidebar collapse** — collapsed rail shows settings, the expand arrow and sign out as
three `h-10 w-10` icon buttons stacked vertically, no user name, no labels; nav icons
centre and the pending-task count degrades to a dot. `SignOutButton` is now built on
`Button`/`IconButton` instead of its own classes.

**Button text** — `md` dropped `text-sm` → `text-xs`, `sm` dropped `text-xs` →
`text-2xs` (a new token, with `text-3xs`, replacing every `text-[11px]`/`text-[10px]`).

**The size mismatch** — every control now takes its height from one scale
(`components/ui/control.ts`): `md` = `h-10`, `sm` = `h-8`, applied by `Button`,
`IconButton`, `Input` and `Select` alike. Fields were `px-4 py-3` (46–48px) next to
`h-10` buttons; that is what made "name / description / new event type" ragged. The
usage rule is now: **md for section forms, modal footers and page actions; sm for
table/list-row actions and toolbars; one size per row.**

**Centralisation** — new shared pieces: `PageHeader` (replaced 27 copied heading
blocks), `Panel`/`PanelHeader`/`SectionTitle` + `nestedSurfaceClasses`, `Alert`,
`Chip`/`ChipRemoveButton`, `Radio`, `MultiSelect`, `buttonClasses()`/
`iconButtonClasses()` for links and `<summary>` elements that read as buttons, plus
`Table` gaining `frame`/`dense` and owning cell padding. Section headings collapsed
from `text-xl`+`text-lg` to one `SectionTitle`; page roots to `space-y-8`; the tasks
page dropped its inverted panel nesting.

**Guardrails** — `npm run check:design` now also fails on hand-rolled panels, nested
surfaces, page headers, off-scale control heights and `text-[Npx]`. `CLAUDE.md` and
`docs/file-structure.md` document what to reach for.
