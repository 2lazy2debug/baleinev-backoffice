"use client";

import { useState } from "react";

import {
  Badge,
  Cardlet,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  Input,
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

export type MovementRow = {
  id: string;
  /** Preformatted on the server, so the list reads the same before and after hydration. */
  when: string;
  placeId: string;
  placeName: string;
  itemName: string;
  brand: string;
  piece: string;
  expiry: string;
  isIn: boolean;
  delta: number;
  by: string;
};

type PlaceOption = {
  id: string;
  name: string;
};

type Props = {
  locale: Locale;
  places: PlaceOption[];
  movements: MovementRow[];
};

type DirectionFilter = "all" | "in" | "out";

/**
 * The log, newest first.
 *
 * Filtering lives in the table header, the way the journal and the address book
 * do it — a phone gets the same rows as cards, unfiltered, because a list that
 * is already only the last few hundred movements is scrollable and a filter row
 * above it is not worth a quarter of the viewport.
 */
export function StockHistoryClient({ locale, places, movements }: Props) {
  const copy = dictionaries[locale].stock;

  const [item, setItem] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");

  const needle = item.trim().toLowerCase();
  const visible = movements.filter((movement) => {
    if (needle && !`${movement.itemName} ${movement.brand}`.toLowerCase().includes(needle)) {
      return false;
    }
    if (placeId && movement.placeId !== placeId) {
      return false;
    }
    if (direction !== "all" && movement.isIn !== (direction === "in")) {
      return false;
    }
    return true;
  });

  function directionBadge(movement: MovementRow) {
    return (
      <Badge tone={movement.isIn ? "success" : "warning"}>
        {movement.isIn ? copy.movementIn : copy.movementOut}
      </Badge>
    );
  }

  /** The magnitude, signed the way the movement went. */
  function delta(movement: MovementRow) {
    return `${movement.isIn ? "+" : "-"}${movement.delta}`;
  }

  return (
    <Panel as="div" className="bg-[var(--panel)]">
      <PanelHeader>
        <p className="text-xs text-[var(--muted)]">
          {copy.showing} {visible.length} {copy.of} {movements.length}
        </p>
        <p className="hidden text-xs text-[var(--muted)] sm:block">{copy.historyLimit}</p>
      </PanelHeader>

      <Table frame={false} desktopOnly className="table-fixed">
        <colgroup>
          <col className="w-40" />
          <col />
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-40" />
        </colgroup>
        <THead className="sticky top-0">
          <TR>
            <TH>{copy.when}</TH>
            <TH>{copy.item}</TH>
            <TH>{copy.place}</TH>
            <TH>{copy.direction}</TH>
            <TH>{copy.quantity}</TH>
            <TH>{copy.by}</TH>
          </TR>
          <TR className="bg-[var(--panel)] normal-case">
            <TH />
            <TH>
              <Input
                type="text"
                size="sm"
                placeholder={copy.filter}
                value={item}
                onChange={(event) => setItem(event.target.value)}
              />
            </TH>
            <TH>
              <Select size="sm" value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
                <option value="">{copy.allPlaces}</option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </Select>
            </TH>
            <TH>
              <Select
                size="sm"
                value={direction}
                onChange={(event) => setDirection(event.target.value as DirectionFilter)}
              >
                <option value="all">{copy.allDirections}</option>
                <option value="in">{copy.movementIn}</option>
                <option value="out">{copy.movementOut}</option>
              </Select>
            </TH>
            <TH colSpan={2} />
          </TR>
        </THead>
        <tbody>
          {visible.map((movement) => (
            <TR key={movement.id}>
              <TD className="whitespace-nowrap text-[var(--muted)]">{movement.when}</TD>
              <TD>
                <span className="block truncate font-medium">{movement.itemName}</span>
                <span className="block truncate text-2xs text-[var(--muted)]">
                  {[movement.brand, movement.piece, movement.expiry].filter(Boolean).join(" · ")}
                </span>
              </TD>
              <TD>
                <span className="block truncate">{movement.placeName}</span>
              </TD>
              <TD>{directionBadge(movement)}</TD>
              <TD className="font-semibold tabular-nums">{delta(movement)}</TD>
              <TD className="text-[var(--muted)]">
                <span className="block truncate">{movement.by || "-"}</span>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <CardletList className="p-3">
        {visible.map((movement) => (
          <Cardlet key={movement.id}>
            <CardletHeader
              title={
                <>
                  <p className="truncate">{movement.itemName}</p>
                  <p className="truncate text-3xs font-normal text-[var(--muted)]">
                    {[movement.brand, movement.piece, movement.expiry].filter(Boolean).join(" · ")}
                  </p>
                </>
              }
              action={directionBadge(movement)}
            />
            <CardletFields>
              <CardletField label={copy.quantity}>
                <span className="font-semibold tabular-nums">{delta(movement)}</span>
              </CardletField>
              <CardletField label={copy.place}>{movement.placeName}</CardletField>
              <CardletField label={copy.when}>{movement.when}</CardletField>
              <CardletField label={copy.by}>{movement.by || "-"}</CardletField>
            </CardletFields>
          </Cardlet>
        ))}
      </CardletList>

      {visible.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--muted)]">
          {movements.length === 0 ? copy.historyEmpty : copy.historyNoMatch}
        </p>
      ) : null}
    </Panel>
  );
}
