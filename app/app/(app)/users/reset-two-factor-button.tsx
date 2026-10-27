"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";

import { Button, Modal } from "@/components/ui";

/**
 * Turns off another account's second factor. Not a delete, so not
 * `ConfirmDelete` — but it weakens the account, so it still asks first. The
 * form with the hidden userId lives with the caller; confirm submits it by id.
 */
export function ResetTwoFactorButton({
  form,
  label,
  subject,
  message,
  cancelLabel,
  disabled,
}: {
  form: string;
  label: string;
  subject: string;
  message: string;
  cancelLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        icon={<ShieldOff className="h-4 w-4" />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              form={form}
              variant="destructive"
              // Closing now would unmount the submit button before the browser submits its form.
              onClick={() => setTimeout(() => setOpen(false), 0)}
            >
              {label}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="font-semibold">{subject}</p>
          <p className="text-sm text-[var(--muted)]">{message}</p>
        </div>
      </Modal>
    </>
  );
}
