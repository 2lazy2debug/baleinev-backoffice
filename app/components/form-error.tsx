export function FormError({ message, className = "" }: { message: string | null | undefined; className?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p className={`rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200 ${className}`}>
      {message}
    </p>
  );
}
