"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button, IconButton } from "@/components/ui";

type SignOutButtonProps = {
  /** Icon-only, for the collapsed sidebar — same footprint as the icons next to it. */
  compact?: boolean;
  label?: string;
};

export function SignOutButton({ compact = false, label = "Sign out" }: SignOutButtonProps) {
  const handleSignOut = () => signOut({ callbackUrl: "/login" });

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
