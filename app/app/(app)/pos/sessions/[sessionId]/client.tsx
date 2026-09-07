"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import {
  Badge,
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
  TFoot,
  TH,
  THead,
  TR,
  Table,
  cn,
  nestedSurfaceClasses,
} from "@/components/ui";
import { formatDenomination, fromRappen } from "@/lib/cash";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { formatCurrency } from "@/lib/utils";

import { methodLabel, type PosMethod } from "../../pos-methods";

export type SaleLine = {
  label: string;
  /** Rappen; may be negative. */
  unitPrice: number;
  quantity: number;
  isCustom: boolean;
};

export type SaleRow = {
  id: string;
  at: string;
  seller: string | null;
  method: PosMethod;
  /** Rappen; may be negative. */
  total: number;
  /** Rappen, cash sales only. */
  cashGiven: number | null;
  changeDue: number | null;
  lines: SaleLine[];
  change: { denomination: number; quantity: number }[];
};

const francs = (rappen: number) => formatCurrency(fromRappen(rappen));

export function SessionDetailClient({ locale, sales }: { locale: Locale; sales: SaleRow[] }) {
  const copy = dictionaries[locale].pos;
  const [viewing, setViewing] = useState<SaleRow | null>(null);

  return (
    <>
      <Panel flushOnMobile>
        <PanelHeader flushOnMobile>
          <SectionTitle desktopOnly>{copy.sales}</SectionTitle>
        </PanelHeader>

        {sales.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)] sm:px-5">{copy.noSales}</p>
        ) : (
          <>
            <Table desktopOnly dense frame={false}>
              <THead>
                <TR>
                  <TH>{copy.time}</TH>
                  <TH>{copy.seller}</TH>
                  <TH>{copy.method}</TH>
                  <TH className="text-right">{copy.total}</TH>
                  <TH aria-label={copy.lines} />
                </TR>
              </THead>
              <tbody>
                {sales.map((sale) => (
                  <TR key={sale.id}>
                    <TD className="tabular-nums">{sale.at}</TD>
                    <TD>{sale.seller ?? "—"}</TD>
                    <TD>
                      <Badge>{methodLabel(copy, sale.method)}</Badge>
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">{francs(sale.total)}</TD>
                    <TD className="text-right">
                      <IconButton size="sm" label={copy.lines} onClick={() => setViewing(sale)}>
                        <Eye />
                      </IconButton>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            <CardletList>
              {sales.map((sale) => (
                <Cardlet key={sale.id}>
                  <CardletHeader title={sale.at} action={<Badge>{methodLabel(copy, sale.method)}</Badge>} />
                  <CardletFields>
                    <CardletField label={copy.seller}>{sale.seller ?? "—"}</CardletField>
                    <CardletField label={copy.total}>{francs(sale.total)}</CardletField>
                  </CardletFields>
                  <CardletActions inline>
                    <IconButton size="sm" label={copy.lines} onClick={() => setViewing(sale)}>
                      <Eye />
                    </IconButton>
                  </CardletActions>
                </Cardlet>
              ))}
            </CardletList>
          </>
        )}
      </Panel>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.at} · ${methodLabel(copy, viewing.method)}` : copy.sales}
        size="md"
        mobileFullScreen
      >
        {viewing ? (
          <div className="space-y-4">
            <Table dense>
              <THead>
                <TR>
                  <TH>{copy.lines}</TH>
                  <TH className="text-right" aria-label={copy.price} />
                  <TH className="text-right">{copy.lineTotal}</TH>
                </TR>
              </THead>
              <tbody>
                {viewing.lines.map((line, index) => (
                  <TR key={index}>
                    <TD>
                      {line.label}
                      {line.isCustom ? (
                        <span className="ml-2 text-2xs text-[var(--muted)]">{copy.customSale}</span>
                      ) : null}
                    </TD>
                    <TD className="text-right tabular-nums text-[var(--muted)]">
                      {line.quantity} &times; {francs(line.unitPrice)}
                    </TD>
                    <TD className="text-right tabular-nums">{francs(line.unitPrice * line.quantity)}</TD>
                  </TR>
                ))}
              </tbody>
              <TFoot>
                <TR>
                  <TD colSpan={2}>{copy.total}</TD>
                  <TD className="text-right tabular-nums">{francs(viewing.total)}</TD>
                </TR>
              </TFoot>
            </Table>

            {viewing.changeDue !== null ? (
              <div className={cn(nestedSurfaceClasses, "space-y-1 p-3")}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">{copy.amountGiven}</span>
                  <span className="tabular-nums">{francs(viewing.cashGiven ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">{copy.changeDue}</span>
                  <span className="tabular-nums">{francs(viewing.changeDue)}</span>
                </div>
                {viewing.change.length > 0 ? (
                  <div className="space-y-0.5 border-t border-[var(--line)] pt-1">
                    <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                      {copy.changeSheet}
                    </p>
                    {viewing.change.map((row) => (
                      <div
                        key={row.denomination}
                        className="flex items-center justify-between text-2xs text-[var(--muted)]"
                      >
                        <span>
                          {row.quantity} &times; {formatDenomination(row.denomination)}
                        </span>
                        <span className="tabular-nums">{francs(row.denomination * row.quantity)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
