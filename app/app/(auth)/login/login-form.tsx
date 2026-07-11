"use client";

import Image from "next/image";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";

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
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8">
            <div className="space-y-5">
              <div className="flex flex-col items-end gap-4">
                <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                  {copy.badge}
                </div>

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
                <label className="block space-y-2">
                  <span className="text-sm font-medium">{copy.email}</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)]"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">{copy.password}</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)]"
                  />
                </label>

                {error ? (
                  <p className="rounded-md border border-rose-400/20 bg-rose-950/35 px-4 py-3 text-sm text-rose-200">{error}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? copy.signingIn : copy.submit}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
