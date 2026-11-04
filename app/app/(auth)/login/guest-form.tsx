"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

import { Alert, Button, Field, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

import { registerGuestAction } from "./actions";
import { goToLandingPage } from "./landing";
import type { LoginCopy } from "./login-form";

export function GuestForm({ copy }: { copy: LoginCopy }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const messages: Record<NonNullable<Awaited<ReturnType<typeof registerGuestAction>>["error"]>, string> = {
    missingFields: copy.guestMissingFields,
    passwordTooShort: copy.passwordTooShort.replace("{min}", String(MIN_PASSWORD_LENGTH)),
    emailTaken: copy.emailTaken,
    failed: copy.registerFailed,
  };

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const { error: code } = await registerGuestAction(formData);
    if (code) {
      setPending(false);
      setError(messages[code]);
      return;
    }

    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });
    if (!result || result.error) {
      setPending(false);
      setError(copy.guestSignInFailed);
      return;
    }

    await goToLandingPage();
  }

  return (
    // onSubmit, not action=: React 19 resets an action form after it runs, which would wipe
    // the name and email when the server answers "email taken".
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(new FormData(event.currentTarget));
      }}
      className="space-y-5 pt-1"
    >
      <Field required label={copy.name}>
        <Input name="name" autoComplete="name" required />
      </Field>

      <Field required label={copy.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field required label={copy.password}>
        <Input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>

      {error ? <Alert>{error}</Alert> : null}

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? copy.creatingAccount : copy.guestSubmit}
      </Button>
    </form>
  );
}
