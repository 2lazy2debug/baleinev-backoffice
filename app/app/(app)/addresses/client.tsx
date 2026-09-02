"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Check, Eye, Pencil, Trash2, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import {
  Badge,
  Button,
  Cardlet,
  CardletActions,
  CardletField,
  CardletFields,
  CardletHeader,
  CardletList,
  IconButton,
  Input,
  Panel,
  PanelHeader,
  Select,
  Suggest,
  type SuggestOption,
  TD,
  TH,
  THead,
  TR,
  Table,
  buttonClasses,
  iconButtonClasses,
} from "@/components/ui";
import { addressPersonName, formatPhone } from "@/lib/addresses";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { type ActionState, initialActionState } from "@/lib/server-action-helpers";

import { deleteAddressAction, updateAddressAction } from "./actions";

export type AddressRow = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  street: string;
  country: string;
  postalCode: string;
  city: string;
  phonePrefix: string;
  phoneNumber: string;
  email: string;
  note: string;
  addressTypeId: string;
  /** Denormalised for the list: the column filters and sorts on the name, not the id. */
  addressTypeName: string;
};

type Props = {
  locale: Locale;
  addresses: AddressRow[];
  /** Deleting is the one thing the address book keeps to admins. */
  canDelete: boolean;
  /** What a row can be filed under — the admin-managed list from address settings. */
  addressTypes: Array<{ id: string; name: string }>;
};

/** Every column the table filters and sorts by, in table order. */
const FILTER_COLUMNS = ["name", "company", "type", "postalCode", "city", "email", "phone", "note"] as const;
type FilterColumn = (typeof FILTER_COLUMNS)[number];

/** The row as one searchable string per column — filtering and sorting read this, not the record. */
function searchable(address: AddressRow): Record<FilterColumn, string> {
  return {
    name: addressPersonName(address),
    company: address.companyName,
    type: address.addressTypeName,
    postalCode: address.postalCode,
    city: address.city,
    email: address.email,
    phone: formatPhone(address.phonePrefix, address.phoneNumber),
    note: address.note,
  };
}

async function fetchCities(country: string, params: { postalCode?: string; name?: string }) {
  const query = new URLSearchParams({ country });
  if (params.postalCode) query.set("postalCode", params.postalCode);
  if (params.name) query.set("name", params.name);

  const response = await fetch(`/api/cities?${query.toString()}`);
  if (!response.ok) {
    return [] as Array<{ postalCode: string; name: string }>;
  }

  const data = (await response.json()) as { cities?: Array<{ postalCode: string; name: string }> };
  return data.cities ?? [];
}

export function AddressesClient({ locale, addresses, canDelete, addressTypes }: Props) {
  const copy = dictionaries[locale].addresses;
  const shellCopy = dictionaries[locale].shell;
  const router = useRouter();

  const [filters, setFilters] = useState<Record<FilterColumn, string>>({
    name: "",
    company: "",
    type: "",
    postalCode: "",
    city: "",
    email: "",
    phone: "",
    note: "",
  });
  const [sortBy, setSortBy] = useState<{ column: FilterColumn; direction: "asc" | "desc" } | null>(null);
  // The row being edited in place, as a full record: the table shows seven of
  // the eleven columns, and the four it does not show still have to be sent
  // back untouched.
  const [draft, setDraft] = useState<AddressRow | null>(null);

  async function saveDraft(previous: ActionState): Promise<ActionState> {
    if (!draft) {
      return { error: null };
    }

    const formData = new FormData();
    formData.set("addressId", draft.id);
    for (const [field, value] of Object.entries(draft)) {
      // `addressTypeName` is the list's own denormalisation — the write takes the id.
      if (field !== "id" && field !== "addressTypeName") {
        formData.set(field, String(value));
      }
    }

    const result = await updateAddressAction(previous, formData);
    if (result.error) {
      return result;
    }

    setDraft(null);
    router.refresh();
    return result;
  }

  const [saveState, saveFormAction, isSaving] = useActionState(saveDraft, initialActionState);
  const [deleteState, deleteFormAction, isDeleting] = useActionState(deleteAddressAction, initialActionState);

  function toggleSort(column: FilterColumn) {
    setSortBy((current) =>
      current?.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  }

  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });

  // Derived once: the table above `sm` and the cardlets below it render this
  // same array, so neither can drift into a second name or phone rendering.
  const rows = addresses
    .map((address) => ({ address, text: searchable(address) }))
    .filter(({ text }) =>
      FILTER_COLUMNS.every((column) => {
        const needle = filters[column].trim().toLowerCase();
        return !needle || text[column].toLowerCase().includes(needle);
      }),
    )
    .sort((a, b) => {
      if (!sortBy) {
        return 0;
      }
      const order = collator.compare(a.text[sortBy.column], b.text[sortBy.column]);
      return sortBy.direction === "asc" ? order : -order;
    });

  function updateDraft(patch: Partial<AddressRow>) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, ...patch };
      // The row carries the type twice — id for the write, name for the cell.
      // Keep them in step so the badge does not lie until the next refresh.
      if (patch.addressTypeId !== undefined) {
        next.addressTypeName = addressTypes.find((type) => type.id === patch.addressTypeId)?.name ?? "";
      }
      return next;
    });
  }

  async function loadPostalCodes(query: string): Promise<SuggestOption[]> {
    const cities = await fetchCities(draft?.country ?? "CH", { postalCode: query });
    return cities.map((city) => ({ value: city.postalCode, label: city.postalCode, hint: city.name }));
  }

  async function loadCityNames(query: string): Promise<SuggestOption[]> {
    const cities = await fetchCities(draft?.country ?? "CH", { name: query });
    return cities.map((city) => ({ value: city.name, label: city.name, hint: city.postalCode }));
  }

  return (
    <Panel flushOnMobile as="div" className="bg-[var(--panel)]">
      <PanelHeader flushOnMobile>
        <p className="text-xs text-[var(--muted)]">
          {copy.showing} {rows.length} {copy.of} {addresses.length}
        </p>
      </PanelHeader>

      {saveState.error || deleteState.error ? (
        <div className="border-b border-[var(--line)] px-4 py-2">
          <FormError message={saveState.error ?? deleteState.error} />
        </div>
      ) : null}

      <Table frame={false} desktopOnly className="table-fixed">
        {/* Fixed widths everywhere but the note, which takes what is left: the
            actions column has to hold three 32px buttons plus the cell's own
            padding, and a column that shrinks under them clips the last one.
            The email is the one that takes the slack — it is the column whose
            content varies most in length. */}
        <colgroup>
          <col className="w-44" />
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-20" />
          <col className="w-32" />
          <col />
          <col className="w-40" />
          <col className="w-40" />
          <col className="w-36" />
        </colgroup>
        <THead className="sticky top-0">
          <TR>
            <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => toggleSort("name")}>
              {copy.name}
            </TH>
            <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => toggleSort("company")}>
              {copy.company}
            </TH>
            <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => toggleSort("type")}>
              {copy.type}
            </TH>
            <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => toggleSort("postalCode")}>
              {copy.postalCode}
            </TH>
            <TH className="cursor-pointer hover:bg-[var(--line)]" onClick={() => toggleSort("city")}>
              {copy.city}
            </TH>
            <TH>{copy.email}</TH>
            <TH>{copy.phone}</TH>
            <TH>{copy.note}</TH>
            <TH>{copy.actions}</TH>
          </TR>
          <TR className="bg-[var(--panel)] normal-case">
            {FILTER_COLUMNS.map((column) => (
              <TH key={column}>
                <Input
                  type="text"
                  size="sm"
                  placeholder={copy.filter}
                  value={filters[column]}
                  onChange={(event) => setFilters({ ...filters, [column]: event.target.value })}
                />
              </TH>
            ))}
            <TH />
          </TR>
        </THead>
        <tbody>
          {rows.map(({ address, text }) => {
            const editing = draft?.id === address.id ? draft : null;

            return (
              <TR key={address.id} className={editing ? "bg-[var(--panel-strong)]" : undefined}>
                <TD>
                  {editing ? (
                    <div className="flex gap-1">
                      <Input
                        size="sm"
                        value={editing.firstName}
                        onChange={(event) => updateDraft({ firstName: event.target.value })}
                        placeholder={copy.firstName}
                      />
                      <Input
                        size="sm"
                        value={editing.lastName}
                        onChange={(event) => updateDraft({ lastName: event.target.value })}
                        placeholder={copy.lastName}
                      />
                    </div>
                  ) : (
                    <span className="block truncate">{text.name || "-"}</span>
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <Input
                      size="sm"
                      value={editing.companyName}
                      onChange={(event) => updateDraft({ companyName: event.target.value })}
                    />
                  ) : (
                    <span className="block truncate">{address.companyName || "-"}</span>
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <Select
                      size="sm"
                      value={editing.addressTypeId}
                      onChange={(event) => updateDraft({ addressTypeId: event.target.value })}
                    >
                      <option value="">{copy.noContactType}</option>
                      {addressTypes.map((addressType) => (
                        <option key={addressType.id} value={addressType.id}>
                          {addressType.name}
                        </option>
                      ))}
                    </Select>
                  ) : address.addressTypeName ? (
                    <Badge>{address.addressTypeName}</Badge>
                  ) : (
                    <span className="text-[var(--muted)]">-</span>
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <Suggest
                      size="sm"
                      value={editing.postalCode}
                      onValueChange={(postalCode) => updateDraft({ postalCode })}
                      loadOptions={loadPostalCodes}
                      onPick={(option) => updateDraft({ postalCode: option.value, city: option.hint ?? "" })}
                    />
                  ) : (
                    address.postalCode || "-"
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <Suggest
                      size="sm"
                      value={editing.city}
                      onValueChange={(city) => updateDraft({ city })}
                      loadOptions={loadCityNames}
                      onPick={(option) => updateDraft({ city: option.value, postalCode: option.hint ?? "" })}
                    />
                  ) : (
                    <span className="block truncate">{address.city || "-"}</span>
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <Input
                      type="email"
                      size="sm"
                      value={editing.email}
                      onChange={(event) => updateDraft({ email: event.target.value })}
                    />
                  ) : address.email ? (
                    <a
                      href={`mailto:${address.email}`}
                      title={address.email}
                      className="block truncate text-[var(--accent)] hover:underline"
                    >
                      {address.email}
                    </a>
                  ) : (
                    "-"
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <div className="flex gap-1">
                      <Input
                        size="sm"
                        className="w-14"
                        value={editing.phonePrefix}
                        onChange={(event) => updateDraft({ phonePrefix: event.target.value })}
                      />
                      <Input
                        size="sm"
                        value={editing.phoneNumber}
                        onChange={(event) => updateDraft({ phoneNumber: event.target.value })}
                      />
                    </div>
                  ) : (
                    <span className="block truncate">{text.phone || "-"}</span>
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <Input
                      size="sm"
                      value={editing.note}
                      onChange={(event) => updateDraft({ note: event.target.value })}
                    />
                  ) : (
                    <span className="block truncate" title={address.note || undefined}>
                      {address.note || "-"}
                    </span>
                  )}
                </TD>
                <TD>
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <IconButton onClick={() => saveFormAction()} disabled={isSaving} tone="save" label={shellCopy.save}>
                        <Check />
                      </IconButton>
                      <IconButton onClick={() => setDraft(null)} tone="neutral" label={shellCopy.cancel}>
                        <X />
                      </IconButton>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/addresses/${address.id}`}
                        title={copy.view}
                        aria-label={copy.view}
                        className={iconButtonClasses("neutral")}
                      >
                        <Eye />
                      </Link>
                      <IconButton onClick={() => setDraft(address)} tone="accent" label={copy.edit}>
                        <Pencil />
                      </IconButton>
                      {canDelete ? (
                        <form action={deleteFormAction}>
                          <input type="hidden" name="addressId" value={address.id} />
                          <IconButton
                            type="submit"
                            tone="delete"
                            label={copy.deleteAddress}
                            disabled={isDeleting}
                          >
                            <Trash2 />
                          </IconButton>
                        </form>
                      ) : null}
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>

      {/* Below `sm` the eight columns are unreadable, so the same rows render as
          cards. Filtering, sorting and the inline editor stay in the table header;
          a phone opens the address instead — where the fields have room. */}
      <CardletList>
        {rows.map(({ address, text }) => (
          <Cardlet key={address.id}>
            <CardletHeader
              title={
                <>
                  <p className="truncate">{text.name || address.companyName}</p>
                  {text.name && address.companyName ? (
                    <p className="truncate text-3xs font-normal text-[var(--muted)]">{address.companyName}</p>
                  ) : null}
                </>
              }
              action={address.addressTypeName ? <Badge>{address.addressTypeName}</Badge> : null}
            />
            <CardletFields>
              <CardletField label={copy.city}>{[address.postalCode, address.city].filter(Boolean).join(" ") || "-"}</CardletField>
              <CardletField label={copy.phone}>{text.phone || "-"}</CardletField>
              <CardletField label={copy.email} className="col-span-2">
                {address.email || "-"}
              </CardletField>
              {address.note ? (
                <CardletField label={copy.note} className="col-span-2">
                  {address.note}
                </CardletField>
              ) : null}
            </CardletFields>
            <CardletActions>
              <Link href={`/addresses/${address.id}`} className={buttonClasses("secondary", "sm")}>
                <Eye />
                {copy.view}
              </Link>
              {canDelete ? (
                <form action={deleteFormAction}>
                  <input type="hidden" name="addressId" value={address.id} />
                  <Button type="submit" variant="destructive" size="sm" icon={<Trash2 />} disabled={isDeleting}>
                    {copy.deleteAddress}
                  </Button>
                </form>
              ) : null}
            </CardletActions>
          </Cardlet>
        ))}
      </CardletList>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--muted)]">
          {addresses.length === 0 ? copy.empty : copy.noMatch}
        </p>
      ) : null}
    </Panel>
  );
}
