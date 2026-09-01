"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

import { ItemFormModal, type UnitOption } from "./item-form-modal";

type Props = {
  locale: Locale;
  units: UnitOption[];
};

/** The catalogue's own trigger for the shared item dialog. */
export function CreateItemButton({ locale, units }: Props) {
  const copy = dictionaries[locale].stock;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.addItem}
      </Button>
      <ItemFormModal locale={locale} units={units} open={open} onClose={() => setOpen(false)} item={null} />
    </>
  );
}
