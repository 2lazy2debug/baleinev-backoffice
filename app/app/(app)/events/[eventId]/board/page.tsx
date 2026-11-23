import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getDictionary, getLocale } from "@/lib/i18n";
import { PageHeader, iconButtonClasses } from "@/components/ui";

import BoardClient from "./board-client";
import CardFormModal from "./card-form-modal";
import type { BoardCardView, KanbanCopy } from "./types";

export default async function EventBoardPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  // No `allowGuest`: the board is a member surface, a guest is sent back to /events.
  const access = await getCurrentUserAccess();
  const copy = getDictionary(await getLocale());

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      edition: { select: { closedAt: true } },
      board: {
        select: {
          cards: {
            orderBy: { position: "asc" },
            include: {
              users: { select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } },
              departments: {
                select: { department: { select: { id: true, name: true } } },
                orderBy: { department: { name: "asc" } },
              },
            },
          },
        },
      },
    },
  });
  if (!event) notFound();

  // The events app's rule: admins write, and only while the event's edition is open.
  const canEdit = access.role === "ADMIN" && !event.edition.closedAt;

  const [users, departments] = canEdit
    ? await Promise.all([
        prisma.user.findMany({ where: { role: { not: "GUEST" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], []];

  const cards: BoardCardView[] = (event.board?.cards ?? []).map((card) => ({
    id: card.id,
    lane: card.lane,
    position: card.position,
    title: card.title,
    description: card.description,
    color: card.color,
    deadline: card.deadline ? card.deadline.toISOString().slice(0, 10) : null,
    users: card.users.map(({ user }) => user),
    departments: card.departments.map(({ department }) => department),
  }));

  const kanbanCopy: KanbanCopy = {
    ...copy.kanban,
    save: copy.shell.save,
    cancel: copy.shell.cancel,
    cannotBeUndone: copy.common.cannotBeUndone,
    colorNone: copy.pos.colorNone,
    colorNames: {
      BLUE: copy.pos.colorBlue,
      ORANGE: copy.pos.colorOrange,
      TEAL: copy.pos.colorTeal,
      AMBER: copy.pos.colorAmber,
      PINK: copy.pos.colorPink,
      GREEN: copy.pos.colorGreen,
      VIOLET: copy.pos.colorViolet,
      RED: copy.pos.colorRed,
    },
  };

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.kanban.board}
        title={event.name}
        description={copy.kanban.description}
        actions={
          <>
            {canEdit ? (
              <CardFormModal eventId={event.id} users={users} departments={departments} copy={kanbanCopy} />
            ) : null}
            <Link
              href="/events"
              title={copy.events.backToEvents}
              aria-label={copy.events.backToEvents}
              className={iconButtonClasses("neutral", "md")}
            >
              <ArrowLeft />
            </Link>
          </>
        }
      />

      <BoardClient
        cards={cards}
        canEdit={canEdit}
        users={users}
        departments={departments}
        copy={kanbanCopy}
      />
    </div>
  );
}
