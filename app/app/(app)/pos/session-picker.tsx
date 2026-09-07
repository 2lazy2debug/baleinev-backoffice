"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { FormError } from "@/components/form-error";
import { Badge, Button, Card, CardGrid, PageHeader, SectionTitle } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

import { OpenSessionModal, type RegisterOption, type StockPlaceOption, type TemplateOption } from "./open-session-modal";
import { methodLabel, type PosMethod } from "./pos-methods";
import { joinPosSessionAction } from "./session-actions";

export type PickerSession = {
  id: string;
  name: string;
  status: "OPEN" | "PAUSED";
  templateName: string;
  methods: PosMethod[];
  registerName: string | null;
  stockPlaceName: string | null;
  saleCount: number;
};

/**
 * The first screen anyone sees, and — once they have joined — the only time
 * they see it. Same "asked once, then remembered" shape as
 * `StockPlacePicker`: pick a running session and every later visit opens
 * straight onto the till.
 */
export function SessionPicker({
  locale,
  sessions,
  templates,
  registers,
  stockPlaces,
}: {
  locale: Locale;
  sessions: PickerSession[];
  templates: TemplateOption[];
  registers: RegisterOption[];
  stockPlaces: StockPlaceOption[];
}) {
  const copy = dictionaries[locale].pos;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function join(sessionId: string) {
    setError(null);
    const result = await joinPosSessionAction(sessionId);
    if (result.error) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.title}
        title={copy.pickSession}
        description={copy.pickSessionHint}
        actions={
          <OpenSessionModal
            locale={locale}
            templates={templates}
            registers={registers}
            stockPlaces={stockPlaces}
          />
        }
      />

      {error ? <FormError message={error} /> : null}

      {sessions.length === 0 ? (
        <Card dashed className="space-y-1">
          <SectionTitle>{copy.noSessions}</SectionTitle>
          <p className="text-sm text-[var(--muted)]">{copy.noSessionsHint}</p>
        </Card>
      ) : (
        <CardGrid>
          {sessions.map((session) => (
            <Card key={session.id} span="1/3" className="flex flex-col justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <SectionTitle className="truncate">{session.name}</SectionTitle>
                  <Badge tone={session.status === "PAUSED" ? "warning" : "success"}>
                    {session.status === "PAUSED" ? copy.statusPaused : copy.statusOpen}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--muted)]">{session.templateName}</p>
                <div className="flex flex-wrap gap-1">
                  {session.methods.map((method) => (
                    <Badge key={method}>{methodLabel(copy, method)}</Badge>
                  ))}
                </div>
                <p className="text-2xs text-[var(--muted)]">
                  {session.registerName ? `${session.registerName} · ` : ""}
                  {session.saleCount} {copy.sales}
                </p>
                {session.stockPlaceName ? (
                  <p className="text-2xs text-[var(--muted)]">
                    {copy.stockPlace} {session.stockPlaceName}
                  </p>
                ) : null}
              </div>
              <Button variant="primary" className="w-full" onClick={() => join(session.id)} disabled={pending}>
                {copy.joinSession}
              </Button>
            </Card>
          ))}
        </CardGrid>
      )}
    </div>
  );
}
