"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import { Badge, IconButton, Modal } from "@/components/ui";

export type ResponseSummary = {
  id: string;
  name: string;
  shiftCount: number;
  unavailableOnly: boolean;
};

export type EventResponses = {
  answered: ResponseSummary[];
  noAnswer: { id: string; name: string }[];
};

type Props = {
  eventName: string;
  responses: EventResponses;
  copy: {
    responses: string;
    responsesAnswered: string;
    responsesNoAnswer: string;
    responsesShiftCount: string;
    responsesUnavailableOnly: string;
    responsesEveryoneAnswered: string;
  };
};

/**
 * Who has answered an event, and who hasn't — admin-only. "Answered" means at
 * least one StaffAssignment or ShiftUnavailability on any shift of any active
 * day; the list this modal exists for is the second one — the admin came for
 * the names that are still silent.
 */
export default function EventResponsesModal({ eventName, responses, copy }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton size="md" tone="neutral" label={copy.responses} onClick={() => setOpen(true)}>
        <Users />
      </IconButton>

      <Modal open={open} onClose={() => setOpen(false)} title={eventName} size="lg">
        <div className="space-y-5">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {copy.responsesAnswered}
            </p>
            <div className="mt-2 space-y-1.5">
              {responses.answered.map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--ink)]">{user.name}</span>
                  {user.unavailableOnly ? (
                    <Badge tone="warning">{copy.responsesUnavailableOnly}</Badge>
                  ) : (
                    <Badge tone="success">{copy.responsesShiftCount.replace("{count}", String(user.shiftCount))}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {copy.responsesNoAnswer}
            </p>
            {responses.noAnswer.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{copy.responsesEveryoneAnswered}</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {responses.noAnswer.map((user) => (
                  <p key={user.id} className="text-sm text-[var(--ink)]">
                    {user.name}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
