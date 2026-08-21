"use client";

import { useEffect, useRef } from "react";

import type { ActionState } from "@/lib/server-action-helpers";

/**
 * Closes a create modal once its own submission comes back without an error.
 *
 * Every create action in the app is a `Modal` over a `useActionState` form (see
 * the create-action rule in the root `CLAUDE.md`). A server action that succeeds
 * only revalidates the page — it never navigates — so without this the dialog
 * would sit open over a list that already holds the new row, and the obvious
 * reaction is to submit again.
 *
 * Returns the `onSubmit` handler the form has to call: `error === null` is also
 * the *initial* state, so the hook needs to know a submission actually happened
 * before it reads that as success. The flag is a ref, not state — `pending` and
 * the action's own result are what re-render the form; the flag only has to
 * survive until they do.
 */
export function useCloseOnSuccess(state: ActionState, pending: boolean, close: () => void) {
  const submitted = useRef(false);

  useEffect(() => {
    if (!submitted.current || pending) {
      return;
    }

    submitted.current = false;

    if (state.error === null) {
      close();
    }
  }, [pending, state, close]);

  return () => {
    submitted.current = true;
  };
}
