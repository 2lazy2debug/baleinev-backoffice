"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Boxes, Check } from "lucide-react";

import { Button, Card, CardGrid, IconButton, Modal, PageHeader, SectionTitle } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

export type StockPlaceOption = {
  id: string;
  name: string;
  itemCount: number;
};

type PickerProps = {
  locale: Locale;
  places: StockPlaceOption[];
};

type SwitcherProps = PickerProps & {
  selectedId: string;
};

/**
 * Remembering which stock someone works in is a *preference*, not a page state:
 * it survives the tab being closed, the same way the selected edition does, so
 * it is written to the user rather than kept in the URL.
 */
function useStockPlaceSelection() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function select(stockPlaceId: string) {
    const response = await fetch("/api/preferences/stock-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockPlaceId }),
    });

    if (response.ok) {
      startTransition(() => router.refresh());
    }
  }

  return { select, pending };
}

/**
 * The first screen anyone sees, and the only time they see it: pick a stock,
 * and every later visit opens straight onto its contents.
 */
export function StockPlacePicker({ locale, places }: PickerProps) {
  const copy = dictionaries[locale].stock;
  const { select, pending } = useStockPlaceSelection();

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader eyebrow={copy.title} title={copy.pickPlace} description={copy.pickPlaceHint} />

      <CardGrid>
        {places.map((place) => (
          <Card key={place.id} span="1/3" className="flex flex-col justify-between gap-4">
            <div className="min-w-0">
              <SectionTitle className="truncate">{place.name}</SectionTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {place.itemCount === 0 ? copy.emptyPlace : `${place.itemCount} ${copy.entries}`}
              </p>
            </div>
            <Button variant="primary" onClick={() => select(place.id)} disabled={pending}>
              {copy.openPlace}
            </Button>
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}

/** The box next to "New entry": the same list, once a stock is already open. */
export function StockPlaceSwitcher({ locale, places, selectedId }: SwitcherProps) {
  const copy = dictionaries[locale].stock;
  const [open, setOpen] = useState(false);
  const { select, pending } = useStockPlaceSelection();

  async function pick(stockPlaceId: string) {
    setOpen(false);
    await select(stockPlaceId);
  }

  return (
    <>
      <IconButton size="md" label={copy.switchPlace} onClick={() => setOpen(true)}>
        <Boxes />
      </IconButton>

      <Modal open={open} onClose={() => setOpen(false)} title={copy.switchPlace} size="sm">
        <div className="flex flex-col gap-2">
          {places.map((place) => {
            const isSelected = place.id === selectedId;

            return (
              <button
                key={place.id}
                type="button"
                onClick={() => pick(place.id)}
                disabled={pending}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5 text-left text-sm transition hover:bg-[var(--panel-strong)] disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{place.name}</span>
                  <span className="block text-2xs text-[var(--muted)]">
                    {place.itemCount === 0 ? copy.emptyPlace : `${place.itemCount} ${copy.entries}`}
                  </span>
                </span>
                {isSelected ? <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
