export type ActionState = {
  error: string | null;
  /**
   * Set by actions whose success has nothing to show — a form that saves the
   * record it is already displaying. Without it `{ error: null }` means both
   * "not submitted yet" and "saved", and the screen can never say so.
   */
  saved?: boolean;
};

export const initialActionState: ActionState = { error: null };

export function toActionErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}
