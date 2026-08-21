"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardGrid,
  Chip,
  Field,
  Input,
  SectionTitle,
  Select,
  cn,
  nestedSurfaceClasses,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import {
  changePasswordAction,
  requestDepartmentAccessAction,
  updateAccountNameAction,
  updateBankDetailsAction,
} from "./actions";
import { TwoFactorCard } from "./two-factor-card";

type Copy = (typeof dictionaries)[Locale]["account"];

type Props = {
  locale: Locale;
  profile: {
    name: string;
    email: string;
    role: "ADMIN" | "DEPARTMENT";
    departmentRoleNames: string[];
  };
  bankDetails: {
    firstName: string | null;
    lastName: string | null;
    iban: string | null;
    zip: string | null;
    city: string | null;
  };
  /** Departments the user is neither in nor already waiting on — the only ones worth asking for. */
  joinableDepartments: { id: string; name: string }[];
  /** Departments already asked for and not yet cleared by an admin. */
  pendingDepartmentRequests: { id: string; name: string }[];
  twoFactor: { enabled: boolean; configured: boolean };
};

/**
 * The account screen: one card per thing a user can change about themselves.
 *
 * Each card owns its own form and its own `useActionState`, so a failed password
 * change never blanks the name field next to it, and "Saved." names the card it
 * belongs to.
 */
export function AccountPageClient({
  locale,
  profile,
  bankDetails,
  joinableDepartments,
  pendingDepartmentRequests,
  twoFactor,
}: Props) {
  const copy = dictionaries[locale].account;

  const [nameState, nameFormAction, isSavingName] = useActionState(updateAccountNameAction, initialActionState);
  const [bankState, bankFormAction, isSavingBank] = useActionState(updateBankDetailsAction, initialActionState);
  const [passwordState, passwordFormAction, isChangingPassword] = useActionState(
    changePasswordAction,
    initialActionState,
  );
  const [requestState, requestFormAction, isRequesting] = useActionState(
    requestDepartmentAccessAction,
    initialActionState,
  );

  return (
    <CardGrid>
      <Card as="section" span="1/2">
        <SectionTitle>{copy.profile}</SectionTitle>

        <form action={nameFormAction} className="mt-4 space-y-3">
          <Field label={copy.name} htmlFor="account-name">
            <Input id="account-name" name="name" type="text" defaultValue={profile.name} required />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={isSavingName}>
              {isSavingName ? copy.saving : copy.save}
            </Button>
            <SavedNotice state={nameState} copy={copy} />
          </div>
          <FormError message={nameState.error} />
        </form>

        <dl className="mt-5 space-y-3 border-t border-[var(--line)] pt-4 text-sm">
          <ReadOnlyRow label={copy.email}>{profile.email}</ReadOnlyRow>
          <ReadOnlyRow label={copy.role}>
            {profile.role === "ADMIN" ? copy.roleAdmin : copy.roleDepartment}
          </ReadOnlyRow>
          <ReadOnlyRow label={copy.departments}>
            {profile.departmentRoleNames.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {profile.departmentRoleNames.map((name) => (
                  <Chip key={name}>{name}</Chip>
                ))}
              </span>
            ) : (
              <span className="text-[var(--muted)]">{copy.noDepartments}</span>
            )}
          </ReadOnlyRow>
        </dl>
      </Card>

      <Card as="section" span="1/2">
        <SectionTitle>{copy.bankDetails}</SectionTitle>
        <p className="mt-1 text-sm text-[var(--muted)]">{copy.bankDetailsHint}</p>

        <form action={bankFormAction} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.firstName} htmlFor="refund-first-name">
              <Input
                id="refund-first-name"
                name="refundFirstName"
                type="text"
                defaultValue={bankDetails.firstName ?? ""}
              />
            </Field>
            <Field label={copy.lastName} htmlFor="refund-last-name">
              <Input
                id="refund-last-name"
                name="refundLastName"
                type="text"
                defaultValue={bankDetails.lastName ?? ""}
              />
            </Field>
          </div>
          <Field label={copy.iban} htmlFor="refund-iban">
            <Input
              id="refund-iban"
              name="refundIban"
              type="text"
              defaultValue={bankDetails.iban ?? ""}
              className="uppercase"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <Field label={copy.zip} htmlFor="refund-zip">
              <Input id="refund-zip" name="refundZip" type="text" defaultValue={bankDetails.zip ?? ""} />
            </Field>
            <Field label={copy.city} htmlFor="refund-city">
              <Input id="refund-city" name="refundCity" type="text" defaultValue={bankDetails.city ?? ""} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={isSavingBank}>
              {isSavingBank ? copy.saving : copy.save}
            </Button>
            <SavedNotice state={bankState} copy={copy} />
          </div>
          <FormError message={bankState.error} />
        </form>
      </Card>

      <Card as="section" span="1/2">
        <SectionTitle>{copy.password}</SectionTitle>

        {/* `key` remounts the form once a change goes through, which is what clears
            the three fields — a password field must not keep what was typed in it. */}
        <form
          key={passwordState.saved ? "changed" : "editing"}
          action={passwordFormAction}
          className="mt-4 space-y-3"
        >
          <Field label={copy.currentPassword} htmlFor="current-password">
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label={copy.newPassword} htmlFor="new-password">
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label={copy.confirmPassword} htmlFor="confirm-password">
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" variant="primary" disabled={isChangingPassword}>
            {isChangingPassword ? copy.saving : copy.changePassword}
          </Button>
        </form>

        {passwordState.saved ? (
          <Alert tone="success" className="mt-3">
            {copy.passwordChanged}
          </Alert>
        ) : null}
        <FormError message={passwordState.error} className="mt-3" />
      </Card>

      <Card as="section" span="1/2">
        <SectionTitle>{copy.departmentAccess}</SectionTitle>
        <p className="mt-1 text-sm text-[var(--muted)]">{copy.departmentAccessHint}</p>

        {pendingDepartmentRequests.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {pendingDepartmentRequests.map((department) => (
              <li
                key={department.id}
                className={cn(nestedSurfaceClasses, "flex items-center justify-between gap-3 px-3 py-2 text-sm")}
              >
                <span className="min-w-0 truncate">{department.name}</span>
                <Badge tone="warning" className="shrink-0">
                  {copy.requestPending}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {/* `key` remounts the form once a request goes through, so the select drops
            back to its placeholder instead of pointing at a department that has
            just left the list. */}
        {joinableDepartments.length > 0 ? (
          <form
            key={pendingDepartmentRequests.length}
            action={requestFormAction}
            className="mt-4 space-y-3"
          >
            {/* No field label: the card title already says what this picks. */}
            <Select aria-label={copy.departmentAccess} name="departmentRoleId" defaultValue="" required>
              <option value="">{copy.pickDepartment}</option>
              {joinableDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary" disabled={isRequesting}>
              {isRequesting ? copy.saving : copy.requestAccess}
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">{copy.noDepartmentsToJoin}</p>
        )}

        {requestState.saved ? (
          <Alert tone="success" className="mt-3">
            {copy.requestSent}
          </Alert>
        ) : null}
        <FormError message={requestState.error} className="mt-3" />
      </Card>

      <TwoFactorCard copy={copy} enabled={twoFactor.enabled} configured={twoFactor.configured} />
    </CardGrid>
  );
}

function ReadOnlyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function SavedNotice({ state, copy }: { state: ActionState; copy: Copy }) {
  if (!state.saved) {
    return null;
  }

  return <span className="text-xs font-medium text-emerald-300">{copy.saved}</span>;
}
