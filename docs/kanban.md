# Event kanban board

Each event has one board at `/events/[eventId]/board`, linked from the event's header on `/events`
(hidden for guests). Four fixed lanes: **To do → In progress → Awaiting → Done**.

Code: `app/app/(app)/events/[eventId]/board/` (page, client, actions) and `app/lib/kanban.ts`
(ordering, validation, copy).

## Data model

| Model | Fields | Notes |
|---|---|---|
| `EventBoard` | `eventId` (unique) | One per event. **Created lazily** by the first card (upsert), FK → Event **`Cascade`** |
| `BoardCard` | `boardId`, `lane` (`BoardLane`), `position`, `title`, `description?`, `color?`, `deadline?` (`@db.Date`) | FK → EventBoard **`Cascade`**. Index `(boardId, lane, position)` |
| `BoardCardUser` | `cardId`, `userId` (composite PK) | Many-to-many card ↔ User, both sides `Cascade` |
| `BoardCardDepartment` | `cardId`, `departmentId` (composite PK) | Many-to-many card ↔ Department, both sides `Cascade` |

Deleting an event deletes its board, cards and assignee rows. Deleting a user or department only
removes them from the cards.

- **`position`** is dense and 0-based *per lane*. There is no unique index on it, so renumbering
  never needs the "park above 1 000 000" dance the POS stack uses.
- **`color`** reuses the POS tile palette (`PosCellColor`, `lib/pos-tile-colors.ts`): a tint of a
  `--chart-*` hue mixed into the card surface, so the title stays `--ink` at full contrast.

## Ordering

The client never sends a position. Every write recomputes positions from the database:

- **Create** — appended to the end of the chosen lane (`count` of that lane).
- **Move** (`moveBoardCardAction({ cardId, lane, index })`) — zod checks the lane is a `BoardLane`
  and the index a non-negative integer; `moveCard()` then rebuilds every lane from the stored
  rows, inserts the card at `index` (clamped to the lane's length) and returns only the rows whose
  lane/position changed. Written in one transaction.
- **Edit with a new lane** / the mobile "Move to" select — `moveCard()` with an index past the end,
  i.e. append.
- **Delete** — `densifyLane()` closes the gap.

Drag & drop (`@dnd-kit`) is mouse-only and only for admins. On touch the card title opens the
detail modal, which carries the lane select, edit and delete.

## Permissions

The events app's rules, checked on every action: `requireAdmin()` plus `requireWritableEdition()`
on the event's own edition (walked up from the card). Any non-guest member can read a board; guests
are redirected to `/events`. Assignee ids from the form are filtered to existing users (never
guests) and departments.

## Copy flow

`copyEventBoard(tx, sourceEventId, targetEventId)` in `lib/kanban.ts` duplicates a board onto
another event. Nothing calls it yet; it is the board half of a future "copy event".

1. Refuses `source === target`.
2. Loads the source board with its cards and assignee ids. No board or no cards → returns `0`,
   creates nothing.
3. Upserts the target's board.
4. Creates each card in source order with the same lane, title, description, color, deadline,
   users and departments. Positions are **appended** after whatever each target lane already
   holds, so the result stays dense.
5. Returns the number of cards copied.

It takes the caller's transaction client and does no permission checks. The calling action owns
both, the same contract as `carryOverEdition()`.
