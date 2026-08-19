"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { mobileNavButtonClasses } from "@/components/mobile/mobile-nav-button";
import { Button, IconButton } from "@/components/ui";

type SignOutButtonProps = {
  /** Icon-only, for the collapsed sidebar — same footprint as the icons next to it. */
  compact?: boolean;
  /** Stacked icon + label, for the mobile bottom bar — matches the nav buttons beside it. */
  nav?: boolean;
  label?: string;
};

export function SignOutButton({ compact = false, nav = false, label = "Sign out" }: SignOutButtonProps) {
  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  if (nav) {
    return (
      <button type="button" className={mobileNavButtonClasses} onClick={handleSignOut}>
        <LogOut />
        <span className="max-w-16 truncate">{label}</span>
      </button>
    );
  }

  if (compact) {
    return (
      <IconButton tone="primary" size="md" label={label} onClick={handleSignOut}>
        <LogOut />
      </IconButton>
    );
  }

  return (
    <Button variant="primary" className="w-full" onClick={handleSignOut}>
      <LogOut />
      {label}
    </Button>
  );
}
