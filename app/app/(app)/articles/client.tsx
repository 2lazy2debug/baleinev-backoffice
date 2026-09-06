"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { FormError } from "@/components/form-error";
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
  Input,
  Panel,
  PanelHeader,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";
import { formatPiece } from "@/lib/stock";

import { deleteArticleAction } from "./actions";
import { ArticleFormModal, type ConversionOption, type ArticleDraft, type UnitOption } from "./article-form-modal";

export type ArticleRow = ArticleDraft & {
  unitName: string;
  /** Pieces of this article across every stock, which is what makes it undeletable. */
  inStock: number;
};

type Props = {
  locale: Locale;
  units: UnitOption[];
  conversions: ConversionOption[];
  items: ArticleRow[];
};

/** The catalogue: what a thing is called, what one piece of it is, whether it expires and whether it is counted in stock. */
export function ArticlesClient({ locale, units, conversions, items }: Props) {
  const copy = dictionaries[locale].articles;

  const [filters, setFilters] = useState({ name: "", brand: "" });
  const [editing, setEditing] = useState<ArticleRow | null>(null);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteArticleAction, initialActionState);

  // Derived once: the table above `sm` and the cardlets below it read this same
  // array.
  const visible = items.filter(
    (item) =>
      item.name.toLowerCase().includes(filters.name.trim().toLowerCase()) &&
      item.brand.toLowerCase().includes(filters.brand.trim().toLowerCase()),
  );

  // An untracked article never sits on a shelf, so a piece count would always
  // read "0" and mean nothing — the badge says why instead.
  function stockCell(item: ArticleRow) {
    if (!item.tracksStock) {
      return <Badge tone="neutral">{copy.notStocked}</Badge>;
    }

    return <span className="tabular-nums">{`${item.inStock} ${copy.pieces}`}</span>;
  }

  function deleteButton(item: ArticleRow, variant: "icon" | "button") {
    const blocked = item.inStock > 0;
    const label = blocked ? copy.deleteItemBlocked : copy.deleteItem;

    return (
      <form action={deleteFormAction}>
        <input type="hidden" name="elementId" value={item.id} />
        {variant === "icon" ? (
          <IconButton type="submit" tone="delete" label={label} disabled={blocked || isDeleting}>
            <Trash2 />
          </IconButton>
        ) : (
          <Button type="submit" variant="destructive" size="sm" icon={<Trash2 />} disabled={blocked || isDeleting}>
            {copy.deleteItem}
          </Button>
        )}
      </form>
    );
  }

  return (
    <>
      <Panel flushOnMobile as="div" className="bg-[var(--panel)]">
        <PanelHeader flushOnMobile>
          <p className="text-xs text-[var(--muted)]">
            {copy.showing} {visible.length} {copy.of} {items.length}
          </p>
        </PanelHeader>

        {deleteState.error ? (
          <div className="border-b border-[var(--line)] px-4 py-2">
            <FormError message={deleteState.error} />
          </div>
        ) : null}

        <Table frame={false} desktopOnly className="table-fixed">
          <colgroup>
            <col />
            <col className="w-44" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-28" />
          </colgroup>
          <THead className="sticky top-0">
            <TR>
              <TH>{copy.name}</TH>
              <TH>{copy.brand}</TH>
              <TH>{copy.piece}</TH>
              <TH>{copy.expireable}</TH>
              <TH>{copy.inStock}</TH>
              <TH>{copy.actions}</TH>
            </TR>
            <TR className="bg-[var(--panel)] normal-case">
              <TH>
                <Input
                  type="text"
                  size="sm"
                  placeholder={copy.filter}
                  value={filters.name}
                  onChange={(event) => setFilters({ ...filters, name: event.target.value })}
                />
              </TH>
              <TH>
                <Input
                  type="text"
                  size="sm"
                  placeholder={copy.filter}
                  value={filters.brand}
                  onChange={(event) => setFilters({ ...filters, brand: event.target.value })}
                />
              </TH>
              <TH colSpan={4} />
            </TR>
          </THead>
          <tbody>
            {visible.map((item) => (
              <TR key={item.id}>
                <TD className="font-medium">
                  <span className="block truncate">{item.name}</span>
                </TD>
                <TD className="text-[var(--muted)]">
                  <span className="block truncate">{item.brand || "-"}</span>
                </TD>
                <TD>{formatPiece(Number(item.unitQty), item.unitName)}</TD>
                <TD>{item.expireable ? <Badge tone="info">{copy.expireable}</Badge> : null}</TD>
                <TD>{stockCell(item)}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <IconButton tone="accent" label={copy.editItem} onClick={() => setEditing(item)}>
                      <Pencil />
                    </IconButton>
                    {deleteButton(item, "icon")}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>

        <CardletList>
          {visible.map((item) => (
            <Cardlet key={item.id}>
              <CardletHeader
                title={
                  <>
                    <p className="truncate">{item.name}</p>
                    {item.brand ? (
                      <p className="truncate text-3xs font-normal text-[var(--muted)]">{item.brand}</p>
                    ) : null}
                  </>
                }
                action={item.expireable ? <Badge tone="info">{copy.expireable}</Badge> : null}
              />
              <CardletFields>
                <CardletField label={copy.piece}>{formatPiece(Number(item.unitQty), item.unitName)}</CardletField>
                <CardletField label={copy.inStock}>{stockCell(item)}</CardletField>
              </CardletFields>
              <CardletActions>
                <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => setEditing(item)}>
                  {copy.editItem}
                </Button>
                {deleteButton(item, "button")}
              </CardletActions>
            </Cardlet>
          ))}
        </CardletList>

        {visible.length === 0 ? (
          <p className="py-6 text-sm text-[var(--muted)] sm:px-5">
            {items.length === 0 ? copy.itemsEmpty : copy.itemsNoMatch}
          </p>
        ) : null}
      </Panel>

      <ArticleFormModal
        locale={locale}
        units={units}
        conversions={conversions}
        open={editing !== null}
        onClose={() => setEditing(null)}
        item={editing}
      />
    </>
  );
}
