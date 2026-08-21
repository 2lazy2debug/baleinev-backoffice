"use client";

import { useActionState, useState, useTransition } from "react";

import { FormError } from "@/components/form-error";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  cn,
  nestedSurfaceClasses,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  cancelTwoFactorEnrolmentAction,
  disableTwoFactorAction,
  enableTwoFactorAction,
  startTwoFactorEnrolmentAction,
} from "./actions";

type Copy = (typeof dictionaries)[Locale]["account"];

type Props = {
  copy: Copy;
  /** Straight from the server page — both actions revalidate `/account`, so this stays current. */
  enabled: boolean;
  /** False when the server has no vault master key: nothing can be sealed, so nothing is offered. */
  configured: boolean;
};

/** Base32 in groups of four, for someone typing the key in instead of scanning it. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Two-factor sign-in, in the three states it can be in: off, mid-enrolment
 * (QR on screen, waiting for the first code), and on.
 *
 * The secret is only ever on screen during enrolment — once 2FA is on, the
 * server never hands it back, so the way out is to turn it off and start again.
 */
export function TwoFactorCard({ copy, enabled, configured }: Props) {
  const [enrolment, setEnrolment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();

  const [confirmState, confirmAction, isConfirming] = useActionState(enableTwoFactorAction, initialActionState);
  const [disableState, disableAction, isDisabling] = useActionState(disableTwoFactorAction, initialActionState);

  // The QR belongs to a pending seed, and turning 2FA on or off spends it. React's
  // "adjust state when a prop changes" pattern rather than an effect: it drops the
  // stale QR in the same render the flag flips, with no second pass.
  const [enrolmentGeneration, setEnrolmentGeneration] = useState(enabled);
  if (enrolmentGeneration !== enabled) {
    setEnrolmentGeneration(enabled);
    setEnrolment(null);
  }

  function startEnrolment() {
    setStartError(null);
    startTransition(async () => {
      const result = await startTwoFactorEnrolmentAction();

      if (result.ok) {
        setEnrolment({ secret: result.secret, qrDataUrl: result.qrDataUrl });
      } else {
        setStartError(result.error);
      }
    });
  }

  function cancelEnrolment() {
    setEnrolment(null);
    startTransition(async () => {
      await cancelTwoFactorEnrolmentAction();
    });
  }

  return (
    <Card as="section" span="1/2">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle>{copy.twoFactor}</SectionTitle>
        <Badge tone={enabled ? "success" : "neutral"} className="shrink-0 whitespace-nowrap">
          {enabled ? copy.twoFactorOn : copy.twoFactorOff}
        </Badge>
      </div>

      {!configured ? (
        <Alert tone="warning" className="mt-4">
          {copy.twoFactorUnavailable}
        </Alert>
      ) : enabled ? (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">{copy.twoFactorOnHint}</p>

          {confirmState.saved ? (
            <Alert tone="success" className="mt-3">
              {copy.twoFactorTurnedOn}
            </Alert>
          ) : null}

          <form action={disableAction} className="mt-4 space-y-3">
            <p className="text-sm text-[var(--muted)]">{copy.twoFactorDisableHint}</p>
            <Field label={copy.currentPassword} htmlFor="two-factor-password">
              <Input
                id="two-factor-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button type="submit" variant="destructive" disabled={isDisabling}>
              {isDisabling ? copy.saving : copy.twoFactorDisable}
            </Button>
            <FormError message={disableState.error} />
          </form>
        </>
      ) : enrolment ? (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">{copy.twoFactorScan}</p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* A data: URI SVG, generated per enrolment — next/image has nothing to optimise here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolment.qrDataUrl}
              alt={copy.twoFactorQrAlt}
              className="h-40 w-40 shrink-0 rounded-lg"
            />

            <div className="min-w-0 flex-1 space-y-3">
              <div className={cn(nestedSurfaceClasses, "px-3 py-2")}>
                <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {copy.twoFactorManualKey}
                </p>
                <p className="mt-1 font-mono text-sm">{groupSecret(enrolment.secret)}</p>
              </div>

              <form action={confirmAction} className="space-y-3">
                <Field label={copy.twoFactorCode} htmlFor="two-factor-code">
                  <Input
                    id="two-factor-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    className="font-mono tracking-[0.3em]"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" disabled={isConfirming}>
                    {isConfirming ? copy.saving : copy.twoFactorConfirm}
                  </Button>
                  <Button type="button" variant="ghost" onClick={cancelEnrolment}>
                    {copy.twoFactorCancel}
                  </Button>
                </div>
                <FormError message={confirmState.error} />
              </form>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">{copy.twoFactorHint}</p>

          {disableState.saved ? (
            <Alert tone="success" className="mt-3">
              {copy.twoFactorTurnedOff}
            </Alert>
          ) : null}

          <div className="mt-4">
            <Button variant="primary" onClick={startEnrolment} disabled={isStarting}>
              {isStarting ? copy.saving : copy.enableTwoFactor}
            </Button>
          </div>

          <FormError message={startError} className="mt-3" />
        </>
      )}
    </Card>
  );
}
