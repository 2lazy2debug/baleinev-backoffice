# Baleinev Backoffice — Design System

Companion to `AUDIT.md`. Structured Foundations → Atoms → Components, a taxonomy borrowed
(structure only, not visuals) from GoodBarber's design-system docs. Drop this file and
`design-system/components/` into the repo; point Claude Code at it before touching UI.

Aesthetic direction is unchanged: dense, functional, dark. The refresh here is
consistency and a few small additions (a warning tone, an icon-size scale, a modal-size
scale) — not a repaint.

## 1. Foundations

### Color tokens (`app/app/globals.css` — unchanged, already the source of truth)
`--page`, `--panel`, `--panel-strong`, `--line`, `--ink`, `--muted`, `--accent`,
`--accent-strong`.

### Semantic action colors (new — formalizes what row-actions already do ad hoc)
Use raw Tailwind utilities, same as the existing destructive convention in `CLAUDE.md`
— these are states, not brand colors, so they don't get CSS tokens:

| Meaning | Color |
|---|---|
| Success / paid / confirm | `emerald-300` / `emerald-950/40` |
| Destructive / delete | `rose-300` / `rose-950/40` |
| Warning / needs attention (e.g. "mark unpaid") | `amber-300` / `amber-950/40` |
| Neutral action | `[var(--muted)]` / `[var(--panel-strong)]` |
| Primary / edit / brand action | `[var(--accent)]` |

### Radius scale (unchanged)
`sm` 3px (chips/rows) · `md` 5px (buttons, controls) · `lg`/`xl` 8px (inputs) · `2xl` 10px
(cards, modals — the heaviest rounding) · `full` (pills, badges, avatars). **Never use
bare `rounded`** — it resolves to Tailwind's default 4px, outside this scale.

### Icon size scale (new)
One size for nearly everything, one for the rare oversized case:

| Context | Size |
|---|---|
| All icon buttons, nav icons, inline row-action icons | `h-4 w-4` |
| Modal close (`X`) | `h-5 w-5` |

Drop `h-3 w-3` and `h-3.5 w-3.5` — they only existed because row actions were hand-sized
per screen.

### Spacing
Tailwind's 4px scale, no custom tokens. Dense elements: `p-2`–`p-3`. Cards/panels:
`p-5`–`p-6`. Section rhythm: `space-y-4`/`gap-4` between fields, `space-y-8` between page
sections.

### Elevation
Two levels only: flat (default — cards, inline panels, no shadow) and raised
(`shadow-lg` — modals, always). Every modal gets `shadow-lg`; nothing else does.

## 2. Components

All in `design-system/components/`, zero new dependencies (no `clsx`/`cva` — a 3-line
`cn()` helper). Copy the folder to `app/components/ui/` in the app repo.

### Button
```tsx
import { Button } from "@/components/ui/Button";
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="destructive">Delete department</Button>
```
One height per size — `md` (`h-10`, default) or `sm` (`h-8`, for dense inline contexts
like a table toolbar). Every button of the same size is the same height, full stop; no
more `px-4 py-2` vs `px-5 py-3` vs borderless variants for the same job.

### IconButton — action icons, color = action type
```tsx
import { IconButton } from "@/components/ui/IconButton";
import { Pencil, Trash2 } from "lucide-react";
<IconButton tone="accent" label="Edit"><Pencil /></IconButton>
<IconButton tone="delete" label="Delete"><Trash2 /></IconButton>
```
`tone`: `neutral` (grey, default action) · `accent` (teal, edit) · `save` (emerald) ·
`delete` (rose) · `warning` (amber). Fixed `h-9 w-9` square, fixed `h-4 w-4` icon — one
size everywhere, no more `p-1.5` vs `p-2` vs bespoke `h-4 w-4` wrappers.

### Card — sized as fractions of the working area
```tsx
import { Card, CardGrid } from "@/components/ui/Card";
<CardGrid> {/* grid grid-cols-12 gap-4 */}
  <Card span="1/3">…</Card>
  <Card span="2/3">…</Card>
  <Card span="full" dashed>No departments yet.</Card>
</CardGrid>
```
`span`: `1/4` · `1/3` · `1/2` · `2/3` · `full` (there's no literal "1" — `full` reads
clearer for a whole-row card). `dashed` gives the empty-state treatment. Always
`rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5` underneath —
this is also the fix for the dashboard's borderless `rounded-3xl` cards.

### Field, Input, Textarea, Select — one text-field style
```tsx
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
<Field label="Department name">
  <Input name="name" required />
</Field>
<Field label="Type">
  <Select name="accountType"><option value="CHARGES">Charges</option></Select>
</Field>
```
One recipe (`rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3`) shared
by `Input`, `Textarea`, and `Select` via one `inputClasses` constant — change it once,
every field updates. `Select` adds a consistent chevron icon so dropdowns finally look
like part of the same system instead of bare OS controls. Both `Input` and `Select` take
`size="compact"` for the one legitimate dense case (e.g. a sidebar picker) — a named,
intentional variant instead of an undocumented one-off.

### Checkbox
```tsx
import { Checkbox } from "@/components/ui/Checkbox";
<Checkbox id="everyone" name="audience" value="@everyone" label="Everyone" />
```
Every checkbox in the app renders through this from now on — fixes the 4 of 5 that are
currently unstyled.

### Modal — one implementation, one size scale
```tsx
import { Modal } from "@/components/ui/Modal";
<Modal open={isOpen} onClose={close} title="Add department" size="sm" footer={<>
  <Button variant="secondary" onClick={close}>Cancel</Button>
  <Button variant="primary" type="submit" form="dept-form">Save</Button>
</>}>
  <form id="dept-form">…</form>
</Modal>
```
`size`: `sm` (max-w-md) · `md` (max-w-lg, default) · `lg` (max-w-2xl) · `xl` (max-w-3xl) ·
`full` (95vw/90vh, for the rare data-dense case like budget's department details).
Handles backdrop, Escape-to-close, always `shadow-lg`, one close-button treatment. This
replaces both existing modal patterns (two-div and flex-wrapper) with one.

### Badge — status pills
```tsx
import { Badge } from "@/components/ui/Badge";
<Badge tone="success">Paid</Badge>
<Badge tone="warning">Unpaid</Badge>
<Badge tone="neutral">Default</Badge>
```
`tone`: `success` · `error` · `warning` · `info` · `neutral`. One size, one tracking value
— replaces the 7 independent pill recipes found in the audit.

### Table
```tsx
import { Table, THead, TR, TH, TD, TFoot } from "@/components/ui/Table";
<Table>
  <THead><TR><TH>Label</TH><TH className="text-right">Amount</TH></TR></THead>
  <tbody>{rows.map(r => <TR key={r.id}><TD>{r.label}</TD><TD className="text-right">{r.amount}</TD></TR>)}</tbody>
</Table>
```
Standardizes the header background (`--panel-strong`) and treatment
(uppercase, tracked) that today splits three ways across screens.

## 3. Adoption checklist
- [ ] Copy `design-system/components/*` → `app/components/ui/`
- [ ] Fix dashboard money-account cards (`page.tsx`) → `<Card span="1/4">`
- [ ] Replace the 5 raw checkboxes with `<Checkbox>`
- [ ] Replace all modals with `<Modal>`
- [ ] Replace `button-classes.ts` call sites with `<Button>`/`<IconButton>`, then delete it
- [ ] Replace card/field/select/badge/table literals screen by screen
- [ ] Add a `check:design` rule flagging bare `rounded` and the retired literal strings
