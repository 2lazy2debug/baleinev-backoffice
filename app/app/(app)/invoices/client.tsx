"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";

import { useEditionReadOnly } from "@/components/edition-read-only";
import { Button, Card, Field, IconButton, Input, Modal, Select, TD, TFoot, TH, THead, TR, Table, Textarea } from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { buildSwissQrPayload } from "@/lib/swiss-qr";
import { formatCurrency } from "@/lib/utils";

type InvoiceAccount = {
  id: string;
  name: string;
  iban: string | null;
  beneficiaryName: string | null;
  beneficiaryAddress: string | null;
  beneficiaryPostalCode: string | null;
  beneficiaryCity: string | null;
  beneficiaryCountry: string;
};

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type Props = {
  locale: Locale;
  editionId: string;
  accounts: InvoiceAccount[];
  history: HistoryInvoice[];
  earningEntries: EarningJournalEntry[];
  defaultTemplate: {
    id: string;
    name: string;
  };
};

type EarningJournalEntry = {
  id: string;
  sequenceNumber: number;
  label: string;
  date: string;
  amount: number;
  linkedInvoiceId: string | null;
};

type HistoryInvoice = {
  id: string;
  moneyAccountId: string;
  bankAccountName: string;
  iban: string;
  creditorName: string;
  creditorAddress: string;
  creditorPostalCode: string;
  creditorCity: string;
  creditorCountry: string;
  invoiceNumber: string;
  header: string;
  invoiceDate: string;
  dueDate: string;
  supplierName: string;
  supplierAddress: string;
  supplierPostalCode: string;
  supplierCity: string;
  supplierCountry: string;
  reference: string;
  message: string;
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  qrPayload: string;
  createdAt: string;
  paidAt: string | null;
  linkedJournalEntryId: string | null;
  linkedJournalEntryLabel: string | null;
};

type GeneratedInvoice = {
  bankAccountName: string;
  iban: string;
  creditorName: string;
  creditorAddress: string;
  creditorPostalCode: string;
  creditorCity: string;
  creditorCountry: string;
  invoiceNumber: string;
  header: string;
  invoiceDate: string;
  dueDate: string;
  supplierName: string;
  supplierAddress: string;
  supplierPostalCode: string;
  supplierCity: string;
  lineItems: LineItem[];
  reference: string;
  message: string;
  totalAmount: number;
  payload: string;
};

export default function InvoicesClient({ locale, editionId, accounts, history, earningEntries, defaultTemplate }: Props) {
  const copy = dictionaries[locale];
  const isReadOnly = useEditionReadOnly();
  const firstAccountId = accounts[0]?.id ?? "";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(firstAccountId);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [header, setHeader] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierPostalCode, setSupplierPostalCode] = useState("");
  const [supplierCity, setSupplierCity] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [downloadingHistoryId, setDownloadingHistoryId] = useState<string | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryInvoice[]>(history);
  const [earningJournalEntries, setEarningJournalEntries] = useState<EarningJournalEntry[]>(earningEntries);
  const [statusActionInvoiceId, setStatusActionInvoiceId] = useState<string | null>(null);
  const [deleteActionInvoiceId, setDeleteActionInvoiceId] = useState<string | null>(null);
  const [paidModalInvoice, setPaidModalInvoice] = useState<HistoryInvoice | null>(null);
  const [selectedJournalEntryId, setSelectedJournalEntryId] = useState("");
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );
  const editingInvoice = useMemo(
    () => (editingInvoiceId ? invoiceHistory.find((invoice) => invoice.id === editingInvoiceId) ?? null : null),
    [editingInvoiceId, invoiceHistory],
  );
  const isEditingPaidInvoice = Boolean(editingInvoice?.paidAt);

  const lineItemsTotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [lineItems],
  );

  function resetForm() {
    setSelectedAccountId(firstAccountId);
    setInvoiceNumber("");
    setHeader("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setDueDate("");
    setSupplierName("");
    setSupplierAddress("");
    setSupplierPostalCode("");
    setSupplierCity("");
    setLineItems([]);
    setReference("");
    setMessage("");
    setEditingInvoiceId(null);
    setError(null);
  }

  function openCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function closeFormModal() {
    setIsModalOpen(false);
    setError(null);
  }

  function addLineItem() {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        description: "",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  }

  function updateLineItem(id: string, field: keyof LineItem, value: string | number) {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  }

  function removeLineItem(id: string) {
    setLineItems(lineItems.filter((item) => item.id !== id));
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!selectedAccount) {
      setError(copy.invoices.noIban);
      return;
    }

    if (isEditingPaidInvoice) {
      setError(copy.invoices.paidInvoiceLocked);
      return;
    }

    if (!selectedAccount.iban || !selectedAccount.beneficiaryName || !selectedAccount.beneficiaryAddress || !selectedAccount.beneficiaryPostalCode || !selectedAccount.beneficiaryCity) {
      setError(`${selectedAccount.name}: please complete IBAN + beneficiary fields in Money accounts first.`);
      return;
    }

    if (!invoiceNumber.trim()) {
      setError(copy.invoices.invoiceNumberRequired);
      return;
    }

    const numericAmount = lineItemsTotal;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(copy.invoices.invalidAmount);
      return;
    }

    try {
      setSavingInvoice(true);

      const qrMessage = [invoiceNumber.trim(), reference.trim()].filter(Boolean).join(" - ");

      const payload = buildSwissQrPayload({
        iban: selectedAccount.iban,
        creditor: {
          name: selectedAccount.beneficiaryName,
          address: selectedAccount.beneficiaryAddress,
          postalCode: selectedAccount.beneficiaryPostalCode,
          city: selectedAccount.beneficiaryCity,
          country: selectedAccount.beneficiaryCountry,
        },
        debtor: {
          name: supplierName,
          address: supplierAddress,
          postalCode: supplierPostalCode,
          city: supplierCity,
          country: "CH",
        },
        amount: numericAmount,
        reference,
        message: qrMessage,
        currency: "CHF",
      });

      const nextGeneratedInvoice: GeneratedInvoice = {
        bankAccountName: selectedAccount.name,
        iban: selectedAccount.iban,
        creditorName: selectedAccount.beneficiaryName,
        creditorAddress: selectedAccount.beneficiaryAddress,
        creditorPostalCode: selectedAccount.beneficiaryPostalCode,
        creditorCity: selectedAccount.beneficiaryCity,
        creditorCountry: selectedAccount.beneficiaryCountry,
        invoiceNumber,
        header,
        invoiceDate,
        dueDate,
        supplierName,
        supplierAddress,
        supplierPostalCode,
        supplierCity,
        lineItems,
        reference,
        message,
        totalAmount: numericAmount,
        payload,
      };

      const requestBody = {
        editionId,
        moneyAccountId: selectedAccount.id,
        templateId: defaultTemplate.id,
        invoiceNumber: nextGeneratedInvoice.invoiceNumber,
        header: nextGeneratedInvoice.header,
        invoiceDate: nextGeneratedInvoice.invoiceDate,
        dueDate: nextGeneratedInvoice.dueDate,
        supplierName: nextGeneratedInvoice.supplierName,
        supplierAddress: nextGeneratedInvoice.supplierAddress,
        supplierPostalCode: nextGeneratedInvoice.supplierPostalCode,
        supplierCity: nextGeneratedInvoice.supplierCity,
        supplierCountry: "CH",
        creditorName: nextGeneratedInvoice.creditorName,
        creditorAddress: nextGeneratedInvoice.creditorAddress,
        creditorPostalCode: nextGeneratedInvoice.creditorPostalCode,
        creditorCity: nextGeneratedInvoice.creditorCity,
        creditorCountry: nextGeneratedInvoice.creditorCountry,
        bankAccountName: nextGeneratedInvoice.bankAccountName,
        iban: nextGeneratedInvoice.iban,
        paymentReference: nextGeneratedInvoice.reference,
        message: nextGeneratedInvoice.message,
        totalAmount: nextGeneratedInvoice.totalAmount,
        lineItems: nextGeneratedInvoice.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        qrPayload: nextGeneratedInvoice.payload,
      };

      const saveResponse = await fetch("/api/invoices", {
        method: editingInvoiceId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editingInvoiceId ? { ...requestBody, invoiceId: editingInvoiceId } : requestBody),
      });

      if (!saveResponse.ok) {
        const data = await saveResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || copy.invoices.couldNotSave);
      }

      const saveData = await saveResponse.json() as { id: string };

      const updatedRecord: HistoryInvoice = {
        id: saveData.id,
        moneyAccountId: selectedAccount.id,
        bankAccountName: nextGeneratedInvoice.bankAccountName,
        iban: nextGeneratedInvoice.iban,
        creditorName: nextGeneratedInvoice.creditorName,
        creditorAddress: nextGeneratedInvoice.creditorAddress,
        creditorPostalCode: nextGeneratedInvoice.creditorPostalCode,
        creditorCity: nextGeneratedInvoice.creditorCity,
        creditorCountry: nextGeneratedInvoice.creditorCountry,
        invoiceNumber: nextGeneratedInvoice.invoiceNumber,
        header: nextGeneratedInvoice.header,
        invoiceDate: nextGeneratedInvoice.invoiceDate,
        dueDate: nextGeneratedInvoice.dueDate,
        supplierName: nextGeneratedInvoice.supplierName,
        supplierAddress: nextGeneratedInvoice.supplierAddress,
        supplierPostalCode: nextGeneratedInvoice.supplierPostalCode,
        supplierCity: nextGeneratedInvoice.supplierCity,
        supplierCountry: "CH",
        reference: nextGeneratedInvoice.reference,
        message: nextGeneratedInvoice.message,
        totalAmount: nextGeneratedInvoice.totalAmount,
        lineItems: nextGeneratedInvoice.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        qrPayload: nextGeneratedInvoice.payload,
        createdAt: new Date().toISOString(),
        paidAt: null,
        linkedJournalEntryId: null,
        linkedJournalEntryLabel: null,
      };

      if (editingInvoiceId) {
        const existing = invoiceHistory.find((invoice) => invoice.id === editingInvoiceId);
        setInvoiceHistory((previous) =>
          previous.map((invoice) =>
            invoice.id === editingInvoiceId
              ? {
                ...updatedRecord,
                createdAt: existing?.createdAt ?? invoice.createdAt,
                paidAt: invoice.paidAt,
                linkedJournalEntryId: invoice.linkedJournalEntryId,
                linkedJournalEntryLabel: invoice.linkedJournalEntryLabel,
              }
              : invoice,
          ),
        );
      } else {
        setInvoiceHistory([updatedRecord, ...invoiceHistory]);
      }

      setEditingInvoiceId(saveData.id);
      closeFormModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate invoice.");
    } finally {
      setSavingInvoice(false);
    }
  }

  async function handleDownloadHistoryPdf(item: HistoryInvoice) {
    setDownloadingHistoryId(item.id);
    setError(null);

    try {
      const response = await fetch(`/api/invoices/${item.id}/pdf`);

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "Could not generate PDF.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${item.invoiceNumber || "invoice"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setDownloadingHistoryId(null);
    }
  }

  const paidModalOptions = useMemo(() => {
    if (!paidModalInvoice) {
      return [];
    }

    return earningJournalEntries.filter(
      (entry) => entry.linkedInvoiceId === null || entry.linkedInvoiceId === paidModalInvoice.id,
    );
  }, [paidModalInvoice, earningJournalEntries]);

  async function handleSetInvoicePaid() {
    if (!paidModalInvoice) {
      return;
    }

    if (!selectedJournalEntryId) {
      setError(copy.invoices.journalEntryRequired);
      return;
    }

    setError(null);
    setStatusActionInvoiceId(paidModalInvoice.id);

    try {
      const response = await fetch("/api/invoices", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: paidModalInvoice.id,
          status: "PAID",
          journalEntryId: selectedJournalEntryId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || copy.invoices.couldNotSetPaid);
      }

      const selectedEntry = earningJournalEntries.find((entry) => entry.id === selectedJournalEntryId) ?? null;
      const nowIso = new Date().toISOString();

      setInvoiceHistory((previous) =>
        previous.map((invoice) =>
          invoice.id === paidModalInvoice.id
            ? {
              ...invoice,
              paidAt: nowIso,
              linkedJournalEntryId: selectedJournalEntryId,
              linkedJournalEntryLabel: selectedEntry
                ? `#${selectedEntry.sequenceNumber} - ${selectedEntry.label}`
                : invoice.linkedJournalEntryLabel,
            }
            : invoice,
        ),
      );

      setEarningJournalEntries((previous) =>
        previous.map((entry) =>
          entry.id === selectedJournalEntryId
            ? { ...entry, linkedInvoiceId: paidModalInvoice.id }
            : entry,
        ),
      );

      setPaidModalInvoice(null);
      setSelectedJournalEntryId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.invoices.couldNotSetPaid);
    } finally {
      setStatusActionInvoiceId(null);
    }
  }

  async function handleSetInvoiceUnpaid(item: HistoryInvoice) {
    setError(null);
    setStatusActionInvoiceId(item.id);

    try {
      const response = await fetch("/api/invoices", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: item.id,
          status: "UNPAID",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || copy.invoices.couldNotSetUnpaid);
      }

      setInvoiceHistory((previous) =>
        previous.map((invoice) =>
          invoice.id === item.id
            ? {
              ...invoice,
              paidAt: null,
              linkedJournalEntryId: null,
              linkedJournalEntryLabel: null,
            }
            : invoice,
        ),
      );

      setEarningJournalEntries((previous) =>
        previous.map((entry) =>
          entry.linkedInvoiceId === item.id
            ? { ...entry, linkedInvoiceId: null }
            : entry,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.invoices.couldNotSetUnpaid);
    } finally {
      setStatusActionInvoiceId(null);
    }
  }

  async function handleDeleteInvoice(item: HistoryInvoice) {
    setError(null);
    setDeleteActionInvoiceId(item.id);

    try {
      const response = await fetch(`/api/invoices?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || copy.invoices.couldNotDelete);
      }

      setInvoiceHistory((previous) => previous.filter((invoice) => invoice.id !== item.id));
      if (editingInvoiceId === item.id) {
        setEditingInvoiceId(null);
        setIsModalOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.invoices.couldNotDelete);
    } finally {
      setDeleteActionInvoiceId(null);
    }
  }

  function refillFromHistory(item: HistoryInvoice) {
    setEditingInvoiceId(item.id);
    setSelectedAccountId(item.moneyAccountId);
    setInvoiceNumber(item.invoiceNumber);
    setHeader(item.header);
    setInvoiceDate(item.invoiceDate);
    setDueDate(item.dueDate);
    setSupplierName(item.supplierName);
    setSupplierAddress(item.supplierAddress);
    setSupplierPostalCode(item.supplierPostalCode);
    setSupplierCity(item.supplierCity);
    setReference(item.reference);
    setMessage(item.message);
    setLineItems(
      item.lineItems.map((lineItem, index) => ({
        id: `${Date.now()}-${index}`,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
      })),
    );
    setIsModalOpen(true);
    setError(null);
  }

  function duplicateFromHistory(item: HistoryInvoice) {
    setEditingInvoiceId(null);
    setSelectedAccountId(item.moneyAccountId);
    setInvoiceNumber(item.invoiceNumber);
    setHeader(item.header);
    setInvoiceDate(item.invoiceDate);
    setDueDate(item.dueDate);
    setSupplierName(item.supplierName);
    setSupplierAddress(item.supplierAddress);
    setSupplierPostalCode(item.supplierPostalCode);
    setSupplierCity(item.supplierCity);
    setReference(item.reference);
    setMessage(item.message);
    setLineItems(
      item.lineItems.map((lineItem, index) => ({
        id: `${Date.now()}-${index}`,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
      })),
    );
    setIsModalOpen(true);
    setError(null);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">{copy.invoices.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.invoices.title}</h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{copy.invoices.subtitle}</p>
        <p className="text-xs text-[var(--muted)]">{copy.invoices.activeTemplate}: {defaultTemplate.name}</p>
      </header>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {isReadOnly ? null : (
        <Button variant="primary" onClick={openCreateModal} className="self-start">
          <Plus className="h-4 w-4" />
          {copy.invoices.create}
        </Button>
      )}

      <Card as="section">
        <h2 className="text-xl font-semibold">{copy.invoices.historyTitle}</h2>

        {invoiceHistory.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">{copy.invoices.noHistory}</p>
        ) : (
          <Table frameClassName="mt-3">
              <THead>
                <TR>
                  <TH>{copy.invoices.invoiceNumber}</TH>
                  <TH>{copy.invoices.invoiceDate}</TH>
                  <TH>{copy.invoices.supplierName}</TH>
                  <TH className="text-right">{copy.invoices.total}</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <tbody>
                {invoiceHistory.map((item) => {
                  const receiverFirstLine = item.supplierName.split(/\r?\n/)[0]?.trim() || item.supplierName;

                  return (
                    <TR key={item.id} className="bg-[var(--panel-strong)]">
                      <TD>
                        {isReadOnly ? (
                          <span className="font-semibold">{item.invoiceNumber}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => refillFromHistory(item)}
                            className="font-semibold hover:text-[var(--accent)]"
                          >
                            {item.invoiceNumber}
                          </button>
                        )}
                      </TD>
                      <TD>{item.invoiceDate}</TD>
                      <TD>{receiverFirstLine}</TD>
                      <TD className="text-right font-semibold">{formatCurrency(item.totalAmount)}</TD>
                      <TD>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadHistoryPdf(item)}
                            disabled={downloadingHistoryId === item.id}
                          >
                            {downloadingHistoryId === item.id ? "..." : copy.invoices.generatePdf}
                          </Button>
                          {isReadOnly ? null : item.paidAt ? (
                            <IconButton
                              tone="warning"
                              label={copy.invoices.setUnpaid}
                              onClick={() => handleSetInvoiceUnpaid(item)}
                              disabled={statusActionInvoiceId === item.id}
                            >
                              <RotateCcw />
                            </IconButton>
                          ) : (
                            <IconButton
                              tone="save"
                              label={copy.invoices.setPaid}
                              onClick={() => {
                                setPaidModalInvoice(item);
                                setSelectedJournalEntryId("");
                                setError(null);
                              }}
                              disabled={statusActionInvoiceId === item.id}
                            >
                              <Check />
                            </IconButton>
                          )}
                          {isReadOnly ? null : (
                            <>
                              <IconButton
                                tone="neutral"
                                label="Duplicate invoice"
                                onClick={() => duplicateFromHistory(item)}
                              >
                                <Copy />
                              </IconButton>
                              <IconButton
                                tone="delete"
                                label={copy.invoices.deleteInvoice}
                                onClick={() => handleDeleteInvoice(item)}
                                disabled={Boolean(item.paidAt) || deleteActionInvoiceId === item.id}
                                title={item.paidAt ? copy.invoices.deleteBlockedPaid : copy.invoices.deleteInvoice}
                              >
                                <Trash2 />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={isModalOpen}
        onClose={closeFormModal}
        title={editingInvoiceId ? copy.invoices.saveModifications : copy.invoices.create}
        size="xl"
        footer={
          accounts.length === 0 ? undefined : (
            <>
              <Button variant="secondary" onClick={closeFormModal}>
                {copy.shell.cancel}
              </Button>
              <Button
                type="submit"
                form="invoice-form"
                variant="primary"
                disabled={savingInvoice || isEditingPaidInvoice}
              >
                {savingInvoice
                  ? "..."
                  : editingInvoiceId
                    ? copy.invoices.saveModifications
                    : copy.invoices.saveInvoice}
              </Button>
            </>
          )
        }
      >
        {accounts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{copy.invoices.noIban}</p>
        ) : (
          <form id="invoice-form" onSubmit={handleGenerate} className="space-y-4">
            <Field label={copy.invoices.bankAccount}>
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                disabled={isEditingPaidInvoice}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.iban ?? "no IBAN"})
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.invoices.invoiceNumber}>
                <Input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  disabled={Boolean(editingInvoiceId)}
                />
              </Field>
              <Field label={copy.invoices.invoiceDate}>
                <Input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  disabled={isEditingPaidInvoice}
                />
              </Field>
              <Field label={copy.invoices.dueDate}>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isEditingPaidInvoice}
                />
              </Field>
            </div>

            <Field label={copy.invoices.header}>
              <Input
                type="text"
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                disabled={isEditingPaidInvoice}
                placeholder={copy.invoices.headerPlaceholder}
              />
            </Field>

            <Field label={copy.invoices.supplierName}>
              <Textarea
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                disabled={isEditingPaidInvoice}
                rows={2}
                placeholder={"Agence X Y Z\nChristian Duprax"}
              />
            </Field>

            <Field label={copy.invoices.supplierAddress}>
              <Input
                type="text"
                required
                value={supplierAddress}
                onChange={(e) => setSupplierAddress(e.target.value)}
                disabled={isEditingPaidInvoice}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Field label={copy.invoices.supplierPostalCode}>
                <Input
                  type="text"
                  required
                  value={supplierPostalCode}
                  onChange={(e) => setSupplierPostalCode(e.target.value)}
                  disabled={isEditingPaidInvoice}
                />
              </Field>
              <Field label={copy.invoices.supplierCity}>
                <Input
                  type="text"
                  required
                  value={supplierCity}
                  onChange={(e) => setSupplierCity(e.target.value)}
                  disabled={isEditingPaidInvoice}
                />
              </Field>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{copy.invoices.lineItems}</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addLineItem}
                  disabled={isEditingPaidInvoice}
                >
                  <Plus className="h-4 w-4" />
                  {copy.invoices.addLineItem}
                </Button>
              </div>

              {lineItems.length > 0 ? (
                <Table dense frameClassName="mt-3">
                    <THead>
                      <TR>
                        <TH className="px-3 py-2">{copy.invoices.description}</TH>
                        <TH className="px-3 py-2 text-right">{copy.invoices.quantity}</TH>
                        <TH className="px-3 py-2 text-right">{copy.invoices.unitPrice}</TH>
                        <TH className="px-3 py-2" />
                      </TR>
                    </THead>
                    <tbody>
                      {lineItems.map((item) => (
                        <TR key={item.id}>
                          <TD className="px-3 py-2">
                            <Input
                              bare
                              type="text"
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(item.id, "description", e.target.value)
                              }
                              disabled={isEditingPaidInvoice}
                              placeholder={copy.invoices.description}
                            />
                          </TD>
                          <TD className="px-3 py-2 text-right">
                            <Input
                              bare
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(item.id, "quantity", Number(e.target.value))
                              }
                              disabled={isEditingPaidInvoice}
                              className="text-right"
                            />
                          </TD>
                          <TD className="px-3 py-2 text-right">
                            <Input
                              bare
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateLineItem(item.id, "unitPrice", Number(e.target.value))
                              }
                              disabled={isEditingPaidInvoice}
                              className="text-right"
                            />
                          </TD>
                          <TD className="px-3 py-2 text-right">
                            <IconButton
                              tone="delete"
                              label="Remove line item"
                              onClick={() => removeLineItem(item.id)}
                              disabled={isEditingPaidInvoice}
                            >
                              <Trash2 />
                            </IconButton>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                    <TFoot>
                      <TR>
                        <TD className="px-3 py-2">{copy.invoices.total}</TD>
                        <TD />
                        <TD className="px-3 py-2 text-right">{formatCurrency(lineItemsTotal)}</TD>
                        <TD />
                      </TR>
                    </TFoot>
                </Table>
              ) : (
                <p className="mt-2 text-xs text-[var(--muted)]">{copy.invoices.noLineItems}</p>
              )}
            </div>

            <Field label={copy.invoices.reference}>
              <Input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={isEditingPaidInvoice}
              />
            </Field>

            <Field label={copy.invoices.message}>
              <Input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isEditingPaidInvoice}
              />
            </Field>

            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(paidModalInvoice)}
        onClose={() => {
          setPaidModalInvoice(null);
          setSelectedJournalEntryId("");
        }}
        title={copy.invoices.setPaid}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPaidModalInvoice(null);
                setSelectedJournalEntryId("");
              }}
            >
              {copy.shell.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={handleSetInvoicePaid}
              disabled={!paidModalInvoice || statusActionInvoiceId === paidModalInvoice.id}
            >
              {paidModalInvoice && statusActionInvoiceId === paidModalInvoice.id ? "..." : copy.invoices.confirmSetPaid}
            </Button>
          </>
        }
      >
        {paidModalInvoice ? (
          <>
            <p className="text-sm text-[var(--muted)]">
              {copy.invoices.pickJournalEntry} {paidModalInvoice.invoiceNumber}
            </p>

            <Field label={copy.invoices.earningEntry} className="mt-4">
              <Select
                value={selectedJournalEntryId}
                onChange={(e) => setSelectedJournalEntryId(e.target.value)}
              >
                <option value="">{copy.invoices.selectEntryPlaceholder}</option>
                {paidModalOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    #{entry.sequenceNumber} • {entry.date} • {formatCurrency(entry.amount)} • {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
