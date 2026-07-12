"use client";

import Link from "next/link";
import { useEffect } from "react";

import { dictionaries, localeCookieName, type Locale } from "@/lib/i18n-dictionaries";

function getClientLocale(): Locale {
  if (typeof document === "undefined") {
    return "en";
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${localeCookieName}=([^;]*)`));
  return match?.[1] === "fr" ? "fr" : "en";
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const copy = dictionaries[getClientLocale()].errorPage;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-[var(--muted)]">
          {process.env.NODE_ENV === "development" && error.message ? error.message : copy.description}
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]"
          >
            {copy.retry}
          </button>
          <Link
            href="/"
            className="rounded-md border border-[var(--line)] px-4 py-2 text-xs font-semibold hover:bg-[var(--panel-strong)]"
          >
            {copy.backToDashboard}
          </Link>
        </div>
      </div>
    </div>
  );
}
