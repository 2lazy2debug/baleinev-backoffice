"use client";

import { signOut } from "next-auth/react";

type SignOutButtonProps = {
  compact?: boolean;
  label?: string;
};

export function SignOutButton({ compact = false, label = "Sign out" }: SignOutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`inline-flex items-center justify-center border border-transparent bg-[var(--accent)] text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] ${
        compact ? "h-9 w-9" : "h-9 w-full px-4 whitespace-nowrap"
      }`}
      title={compact ? label : undefined}
      aria-label={label}
    >
      {compact ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      ) : (
        label
      )}
    </button>
  );
}