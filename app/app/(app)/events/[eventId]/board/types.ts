import type { BoardLane, PosCellColor } from "@prisma/client";

import type { dictionaries } from "@/lib/i18n-dictionaries";

export type Option = { id: string; name: string };

/** A card as the board client holds it — dates already `YYYY-MM-DD`. */
export type BoardCardView = {
  id: string;
  lane: BoardLane;
  position: number;
  title: string;
  description: string | null;
  color: PosCellColor | null;
  deadline: string | null;
  users: Option[];
  departments: Option[];
};

export type KanbanCopy = Record<keyof (typeof dictionaries)["en"]["kanban"], string> & {
  save: string;
  cancel: string;
  cannotBeUndone: string;
  colorNone: string;
  colorNames: Record<PosCellColor, string>;
};

export function laneLabel(copy: KanbanCopy, lane: BoardLane): string {
  return copy[`lane${lane}`];
}
