"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Modal } from "./Modal";
import type { ControlSize } from "./control";

type ConfirmDeleteProps = {
  /** Trigger's accessible name, the dialog title and the confirm text. */
  label: string;
  /** What is being deleted — shown bold above the message. */
  subject?: string;
  message?: string;
  cancelLabel: string;
  /** `icon` for row actions, `button` where the word is the safeguard. */
  trigger?: "icon" | "button";
  size?: ControlSize;
  disabled?: boolean;
  className?: string;
} & (
  | {
      /** id of a `<form>` elsewhere on the page; confirm submits it. */
      form: string;
      onConfirm?: never;
    }
  | {
      form?: never;
      onConfirm: () => void;
    }
);

/**
 * The one way to delete anything: a trigger that opens a confirm dialog.
 * The delete form keeps its hidden inputs; this owns the trigger and the dialog.
 */
export function ConfirmDelete({
  label,
  subject,
  message,
  cancelLabel,
  trigger = "icon",
  size,
  disabled,
  className,
  form,
  onConfirm,
}: ConfirmDeleteProps) {
  const [open, setOpen] = useState(false);

  function confirm() {
    if (onConfirm) {
      onConfirm();
      setOpen(false);
      return;
    }
    // Closing now would unmount the submit button before the browser submits its form.
    setTimeout(() => setOpen(false), 0);
  }

  return (
    <>
      {trigger === "button" ? (
        <Button
          type="button"
          variant="destructive"
          size={size}
          icon={<Trash2 className="h-4 w-4" />}
          disabled={disabled}
          className={className}
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
      ) : (
        <IconButton
          type="button"
          tone="delete"
          size={size}
          label={label}
          disabled={disabled}
          className={className}
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      )}

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
              type={form ? "submit" : "button"}
              form={form}
              variant="destructive"
              onClick={confirm}
            >
              {label}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {subject ? <p className="font-semibold">{subject}</p> : null}
          {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
        </div>
      </Modal>
    </>
  );
}
