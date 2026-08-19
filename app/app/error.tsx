"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, Card, buttonClasses } from "@/components/ui";
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
      <Card as="div" className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-[var(--muted)]">
          {process.env.NODE_ENV === "development" && error.message ? error.message : copy.description}
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="primary" onClick={reset}>
            {copy.retry}
          </Button>
          <Link href="/" className={buttonClasses()}>
            {copy.backToDashboard}
          </Link>
        </div>
      </Card>
    </div>
  );
}
