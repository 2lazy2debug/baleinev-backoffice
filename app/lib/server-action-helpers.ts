import { unstable_rethrow } from "next/navigation";

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

/**
 * The message a form shows for a failed action. A redirect() thrown inside the action's
 * try (no session, a guest refused by getCurrentUserAccess) is rethrown so Next performs it.
 */
export function toActionErrorMessage(err: unknown): string {
  unstable_rethrow(err);
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}
