import Link from "next/link";

import { Card, buttonClasses } from "@/components/ui";
import { getDictionary, getLocale } from "@/lib/i18n";

export default async function NotFound() {
  const locale = await getLocale();
  const copy = getDictionary(locale).notFoundPage;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card as="div" className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-[var(--muted)]">{copy.description}</p>
        <Link href="/" className={buttonClasses("primary")}>
          {copy.backToDashboard}
        </Link>
      </Card>
    </div>
  );
}
