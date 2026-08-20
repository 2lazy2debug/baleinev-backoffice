"use client";

import { useState } from "react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { PageHeader, SegmentedControl, cn } from "@/components/ui";

type Tab = "history" | "create";

/**
 * The screen's shell: the page header and the page's two halves — the create
 * form and the history.
 *
 * On desktop the halves sit side by side. A phone has room for one at a time,
 * so below `lg` they become tabs: nobody should have to scroll past a long form
 * to reach their history. Both panels stay mounted (hidden, not unmounted) so a
 * half-typed report survives a tab switch. Pure view state — no navigation, no
 * server state.
 *
 * The header lives here rather than in `page.tsx` because the tab strip belongs
 * *in* the mobile top bar (<PageHeader controls>), pinned while the list under
 * it scrolls — the same place the mockup puts it. That is the whole reason a
 * server page hands its title down to a client shell.
 */
export function ExpenseReportsTabs({
  eyebrow,
  title,
  description,
  create,
  history,
  copy,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  create: React.ReactNode;
  history: React.ReactNode;
  copy: { history: string; newReport: string };
}) {
  const [tab, setTab] = useState<Tab>("history");
  const isReadOnly = useEditionReadOnly();

  // A closed edition has no create form (`WritableEditionOnly` renders nothing),
  // so there is nothing to switch between.
  const tabs = isReadOnly ? null : (
    <SegmentedControl<Tab>
      className="lg:hidden"
      value={tab}
      onChange={setTab}
      options={[
        { value: "history", label: copy.history },
        { value: "create", label: copy.newReport },
      ]}
    />
  );

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} controls={tabs} />

      {isReadOnly ? (
        <section>{history}</section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className={cn(tab === "create" ? null : "hidden lg:block")}>{create}</div>
          <div className={cn(tab === "history" ? null : "hidden lg:block")}>{history}</div>
        </section>
      )}
    </>
  );
}
