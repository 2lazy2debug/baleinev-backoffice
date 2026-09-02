"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";

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
import { addressDisplayName, formatPostalLine } from "@/lib/addresses";
import type { CountryOption } from "@/lib/countries";
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

  const [draft, setDraft] = useState<AddressDraft>(address);
  const [saveState, saveFormAction, isSaving] = useActionState(updateAddressAction, initialActionState);

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
          <SectionTitle>{copy.details}</SectionTitle>
          <form id={ADDRESS_FORM_ID} action={saveFormAction} className="mt-4 space-y-4">
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
          <p className="px-5 py-6 text-sm text-[var(--muted)]">{copy.noBankAccounts}</p>
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
