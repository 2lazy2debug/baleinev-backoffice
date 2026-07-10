export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export const allowedProofMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export type ProofMimeType = (typeof allowedProofMimeTypes)[number];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const heifBrands = new Set(["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/**
 * Identify the file from its leading bytes. The browser-supplied MIME type is
 * attacker-controlled and never trusted.
 */
export function sniffProofMimeType(bytes: Uint8Array): ProofMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  if (asciiAt(bytes, 4, 4) === "ftyp" && heifBrands.has(asciiAt(bytes, 8, 4))) {
    return "image/heic";
  }

  return null;
}

/**
 * Strip directory separators, control characters and quotes so the name is safe
 * to interpolate into a Content-Disposition header and to write to disk.
 */
export function sanitizeProofFilename(rawName: string, mimeType: ProofMimeType) {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1f\x7f"]/g, "").trim();
  const fallbackExtension = mimeType === "application/pdf" ? "pdf" : mimeType.replace("image/", "");

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return `proof.${fallbackExtension}`;
  }

  return cleaned.slice(0, 100);
}

export type ValidatedProof = {
  data: Uint8Array<ArrayBuffer>;
  mimeType: ProofMimeType;
  filename: string;
};

export async function validateProofUpload(proof: File): Promise<ValidatedProof> {
  if (proof.size === 0) {
    throw new Error("Proof file is required.");
  }

  if (proof.size > MAX_PROOF_BYTES) {
    throw new Error(`Proof file is too large. Maximum size is ${MAX_PROOF_BYTES / (1024 * 1024)} MB.`);
  }

  const data = new Uint8Array(await proof.arrayBuffer()) as Uint8Array<ArrayBuffer>;

  if (data.byteLength > MAX_PROOF_BYTES) {
    throw new Error(`Proof file is too large. Maximum size is ${MAX_PROOF_BYTES / (1024 * 1024)} MB.`);
  }

  const mimeType = sniffProofMimeType(data);

  if (!mimeType) {
    throw new Error("Proof must be a PDF or an image (JPEG, PNG, WebP, HEIC).");
  }

  return { data, mimeType, filename: sanitizeProofFilename(proof.name, mimeType) };
}
