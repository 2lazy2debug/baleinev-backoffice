"use client";

import { useState } from "react";

import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";

import { createMoneyAccountAction } from "./actions";

type Props = {
  locale: Locale;
};

export default function CreateMoneyAccountForm({ locale }: Props) {
  const copy = dictionaries[locale];
  const [type, setType] = useState<"BANK" | "CASH">("BANK");

  return (
    <form action={createMoneyAccountAction} className="mt-6 space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">{copy.moneyAccounts.accountName}</span>
        <input
          type="text"
          name="name"
          placeholder="Compte courant"
          required
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">{copy.moneyAccounts.type}</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as "BANK" | "CASH")}
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
        >
          <option value="BANK">{copy.moneyAccounts.bank}</option>
          <option value="CASH">{copy.moneyAccounts.cash}</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">{copy.moneyAccounts.openingBalanceLong}</span>
        <input
          type="number"
          name="openingBalance"
          step="0.01"
          defaultValue="0"
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      {type === "BANK" ? (
        <>
          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.moneyAccounts.iban}</span>
            <input
              type="text"
              name="iban"
              placeholder="CH00 0000 0000 0000 0000 0"
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 uppercase outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.moneyAccounts.beneficiaryName}</span>
            <input
              type="text"
              name="beneficiaryName"
              placeholder="Baleinev Festival"
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{copy.moneyAccounts.beneficiaryAddress}</span>
            <input
              type="text"
              name="beneficiaryAddress"
              placeholder="Rue de la Baleine 1"
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[110px_1fr_90px]">
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.moneyAccounts.beneficiaryPostalCode}</span>
              <input
                type="text"
                name="beneficiaryPostalCode"
                placeholder="1000"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.moneyAccounts.beneficiaryCity}</span>
              <input
                type="text"
                name="beneficiaryCity"
                placeholder="Lausanne"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">{copy.moneyAccounts.country}</span>
              <input
                type="text"
                name="beneficiaryCountry"
                maxLength={2}
                defaultValue="CH"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 uppercase outline-none transition focus:border-[var(--accent)]"
              />
            </label>
          </div>
        </>
      ) : null}

      <button className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
        {copy.moneyAccounts.add}
      </button>
    </form>
  );
}
