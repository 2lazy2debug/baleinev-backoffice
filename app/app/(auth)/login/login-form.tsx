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
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(0,166,140,0.2)_0%,transparent_36%),radial-gradient(circle_at_80%_92%,rgba(0,90,160,0.18)_0%,transparent_34%),linear-gradient(180deg,#0b1724_0%,#071120_100%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.24)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-[28rem]">
          <div className="relative isolate overflow-hidden rounded-[32px] border border-[rgba(255,255,255,0.16)] bg-[linear-gradient(180deg,rgba(15,29,43,0.94)_0%,rgba(11,22,34,0.92)_100%)] p-6 shadow-[0_30px_90px_rgba(1,8,18,0.52)] sm:p-8">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />

            <div className="relative space-y-5">
              <div className="flex flex-col items-end gap-4">
                <div className="inline-flex rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(13,31,46,0.68)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
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
                    className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(8,21,33,0.7)] px-4 py-3 outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)] focus:bg-[rgba(10,27,39,0.78)]"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">{copy.password}</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(8,21,33,0.7)] px-4 py-3 outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)] focus:bg-[rgba(10,27,39,0.78)]"
                  />
                </label>

                {error ? (
                  <p className="rounded-xl border border-rose-400/20 bg-rose-950/35 px-4 py-3 text-sm text-rose-200">{error}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-xl bg-[linear-gradient(135deg,var(--accent)_0%,#10c8b4_100%)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
