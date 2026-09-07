"use client";

import Link from "next/link";

import {
  Badge,
  Cardlet,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  Panel,
  PanelHeader,
  SectionTitle,
  TD,
  TFoot,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { fromRappen } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { formatCurrency } from "@/lib/utils";

import { POS_METHODS, methodLabel, type PosMethod } from "../pos-methods";

export type SessionRow = {
  id: string;
  name: string;
  templateName: string;
  registerName: string | null;
  openedOn: string;
  openedBy: string | null;
  status: "OPEN" | "PAUSED" | "CLOSED";
  saleCount: number;
  /** Rappen per accepted method; a method the session does not accept is absent. */
  byMethod: Partial<Record<PosMethod, number>>;
  /** Rappen; may be negative. */
  total: number;
};

type StatusCopy = { statusOpen: string; statusPaused: string; statusClosed: string };

function statusBadge(copy: StatusCopy, status: SessionRow["status"]) {
  if (status === "OPEN") return <Badge tone="success">{copy.statusOpen}</Badge>;
  if (status === "PAUSED") return <Badge tone="warning">{copy.statusPaused}</Badge>;
  return <Badge tone="neutral">{copy.statusClosed}</Badge>;
}

/** "CHF 12.00" for an accepted method, "—" for one the session never took. */
function methodCell(row: SessionRow, method: PosMethod) {
  const rappen = row.byMethod[method];
  return rappen === undefined ? "—" : formatCurrency(fromRappen(rappen));
}

export function PosSessionsClient({ locale, sessions }: { locale: Locale; sessions: SessionRow[] }) {
  const copy = dictionaries[locale].pos;

  const methodTotals = POS_METHODS.map((method) =>
    sessions.reduce((sum, row) => sum + (row.byMethod[method] ?? 0), 0),
  );
  const saleCountTotal = sessions.reduce((sum, row) => sum + row.saleCount, 0);
  const grandTotal = sessions.reduce((sum, row) => sum + row.total, 0);

  return (
    <Panel flushOnMobile>
      <PanelHeader flushOnMobile>
        <SectionTitle desktopOnly>{copy.sessionsTitle}</SectionTitle>
      </PanelHeader>

      <Table desktopOnly dense frame={false}>
        <THead>
          <TR>
            <TH>{copy.sessionName}</TH>
            <TH>{copy.template}</TH>
            <TH>{copy.register}</TH>
            <TH>{copy.opened}</TH>
            <TH>{copy.status}</TH>
            <TH className="text-right">{copy.saleCount}</TH>
            {POS_METHODS.map((method) => (
              <TH key={method} className="text-right">
                {methodLabel(copy, method)}
              </TH>
            ))}
            <TH className="text-right">{copy.total}</TH>
          </TR>
        </THead>
        <tbody>
          {sessions.map((session) => (
            <TR key={session.id}>
              <TD className="font-medium">
                <Link href={`/pos/sessions/${session.id}`} className="hover:text-[var(--accent)]">
                  {session.name}
                </Link>
              </TD>
              <TD>{session.templateName}</TD>
              <TD>{session.registerName ?? "—"}</TD>
              <TD>
                {session.openedOn}
                {session.openedBy ? <span className="text-[var(--muted)]"> · {session.openedBy}</span> : null}
              </TD>
              <TD>{statusBadge(copy, session.status)}</TD>
              <TD className="text-right tabular-nums">{session.saleCount}</TD>
              {POS_METHODS.map((method) => (
                <TD key={method} className="text-right tabular-nums">
                  {methodCell(session, method)}
                </TD>
              ))}
              <TD className="text-right font-semibold tabular-nums">
                {formatCurrency(fromRappen(session.total))}
              </TD>
            </TR>
          ))}
        </tbody>
        <TFoot>
          <TR>
            <TD colSpan={5}>{copy.takenTotal}</TD>
            <TD className="text-right tabular-nums">{saleCountTotal}</TD>
            {methodTotals.map((rappen, index) => (
              <TD key={POS_METHODS[index]} className="text-right tabular-nums">
                {formatCurrency(fromRappen(rappen))}
              </TD>
            ))}
            <TD className="text-right tabular-nums">{formatCurrency(fromRappen(grandTotal))}</TD>
          </TR>
        </TFoot>
      </Table>

      <CardletList>
        {sessions.map((session) => (
          <Cardlet key={session.id}>
            <CardletHeader
              title={
                <Link href={`/pos/sessions/${session.id}`} className="hover:text-[var(--accent)]">
                  {session.name}
                </Link>
              }
              action={statusBadge(copy, session.status)}
            />
            <CardletFields>
              <CardletField label={copy.template}>{session.templateName}</CardletField>
              {session.registerName ? (
                <CardletField label={copy.register}>{session.registerName}</CardletField>
              ) : null}
              <CardletField label={copy.opened}>
                {session.openedOn}
                {session.openedBy ? ` · ${session.openedBy}` : ""}
              </CardletField>
              <CardletField label={copy.saleCount}>{session.saleCount}</CardletField>
              {POS_METHODS.filter((method) => session.byMethod[method] !== undefined).map((method) => (
                <CardletField key={method} label={methodLabel(copy, method)}>
                  {methodCell(session, method)}
                </CardletField>
              ))}
              <CardletField label={copy.total}>{formatCurrency(fromRappen(session.total))}</CardletField>
            </CardletFields>
          </Cardlet>
        ))}
      </CardletList>
    </Panel>
  );
}
