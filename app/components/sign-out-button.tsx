"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { MobileSheetRow } from "@/components/mobile/mobile-sheet";
// Leaf imports rather than the `@/components/ui` barrel: the account menu renders
// this, <PageHeader> renders the account menu, and the barrel re-exports PageHeader.
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

type SignOutButtonProps = {
  /** Icon-only, for the collapsed sidebar — same footprint as the icons next to it. */
  compact?: boolean;
  /** A sheet row, for the mobile account menu — matches the rows above it. */
  row?: boolean;
  label?: string;
};

export function SignOutButton({ compact = false, row = false, label = "Sign out" }: SignOutButtonProps) {
  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  if (row) {
    return <MobileSheetRow icon={LogOut} label={label} tone="danger" onClick={handleSignOut} />;
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
