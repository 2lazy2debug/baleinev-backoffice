"use client";

import { useState } from "react";

import type { EventStaffAction } from "@prisma/client";

import {
  Badge,
  Cardlet,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  Panel,
  PanelHeader,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

export type StaffLogRow = {
  id: string;
  /** Preformatted on the server, so the list reads the same before and after hydration. */
  when: string;
  action: EventStaffAction;
  eventName: string;
  shiftLabel: string;
  actorName: string;
  subjectName: string;
};

type Props = {
  locale: Locale;
  logs: StaffLogRow[];
};

const ACTION_TONE: Record<EventStaffAction, "success" | "warning" | "info" | "error"> = {
  SIGNUP: "success",
  WITHDRAW: "warning",
  ASSIGN: "info",
  UNASSIGN: "error",
};

/**
 * The staffing log, newest first — same shape as `/stock/history`: filtering
 * lives in the table header, and a phone gets the same rows as cards,
 * unfiltered, because a capped, already-short list is scrollable.
 */
export function EventStaffLogClient({ locale, logs }: Props) {
  const copy = dictionaries[locale].events;

  const [eventName, setEventName] = useState("");

  const events = [...new Set(logs.map((log) => log.eventName))].sort((a, b) => a.localeCompare(b));
  const visible = eventName ? logs.filter((log) => log.eventName === eventName) : logs;

  const actionLabel: Record<EventStaffAction, string> = {
    SIGNUP: copy.logsActionSignup,
    WITHDRAW: copy.logsActionWithdraw,
    ASSIGN: copy.logsActionAssign,
    UNASSIGN: copy.logsActionUnassign,
  };

  function actionBadge(log: StaffLogRow) {
    return <Badge tone={ACTION_TONE[log.action]}>{actionLabel[log.action]}</Badge>;
  }

  return (
    <Panel flushOnMobile as="div" className="bg-[var(--panel)]">
      <PanelHeader flushOnMobile>
        <p className="text-xs text-[var(--muted)]">
          {copy.showing} {visible.length} {copy.of} {logs.length}
        </p>
        <p className="hidden text-xs text-[var(--muted)] sm:block">{copy.logsLimit}</p>
      </PanelHeader>

      <Table frame={false} desktopOnly className="table-fixed">
        <colgroup>
          <col className="w-40" />
          <col className="w-32" />
          <col />
          <col className="w-40" />
          <col className="w-40" />
          <col className="w-40" />
        </colgroup>
        <THead className="sticky top-0">
          <TR>
            <TH>{copy.logsWhen}</TH>
            <TH>{copy.logsAction}</TH>
            <TH>{copy.logsShift}</TH>
            <TH>{copy.logsEvent}</TH>
            <TH>{copy.logsAffected}</TH>
            <TH>{copy.logsBy}</TH>
          </TR>
          <TR className="bg-[var(--panel)] normal-case">
            <TH colSpan={3} />
            <TH>
              <Select size="sm" value={eventName} onChange={(event) => setEventName(event.target.value)}>
                <option value="">{copy.logsAllEvents}</option>
                {events.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </TH>
            <TH colSpan={2} />
          </TR>
        </THead>
        <tbody>
          {visible.map((log) => (
            <TR key={log.id}>
              <TD className="whitespace-nowrap text-[var(--muted)]">{log.when}</TD>
              <TD>{actionBadge(log)}</TD>
              <TD>
                <span className="block truncate">{log.shiftLabel}</span>
              </TD>
              <TD>
                <span className="block truncate">{log.eventName}</span>
              </TD>
              <TD>
                <span className="block truncate">{log.subjectName}</span>
              </TD>
              <TD className="text-[var(--muted)]">
                <span className="block truncate">{log.actorName}</span>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <CardletList>
        {visible.map((log) => (
          <Cardlet key={log.id}>
            <CardletHeader
              title={
                <>
                  <p className="truncate">{log.eventName}</p>
                  <p className="truncate text-3xs font-normal text-[var(--muted)]">{log.shiftLabel}</p>
                </>
              }
              action={actionBadge(log)}
            />
            <CardletFields>
              <CardletField label={copy.logsAffected}>{log.subjectName}</CardletField>
              <CardletField label={copy.logsBy}>{log.actorName}</CardletField>
              <CardletField label={copy.logsWhen}>{log.when}</CardletField>
            </CardletFields>
          </Cardlet>
        ))}
      </CardletList>

      {visible.length === 0 ? (
        <p className="py-6 text-sm text-[var(--muted)] sm:px-5">
          {logs.length === 0 ? copy.logsEmpty : copy.logsNoMatch}
        </p>
      ) : null}
    </Panel>
  );
}
