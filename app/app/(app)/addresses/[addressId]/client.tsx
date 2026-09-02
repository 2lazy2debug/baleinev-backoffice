"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  AddressFields,
  BankAccountFields,
  type AddressDraft,
  type AddressTypeOption,
  type BankAccountDraft,
  emptyBankAccountDraft,
} from "@/components/address-fields";
import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  Cardlet,
  CardletActions,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  SectionTitle,
  TD,
  TH,
  THead,
  TR,
  Table,
  buttonClasses,
  compactOnMobileWidths,
} from "@/components/ui";
import { addressDisplayName, addressPersonName, formatPhone, formatPostalLine } from "@/lib/addresses";
import { countryName, type CountryOption } from "@/lib/countries";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import {
  createAddressBankAccountAction,
  deleteAddressAction,
  deleteAddressBankAccountAction,
  updateAddressAction,
  updateAddressBankAccountAction,
} from "../actions";

type BankAccountRow = BankAccountDraft & { id: string };

type ReadFieldProps = {
  label: string;
  children?: React.ReactNode;
};

/**
 * One label and its value in the read view. Same shape as a <CardletField>,
 * because that is what a read-only row is — the difference is only that this
 * one wraps instead of truncating: an address is what the screen is *for*, so
 * nothing on it may be cut off.
 */
function ReadField({ label, children }: ReadFieldProps) {
  return (
    <div className="min-w-0">
      <p className="text-3xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <div className="break-words text-sm">{children || <span className="text-[var(--muted)]">-</span>}</div>
    </div>
  );
}

type Props = {
  locale: Locale;
  countries: CountryOption[];
  addressTypes: AddressTypeOption[];
  canDelete: boolean;
  address: AddressDraft & { id: string };
  bankAccounts: BankAccountRow[];
};

const ADDRESS_FORM_ID = "address-detail-form";
const BANK_FORM_ID = "address-bank-account-form";
const DELETE_FORM_ID = "delete-address-form";

/**
 * One address, in full: its own fields on top, its bank accounts underneath.
 *
 * The page is a client component all the way up to <PageHeader> because the
 * header's action is the bank-account dialog's trigger, and that dialog owns
 * its own open state — the same reason Passwords and Calendar own their headers.
 */
export function AddressDetailClient({ locale, countries, addressTypes, canDelete, address, bankAccounts }: Props) {
  const copy = dictionaries[locale].addresses;
  const shellCopy = dictionaries[locale].shell;
  const router = useRouter();

  // Opening an address reads it. The pencil is what turns the same card into
  // the form — nothing here is editable by having been arrived at.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(address);
  const [saveState, saveFormAction, isSaving] = useActionState(updateAddressAction, initialActionState);

  // Cancel throws the draft away, so a half-typed edit does not survive as the
  // page's idea of what this address says.
  function cancelEdit() {
    setDraft(address);
    setIsEditing(false);
  }

  // A save that went through has nothing left to edit — back to reading. Same
  // hook every dialog in the app closes with, because it is the same question:
  // did *this* submission come back clean.
  const markSaveSubmitted = useCloseOnSuccess(saveState, isSaving, () => setIsEditing(false));

  const typeName = addressTypes.find((addressType) => addressType.id === draft.addressTypeId)?.name ?? "";
  const personName = addressPersonName(draft);
  const phone = formatPhone(draft.phonePrefix, draft.phoneNumber);

  // One dialog for both writes: `editingId` is what makes it an edit rather
  // than a create, and it is also what the submit handler branches on.
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bankDraft, setBankDraft] = useState<BankAccountDraft>(() => emptyBankAccountDraft());

  async function submitBankAccount(previous: ActionState, formData: FormData): Promise<ActionState> {
    return editingId
      ? updateAddressBankAccountAction(previous, formData)
      : createAddressBankAccountAction(previous, formData);
  }

  const [bankState, bankFormAction, isSavingBank] = useActionState(submitBankAccount, initialActionState);
  const markBankSubmitted = useCloseOnSuccess(bankState, isSavingBank, () => setIsBankModalOpen(false));

  const [deleteBankState, deleteBankFormAction, isDeletingBank] = useActionState(
    deleteAddressBankAccountAction,
    initialActionState,
  );

  async function deleteAddress(previous: ActionState, formData: FormData): Promise<ActionState> {
    const result = await deleteAddressAction(previous, formData);
    if (!result.error) {
      router.push("/addresses");
    }
    return result;
  }
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteAddress, initialActionState);

  function openCreateBankAccount() {
    setEditingId(null);
    setBankDraft(emptyBankAccountDraft());
    setIsBankModalOpen(true);
  }

  function openEditBankAccount(bankAccount: BankAccountRow) {
    setEditingId(bankAccount.id);
    setBankDraft(bankAccount);
    setIsBankModalOpen(true);
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      <PageHeader
        eyebrow={copy.title}
        title={addressDisplayName(draft)}
        actions={
          <>
            {/* A Link cannot take <Button compactOnMobile>, so it borrows the
                same recipe: icon everywhere, label once there is room for it. */}
            <Link
              href="/addresses"
              title={copy.backToList}
              aria-label={copy.backToList}
              className={buttonClasses("secondary", "md", compactOnMobileWidths.md)}
            >
              <ArrowLeft />
              <span className="hidden lg:inline">{copy.backToList}</span>
            </Link>
            <Button variant="primary" icon={<Plus />} compactOnMobile onClick={openCreateBankAccount}>
              {copy.addBankAccount}
            </Button>
          </>
        }
      />

      <CardGrid>
        <Card span="full" as="section">
          <div className="flex items-start justify-between gap-3">
            <SectionTitle>{isEditing ? copy.details : copy.description}</SectionTitle>
            {isEditing ? (
              <IconButton tone="neutral" label={shellCopy.cancel} onClick={() => cancelEdit()}>
                <X />
              </IconButton>
            ) : (
              <IconButton tone="accent" label={copy.edit} onClick={() => setIsEditing(true)}>
                <Pencil />
              </IconButton>
            )}
          </div>

          {isEditing ? (
            <>
              <form id={ADDRESS_FORM_ID} action={saveFormAction} onSubmit={markSaveSubmitted} className="mt-4 space-y-4">
                <FormError message={saveState.error} />
                <input type="hidden" name="addressId" value={address.id} />
                <AddressFields
                  locale={locale}
                  countries={countries}
                  addressTypes={addressTypes}
                  value={draft}
                  onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                />
              </form>

              {/* Delete is a form of its own — a form inside a form is not a thing —
                  and reaches it by id, the same way every modal footer does. */}
              {canDelete ? (
                <form id={DELETE_FORM_ID} action={deleteFormAction}>
                  <input type="hidden" name="addressId" value={address.id} />
                </form>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="submit" form={ADDRESS_FORM_ID} variant="primary" disabled={isSaving}>
                  {copy.save}
                </Button>
                {saveState.saved ? <span className="text-xs font-medium text-emerald-300">{copy.saved}</span> : null}
                {canDelete ? (
                  <Button
                    type="submit"
                    form={DELETE_FORM_ID}
                    variant="destructive"
                    icon={<Trash2 />}
                    disabled={isDeleting}
                    className="ml-auto"
                  >
                    {copy.deleteAddress}
                  </Button>
                ) : null}
              </div>
              <FormError message={deleteState.error} />
            </>
          ) : (
            <div className="mt-3 space-y-4">
              {/* The description leads: it is the one line that says why this row
                  is in the book at all, and every field under it is contact detail. */}
              <p className="whitespace-pre-wrap break-words text-sm">
                {draft.note || <span className="text-[var(--muted)]">-</span>}
              </p>

              <div className="border-t border-[var(--line)] pt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <ReadField label={copy.contactType}>
                    {typeName ? <Badge>{typeName}</Badge> : null}
                  </ReadField>
                  <ReadField label={copy.name}>{personName}</ReadField>
                  <ReadField label={copy.company}>{draft.companyName}</ReadField>
                  <ReadField label={copy.street}>{draft.street}</ReadField>
                  <ReadField label={copy.city}>{formatPostalLine(draft.postalCode, draft.city)}</ReadField>
                  <ReadField label={copy.country}>{countryName(draft.country, locale)}</ReadField>
                  {/* Tap to call, tap to write — on the device most likely to be
                      holding this screen, that is the whole point of the row. */}
                  <ReadField label={copy.phone}>
                    {phone ? (
                      <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-[var(--accent)] hover:underline">
                        {phone}
                      </a>
                    ) : null}
                  </ReadField>
                  <ReadField label={copy.email}>
                    {draft.email ? (
                      <a href={`mailto:${draft.email}`} className="text-[var(--accent)] hover:underline">
                        {draft.email}
                      </a>
                    ) : null}
                  </ReadField>
                </div>
              </div>
            </div>
          )}
        </Card>
      </CardGrid>

      <Panel flushOnMobile as="section" className="bg-[var(--panel)]">
        <PanelHeader flushOnMobile>
          <SectionTitle>{copy.bankAccounts}</SectionTitle>
        </PanelHeader>

        {deleteBankState.error ? (
          <div className="border-b border-[var(--line)] px-4 py-2">
            <FormError message={deleteBankState.error} />
          </div>
        ) : null}

        {bankAccounts.length === 0 ? (
          <p className="py-6 text-sm text-[var(--muted)] sm:px-5">{copy.noBankAccounts}</p>
        ) : (
          <>
            <Table frame={false} desktopOnly>
              <THead>
                <TR>
                  <TH>{copy.displayName}</TH>
                  <TH>{copy.iban}</TH>
                  <TH className="w-32">{copy.actions}</TH>
                </TR>
              </THead>
              <tbody>
                {bankAccounts.map((bankAccount) => (
                  <TR key={bankAccount.id}>
                    <TD>
                      <p>{bankAccount.displayName}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatPostalLine(bankAccount.postalCode, bankAccount.city)}
                      </p>
                    </TD>
                    <TD className="font-mono text-xs">{bankAccount.iban}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <IconButton
                          tone="accent"
                          label={copy.editBankAccount}
                          onClick={() => openEditBankAccount(bankAccount)}
                        >
                          <Pencil />
                        </IconButton>
                        <form action={deleteBankFormAction}>
                          <input type="hidden" name="bankAccountId" value={bankAccount.id} />
                          <IconButton
                            type="submit"
                            tone="delete"
                            label={copy.deleteBankAccount}
                            disabled={isDeletingBank}
                          >
                            <Trash2 />
                          </IconButton>
                        </form>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            <CardletList>
              {bankAccounts.map((bankAccount) => (
                <Cardlet key={bankAccount.id}>
                  <CardletHeader title={bankAccount.displayName} />
                  <CardletFields>
                    <CardletField label={copy.iban} className="col-span-2">
                      <span className="font-mono">{bankAccount.iban}</span>
                    </CardletField>
                    <CardletField label={copy.city} className="col-span-2">
                      {formatPostalLine(bankAccount.postalCode, bankAccount.city)}
                    </CardletField>
                  </CardletFields>
                  <CardletActions>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Pencil />}
                      onClick={() => openEditBankAccount(bankAccount)}
                    >
                      {copy.editBankAccount}
                    </Button>
                    <form action={deleteBankFormAction}>
                      <input type="hidden" name="bankAccountId" value={bankAccount.id} />
                      <Button
                        type="submit"
                        variant="destructive"
                        size="sm"
                        icon={<Trash2 />}
                        disabled={isDeletingBank}
                      >
                        {copy.deleteBankAccount}
                      </Button>
                    </form>
                  </CardletActions>
                </Cardlet>
              ))}
            </CardletList>
          </>
        )}
      </Panel>

      <Modal
        open={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        title={editingId ? copy.editBankAccount : copy.createBankAccount}
        size="lg"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsBankModalOpen(false)}>
              {shellCopy.cancel}
            </Button>
            <Button type="submit" form={BANK_FORM_ID} variant="primary" disabled={isSavingBank}>
              {shellCopy.save}
            </Button>
          </>
        }
      >
        <form id={BANK_FORM_ID} action={bankFormAction} onSubmit={markBankSubmitted} className="space-y-4">
          <FormError message={bankState.error} />
          <input type="hidden" name="addressId" value={address.id} />
          {editingId ? <input type="hidden" name="bankAccountId" value={editingId} /> : null}
          <BankAccountFields
            locale={locale}
            countries={countries}
            value={bankDraft}
            onChange={(patch) => setBankDraft((current) => ({ ...current, ...patch }))}
          />
        </form>
      </Modal>
    </div>
  );
}
