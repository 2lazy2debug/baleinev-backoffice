"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

import { ArticleFormModal, type ConversionOption, type UnitOption } from "./article-form-modal";

type Props = {
  locale: Locale;
  units: UnitOption[];
  conversions: ConversionOption[];
};

/** The catalogue's own trigger for the shared article dialog. */
export function CreateArticleButton({ locale, units, conversions }: Props) {
  const copy = dictionaries[locale].articles;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="primary" icon={<Plus />} compactOnMobile onClick={() => setOpen(true)}>
        {copy.addItem}
      </Button>
      <ArticleFormModal
        locale={locale}
        units={units}
        conversions={conversions}
        open={open}
        onClose={() => setOpen(false)}
        item={null}
      />
    </>
  );
}
