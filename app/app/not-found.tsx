import Link from "next/link";

import { getDictionary, getLocale } from "@/lib/i18n";

export default async function NotFound() {
  const locale = await getLocale();
  const copy = getDictionary(locale).notFoundPage;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-[var(--muted)]">{copy.description}</p>
        <Link
          href="/"
          className="inline-block rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]"
        >
          {copy.backToDashboard}
        </Link>
      </div>
    </div>
  );
}
