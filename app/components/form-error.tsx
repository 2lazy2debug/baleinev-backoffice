import { Alert } from "@/components/ui";

/** Server-action error text — renders nothing when there is no message. */
export function FormError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) {
    return null;
  }

  return <Alert className={className}>{message}</Alert>;
}
