"use client";

import Image from "next/image";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";

import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";

type LoginCopy = {
  badge: string;
  email: string;
  password: string;
  invalidCredentials: string;
  signingIn: string;
  submit: string;
};

export default function LoginForm({ copy }: { copy: LoginCopy }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });

    if (!result || result.error) {
      setPending(false);
      setError(copy.invalidCredentials);
      return;
    }

    // Send each role straight to its landing page so DEPARTMENT users don't
    // load "/" only to be bounced to "/budget" by the route gating.
    const session = await getSession();
    window.location.href = session?.user?.role === "DEPARTMENT" ? "/budget" : "/";
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
                <Field label={copy.email}>
                  <Input name="email" type="email" autoComplete="email" required />
                </Field>

                <Field label={copy.password}>
                  <Input name="password" type="password" autoComplete="current-password" required />
                </Field>

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
