"use client";

import Image from "next/image";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";

import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import { TWO_FACTOR_INVALID, TWO_FACTOR_REQUIRED } from "@/lib/auth-signals";

type LoginCopy = {
  badge: string;
  email: string;
  password: string;
  invalidCredentials: string;
  twoFactorCode: string;
  twoFactorHint: string;
  twoFactorInvalid: string;
  signingIn: string;
  submit: string;
};

export default function LoginForm({ copy }: { copy: LoginCopy }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /**
   * Set once the password has checked out on an account with 2FA on. The
   * credentials call is stateless — the second attempt has to resend what the
   * first one proved — so the screen holds them while it asks for the code.
   */
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const email = pendingCredentials?.email ?? String(formData.get("email") ?? "");
    const password = pendingCredentials?.password ?? String(formData.get("password") ?? "");

    const result = await signIn("credentials", {
      email,
      password,
      totp: String(formData.get("totp") ?? ""),
      redirect: false,
    });

    if (result?.error === TWO_FACTOR_REQUIRED) {
      setPendingCredentials({ email, password });
      setPending(false);
      return;
    }

    if (result?.error === TWO_FACTOR_INVALID) {
      setPending(false);
      setError(copy.twoFactorInvalid);
      return;
    }

    if (!result || result.error) {
      setPending(false);
      // Whatever was wrong, it was not the code — back to email and password.
      setPendingCredentials(null);
      setError(copy.invalidCredentials);
      return;
    }

    // Send each role straight to its landing page so DEPARTMENT users don't
    // load "/" only to be bounced to "/budget" by the route gating.
    const session = await getSession();
    window.location.href = session?.user?.role === "DEPARTMENT" ? "/events" : "/";
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-[28rem]">
          <Card as="div">
            <div className="space-y-5">
              <div className="flex flex-col items-end gap-4">
                <Badge tone="neutral">{copy.badge}</Badge>

                <div className="px-1 py-1">
                  <Image
                    src="/logo_blv.png"
                    alt="Baleinev"
                    width={280}
                    height={112}
                    className="w-full max-w-[13rem] object-contain"
                    priority
                  />
                </div>
              </div>

              <form action={handleSubmit} className="space-y-5 pt-1">
                {pendingCredentials ? (
                  <>
                    <p className="text-sm text-[var(--muted)]">{copy.twoFactorHint}</p>

                    <Field label={copy.twoFactorCode}>
                      <Input
                        name="totp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        autoFocus
                        required
                        className="font-mono tracking-[0.3em]"
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label={copy.email}>
                      <Input name="email" type="email" autoComplete="email" required />
                    </Field>

                    <Field label={copy.password}>
                      <Input name="password" type="password" autoComplete="current-password" required />
                    </Field>
                  </>
                )}

                {error ? (
                  <Alert>{error}</Alert>
                ) : null}

                <Button type="submit" variant="primary" disabled={pending} className="w-full">
                  {pending ? copy.signingIn : copy.submit}
                </Button>
              </form>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
