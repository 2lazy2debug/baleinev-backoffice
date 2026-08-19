"use client";

import { Button, Card, buttonClasses } from "@/components/ui";
import { dictionaries, localeCookieName, type Locale } from "@/lib/i18n-dictionaries";

import "./globals.css";

function getClientLocale(): Locale {
  if (typeof document === "undefined") {
    return "en";
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${localeCookieName}=([^;]*)`));
  return match?.[1] === "fr" ? "fr" : "en";
}

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const copy = dictionaries[getClientLocale()].errorPage;

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center p-6">
          <Card as="div" className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-lg font-semibold">{copy.title}</h1>
            <p className="text-sm text-[var(--muted)]">{copy.description}</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="primary" onClick={reset}>
                {copy.retry}
              </Button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the root layout, so the router context Link needs may not be mounted */}
              <a href="/" className={buttonClasses()}>
                {copy.backToDashboard}
              </a>
            </div>
          </Card>
        </div>
      </body>
    </html>
  );
}
