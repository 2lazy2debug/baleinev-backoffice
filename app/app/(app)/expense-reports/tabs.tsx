"use client";

import { useState } from "react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { Button, cn } from "@/components/ui";

type Tab = "history" | "create";

/**
 * The page's two halves — the create form and the history.
 *
 * On desktop they sit side by side. A phone has room for one at a time, so
 * below `lg` they become tabs: nobody should have to scroll past a long form to
 * reach their history. Both panels stay mounted (hidden, not unmounted) so a
 * half-typed report survives a tab switch. Pure view state — no navigation, no
 * server state.
 */
export function ExpenseReportsTabs({
  create,
  history,
  copy,
}: {
  create: React.ReactNode;
  history: React.ReactNode;
  copy: { history: string; newReport: string };
}) {
  const [tab, setTab] = useState<Tab>("history");
  const isReadOnly = useEditionReadOnly();

  // A closed edition has no create form (`WritableEditionOnly` renders nothing),
  // so there is nothing to switch between.
  if (isReadOnly) {
    return <section>{history}</section>;
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="flex gap-1 rounded-lg bg-[var(--panel-strong)] p-1 lg:hidden">
        <Button
          variant={tab === "history" ? "primary" : "ghost"}
          aria-pressed={tab === "history"}
          onClick={() => setTab("history")}
          className="grow basis-0"
        >
          {copy.history}
        </Button>
        <Button
          variant={tab === "create" ? "primary" : "ghost"}
          aria-pressed={tab === "create"}
          onClick={() => setTab("create")}
          className="grow basis-0"
        >
          {copy.newReport}
        </Button>
      </div>

      <div className={cn(tab === "create" ? null : "hidden lg:block")}>{create}</div>
      <div className={cn(tab === "history" ? null : "hidden lg:block")}>{history}</div>
    </section>
  );
}
