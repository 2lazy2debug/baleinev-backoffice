"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, List } from "lucide-react";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import { Badge, Button, IconButton, Modal, cn, nestedSurfaceClasses } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import { OpenSessionModal, type RegisterOption, type TemplateOption } from "./open-session-modal";
import { type PickerSession } from "./session-picker";
import { methodLabel } from "./pos-methods";
import { joinPosSessionAction, setPosSessionStatusAction } from "./session-actions";

/**
 * The "list icon top right" — every running session in one dialog, with the
 * buttons to join, pause/resume and close each. Closing asks for confirmation
 * and the copy says plainly that nothing is booked to the journal by it.
 *
 * It also carries the "Open a session" button, so a seller can spin up another
 * till without leaving the one they are on.
 */
export function SessionsModal({
  locale,
  sessions,
  templates,
  registers,
  currentSessionId,
}: {
  locale: Locale;
  sessions: PickerSession[];
  templates: TemplateOption[];
  registers: RegisterOption[];
  currentSessionId: string;
}) {
  const copy = dictionaries[locale].pos;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [statusState, statusAction, statusPending] = useActionState(setPosSessionStatusAction, initialActionState);
  const markStatus = useCloseOnSuccess(statusState, statusPending, () => router.refresh());

  async function join(sessionId: string) {
    setJoinError(null);
    setJoinPending(true);
    const result = await joinPosSessionAction(sessionId);
    setJoinPending(false);
    if (result.error) {
      setJoinError(result.error);
      return;
    }
    router.refresh();
  }

  function confirmClose(event: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(copy.closeSessionConfirm)) {
      event.preventDefault();
      return;
    }
    markStatus();
  }

  return (
    <>
      <IconButton size="md" label={copy.sessions} onClick={() => setOpen(true)}>
        <List />
      </IconButton>

      <Modal open={open} onClose={() => setOpen(false)} title={copy.sessions} size="lg" mobileFullScreen>
        <div className="space-y-4">
          <OpenSessionModal locale={locale} templates={templates} registers={registers} />

          <FormError message={joinError ?? statusState.error} />

          <div className="space-y-2">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const nextStatus = session.status === "PAUSED" ? "OPEN" : "PAUSED";

              return (
                <div key={session.id} className={cn(nestedSurfaceClasses, "space-y-2 p-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{session.name}</p>
                      <p className="text-2xs text-[var(--muted)]">{session.templateName}</p>
                    </div>
                    <Badge tone={session.status === "PAUSED" ? "warning" : "success"}>
                      {session.status === "PAUSED" ? copy.statusPaused : copy.statusOpen}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-2xs text-[var(--muted)]">
                    {session.methods.map((method) => (
                      <Badge key={method}>{methodLabel(copy, method)}</Badge>
                    ))}
                    {session.registerName ? <span>· {session.registerName}</span> : null}
                    <span>
                      · {session.saleCount} {copy.sales}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-2xs font-semibold text-[var(--accent)]">
                        <Check className="h-3.5 w-3.5" />
                        {copy.youAreHere}
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => join(session.id)} disabled={joinPending}>
                        {copy.joinSession}
                      </Button>
                    )}

                    <form action={statusAction} onSubmit={markStatus}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="status" value={nextStatus} />
                      <Button type="submit" size="sm" variant="secondary" disabled={statusPending}>
                        {session.status === "PAUSED" ? copy.resumeSession : copy.pauseSession}
                      </Button>
                    </form>

                    <form action={statusAction} onSubmit={confirmClose}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="status" value="CLOSED" />
                      <Button type="submit" size="sm" variant="destructive" disabled={statusPending}>
                        {copy.closeSession}
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
}
