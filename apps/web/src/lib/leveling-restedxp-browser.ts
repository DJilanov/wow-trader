import {
  encodeRestedXpImport,
  decodeRestedXpImport,
  RESTEDXP_IMPORT_LIMITS,
  type RestedXpCompression,
  type RestedXpDocumentSet,
  type CampaignAction,
} from "@wow-trader/leveling";
import { restedXpExportMessages } from "./leveling-restedxp-contract";

async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("The exported guide exceeds its size limit.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

const compression: RestedXpCompression = {
  compressZlib: async (bytes: Uint8Array): Promise<Uint8Array> =>
    boundedBytes(
      new Blob([new Uint8Array(bytes).buffer])
        .stream()
        .pipeThrough(new CompressionStream("deflate")),
      RESTEDXP_IMPORT_LIMITS.plaintextBytes + 100_000,
    ),
  decompressZlib: async (bytes: Uint8Array, maximum: number): Promise<Uint8Array> =>
    boundedBytes(
      new Blob([new Uint8Array(bytes).buffer])
        .stream()
        .pipeThrough(new DecompressionStream("deflate")),
      maximum,
    ),
};

export async function campaignActionSha256(actions: readonly CampaignAction[]): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error("Open the guide over HTTPS or localhost to export safely.");
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(actions)),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function browserRestedXpImport(
  set: RestedXpDocumentSet,
  role: "leader" | "party",
  account: string,
): Promise<string> {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined")
    throw new Error("This browser cannot create paste imports. Use Download addon ZIP instead.");
  const guides = set.documents
    .filter((document) => document.role === role)
    .map((document) => document.content);
  const encoded = await encodeRestedXpImport(guides, account, compression);
  const decoded = await decodeRestedXpImport(encoded, account, compression);
  if (
    decoded.guides.length !== guides.length ||
    decoded.guides.some((guide, index) => guide !== guides[index])
  )
    throw new Error("The import could not be verified. No file was saved.");
  return encoded;
}

export async function readRestedXpExportResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body: unknown = await response.json().catch((): null => null);
    const code =
      body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "";
    throw new Error(
      restedXpExportMessages[code] ?? "Export failed. Your saved guide has not changed. Try again.",
    );
  }
  if (!response.body) throw new Error("The export response was empty. Try again.");
  const bytes = await boundedBytes(response.body, 12_000_000);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
