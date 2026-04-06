type PartyInput = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country?: string;
};

type BuildSwissQrPayloadInput = {
  iban: string;
  creditor: PartyInput;
  debtor: PartyInput;
  amount: number;
  reference?: string;
  message?: string;
  currency?: "CHF" | "EUR";
};

function cleanValue(value: string | null | undefined) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function normalizeIban(iban: string) {
  return cleanValue(iban).replace(/\s+/g, "").toUpperCase();
}

function normalizeCountry(country: string | null | undefined) {
  const cleaned = cleanValue(country || "CH").toUpperCase();
  return cleaned || "CH";
}

function splitReference(reference: string | undefined, message: string | undefined) {
  const cleanedReference = cleanValue(reference);
  const cleanedMessage = cleanValue(message);

  if (!cleanedReference) {
    return { type: "NON", reference: "", message: cleanedMessage };
  }

  const numericOnly = cleanedReference.replace(/\s+/g, "");
  if (/^[0-9]{27}$/.test(numericOnly)) {
    return {
      type: "QRR",
      reference: numericOnly,
      message: cleanedMessage,
    };
  }

  if (/^RF[0-9A-Z]{2,23}$/i.test(numericOnly)) {
    return {
      type: "SCOR",
      reference: numericOnly.toUpperCase(),
      message: cleanedMessage,
    };
  }

  return {
    type: "NON",
    reference: "",
    message: cleanedMessage,
  };
}

function amountToString(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  return amount.toFixed(2);
}

export function buildSwissQrPayload(input: BuildSwissQrPayloadInput) {
  const referenceParts = splitReference(input.reference, input.message);
  const amount = amountToString(input.amount);

  const lines = [
    "SPC",
    "0200",
    "1",
    normalizeIban(input.iban),

    // Creditor
    "S",
    cleanValue(input.creditor.name),
    cleanValue(input.creditor.address),
    "",
    cleanValue(input.creditor.postalCode),
    cleanValue(input.creditor.city),
    normalizeCountry(input.creditor.country),

    // Ultimate creditor (unused)
    "",
    "",
    "",
    "",
    "",
    "",
    "",

    amount,
    input.currency ?? "CHF",

    // Debtor
    "S",
    cleanValue(input.debtor.name),
    cleanValue(input.debtor.address),
    "",
    cleanValue(input.debtor.postalCode),
    cleanValue(input.debtor.city),
    normalizeCountry(input.debtor.country),

    // Reference
    referenceParts.type,
    referenceParts.reference,
    referenceParts.message,

    // Trailer + optional fields
    "EPD",
    "",
    "",
  ];

  return lines.join("\n");
}
