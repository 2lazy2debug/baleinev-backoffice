"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import {
  Badge,
  Button,
  Cardlet,
  CardletActions,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  IconButton,
  Modal,
  Panel,
  PanelHeader,
  SectionTitle,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { CASH_DENOMINATIONS, countTotal, formatDenomination, fromRappen } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { formatCurrency } from "@/lib/utils";

import CloseRegisterModal from "./close-register-modal";
import JournalRegisterModal, { type RegisterBooking } from "./journal-register-modal";

export type CountRow = { denomination: number; quantity: number };

export type CashRegisterRow = {
  id: string;
  name: string;
  cashAccount: string;
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  /** Set once the three closing entries are written. */
  journaledAt: string | null;
  journaledBy: string | null;
  /** Rappen. */
  floatTotal: number;
  /** Rappen, or null while the register is open. */
  closingTotal: number | null;
  openingCounts: CountRow[];
  closingCounts: CountRow[];
  /** The figures and the entries to preview — only for a closed, unbooked register. */
  booking: RegisterBooking | null;
};

function Sheet({ title, counts, byName }: { title: string; counts: CountRow[]; byName: string | null }) {
  const present = CASH_DENOMINATIONS.map((denomination) => ({
    denomination,
    quantity: counts.find((count) => count.denomination === denomination)?.quantity ?? 0,
  })).filter((row) => row.quantity > 0);

  return (
    <div className="space-y-1">
      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{title}</p>
      {present.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">—</p>
      ) : (
        present.map((row) => (
          <div key={row.denomination} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--muted)]">
              {formatDenomination(row.denomination)} &times; {row.quantity}
            </span>
            <span>{formatCurrency(fromRappen(row.denomination * row.quantity))}</span>
          </div>
        ))
      )}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-1 text-sm font-semibold">
        <span>{formatCurrency(fromRappen(countTotal(counts)))}</span>
      </div>
      {byName ? <p className="text-xs text-[var(--muted)]">{byName}</p> : null}
    </div>
  );
}

type BudgetOption = { id: string; name: string };
type CostCenterOption = { id: string; code: string };

export function CashRegistersClient({
  locale,
  registers,
  isAdmin,
  budgets,
  costCenters,
}: {
  locale: Locale;
  registers: CashRegisterRow[];
  isAdmin: boolean;
  budgets: BudgetOption[];
  costCenters: CostCenterOption[];
}) {
  const copy = dictionaries[locale].cash;
  const shell = dictionaries[locale].shell;
  const isReadOnly = useEditionReadOnly();
  const [closing, setClosing] = useState<CashRegisterRow | null>(null);
  const [viewing, setViewing] = useState<CashRegisterRow | null>(null);
  const [booking, setBooking] = useState<CashRegisterRow | null>(null);

  function statusBadge(register: CashRegisterRow) {
    if (!register.closedAt) {
      return <Badge tone="success">{copy.statusOpen}</Badge>;
    }
    if (register.journaledAt) {
      return <Badge tone="info">{copy.statusBooked}</Badge>;
    }
    return <Badge tone="neutral">{copy.statusClosed}</Badge>;
  }

  /** Close (open till) · Book + Sheets (closed, unbooked) · Sheets only (booked). */
  function rowActions(register: CashRegisterRow) {
    if (!register.closedAt) {
      return isReadOnly ? null : (
        <Button size="sm" onClick={() => setClosing(register)}>
          {copy.close}
        </Button>
      );
    }

    return (
      <div className="flex items-center justify-end gap-2">
        {!register.journaledAt && isAdmin && !isReadOnly && register.booking ? (
          <Button size="sm" onClick={() => setBooking(register)}>
            {copy.book}
          </Button>
        ) : null}
        <IconButton size="sm" label={copy.sheets} onClick={() => setViewing(register)}>
          <Eye />
        </IconButton>
      </div>
    );
  }

  function bookedLine(register: CashRegisterRow) {
    if (!register.journaledAt) {
      return null;
    }
    return copy.bookedOn
      .replace("{date}", register.journaledAt)
      .replace("{name}", register.journaledBy ?? "—");
  }

  return (
    <>
      <Panel flushOnMobile>
        <PanelHeader flushOnMobile>
          <SectionTitle desktopOnly>{copy.registers}</SectionTitle>
        </PanelHeader>

        {registers.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)] sm:px-5">{copy.noRegisters}</p>
        ) : (
          <>
            <Table desktopOnly dense frame={false}>
              <THead>
                <TR>
                  <TH>{copy.registerName}</TH>
                  <TH>{copy.cashAccount}</TH>
                  <TH>{copy.openedBy}</TH>
                  <TH>{copy.float}</TH>
                  <TH>{copy.counted}</TH>
                  <TH>{copy.status}</TH>
                  <TH aria-label={copy.close} />
                </TR>
              </THead>
              <tbody>
                {registers.map((register) => (
                  <TR key={register.id}>
                    <TD className="font-medium">{register.name}</TD>
                    <TD>{register.cashAccount}</TD>
                    <TD>
                      {register.openedAt}
                      {register.openedBy ? (
                        <span className="text-[var(--muted)]"> · {register.openedBy}</span>
                      ) : null}
                    </TD>
                    <TD>{formatCurrency(fromRappen(register.floatTotal))}</TD>
                    <TD>
                      {register.closingTotal === null ? "—" : formatCurrency(fromRappen(register.closingTotal))}
                    </TD>
                    <TD>
                      <div className="space-y-0.5">
                        {statusBadge(register)}
                        {bookedLine(register) ? (
                          <p className="text-3xs text-[var(--muted)]">{bookedLine(register)}</p>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="text-right">{rowActions(register)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            <CardletList>
              {registers.map((register) => (
                <Cardlet key={register.id}>
                  <CardletHeader title={register.name} action={statusBadge(register)} />
                  <CardletFields>
                    <CardletField label={copy.cashAccount}>{register.cashAccount}</CardletField>
                    <CardletField label={copy.openedBy}>
                      {register.openedAt}
                      {register.openedBy ? ` · ${register.openedBy}` : ""}
                    </CardletField>
                    <CardletField label={copy.float}>{formatCurrency(fromRappen(register.floatTotal))}</CardletField>
                    <CardletField label={copy.counted}>
                      {register.closingTotal === null ? "—" : formatCurrency(fromRappen(register.closingTotal))}
                    </CardletField>
                    {bookedLine(register) ? (
                      <CardletField label={copy.statusBooked}>{bookedLine(register)}</CardletField>
                    ) : null}
                  </CardletFields>
                  <CardletActions inline>{rowActions(register)}</CardletActions>
                </Cardlet>
              ))}
            </CardletList>
          </>
        )}
      </Panel>

      <CloseRegisterModal
        locale={locale}
        register={closing}
        onClose={() => setClosing(null)}
      />

      <JournalRegisterModal
        locale={locale}
        register={booking}
        budgets={budgets}
        costCenters={costCenters}
        onClose={() => setBooking(null)}
      />

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${shell.cash} · ${viewing.name}` : shell.cash}
        size="lg"
      >
        {viewing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Sheet title={copy.float} counts={viewing.openingCounts} byName={viewing.openedBy} />
            <Sheet title={copy.counted} counts={viewing.closingCounts} byName={viewing.closedBy} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
