import type {
  RestedXpDecodedImport,
  RestedXpCompression,
} from "../../packages/leveling/src/restedxp-import.js";

interface ImportCodec {
  encodeRestedXpImport(
    guides: readonly string[],
    account: string,
    compression: RestedXpCompression,
  ): Promise<string>;
  decodeRestedXpImport(
    encoded: string,
    account: string,
    compression: RestedXpCompression,
  ): Promise<RestedXpDecodedImport>;
}

interface DownloadData {
  readonly schema: "kfc-local-guide-download.v1";
  readonly fileRange: string;
  readonly forever: readonly string[];
  readonly tbc: readonly string[];
}

function parseData(value: unknown): DownloadData {
  if (
    value === null ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== "kfc-local-guide-download.v1" ||
    !("forever" in value) ||
    !("tbc" in value) ||
    !("fileRange" in value) ||
    typeof value.fileRange !== "string" ||
    !/^\d{1,2}-\d{1,2}$/.test(value.fileRange)
  )
    throw new Error("The guide file is incomplete. Generate a fresh download page.");
  const guides = (rows: unknown): rows is string[] =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.length <= 500 &&
    rows.every((row: unknown) => typeof row === "string");
  if (!guides(value.forever) || !guides(value.tbc))
    throw new Error("The guide file is incomplete. Generate a fresh download page.");
  return { schema: value.schema, fileRange: value.fileRange, forever: value.forever, tbc: value.tbc };
}

async function streamBytes(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
): Promise<Uint8Array> {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new Error("The guide is too large to export.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const compression: RestedXpCompression = {
  compressZlib: async (bytes: Uint8Array): Promise<Uint8Array> =>
    streamBytes(
      new Blob([new Uint8Array(bytes).buffer])
        .stream()
        .pipeThrough(new CompressionStream("deflate")),
      8_100_000,
    ),
  decompressZlib: async (bytes: Uint8Array, maximum: number): Promise<Uint8Array> =>
    streamBytes(
      new Blob([new Uint8Array(bytes).buffer])
        .stream()
        .pipeThrough(new DecompressionStream("deflate")),
      maximum,
    ),
};

function start(codec: ImportCodec): void {
  const form = document.querySelector<HTMLFormElement>("#download-form")!;
  const account = document.querySelector<HTMLInputElement>("#battle-tag")!;
  const game = document.querySelector<HTMLSelectElement>("#game")!;
  const button = document.querySelector<HTMLButtonElement>("#download")!;
  const status = document.querySelector<HTMLParagraphElement>("#status")!;
  const error = document.querySelector<HTMLParagraphElement>("#error")!;
  const warning = document.querySelector<HTMLParagraphElement>("#tbc-note")!;
  const startGroup = document.querySelector<HTMLElement>("#start-group")!;
  const data = parseData(JSON.parse(document.querySelector("#guide-data")!.textContent ?? "null"));
  let busy = false;
  button.disabled = false;
  game.addEventListener("change", (): void => {
    warning.hidden = game.value !== "tbc";
    startGroup.textContent = `${game.value === "tbc" ? "KFC TBC Preview" : "KFC Group Leveling"} · 01-20`;
    status.textContent = "";
  });
  account.addEventListener("input", (): void => {
    error.hidden = true;
    status.textContent = "";
  });
  form.addEventListener("submit", (event: SubmitEvent): void => {
    event.preventDefault();
    if (busy) return;
    void download();
  });

  async function download(): Promise<void> {
    busy = true;
    button.disabled = account.disabled = game.disabled = true;
    button.textContent = "Preparing your guide…";
    form.setAttribute("aria-busy", "true");
    error.hidden = true;
    status.textContent = "";
    try {
      if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined")
        throw new Error("Open this page in a recent Chrome, Brave, Firefox or Safari browser.");
      const mode = game.value === "tbc" ? "tbc" : "forever";
      const guides = data[mode],
        battleTag = account.value.trim();
      const encoded = await codec.encodeRestedXpImport(guides, battleTag, compression);
      const decoded = await codec.decodeRestedXpImport(encoded, battleTag, compression);
      if (
        decoded.guides.length !== guides.length ||
        decoded.guides.some((guide, index) => guide !== guides[index])
      )
        throw new Error("The import could not be verified. Please try again.");
      const url = URL.createObjectURL(new Blob([encoded], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `kfc-human-party-${data.fileRange}-${mode}.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout((): void => URL.revokeObjectURL(url), 10_000);
      status.textContent =
        "Downloaded. Open the text file, copy everything, and paste into RestedXP → Guide Import.";
    } catch (failure: unknown) {
      error.textContent =
        failure instanceof Error
          ? failure.message
          : "The guide could not be downloaded. Try again.";
      error.hidden = false;
    } finally {
      busy = false;
      button.disabled = account.disabled = game.disabled = false;
      button.textContent = "Download guide";
      form.setAttribute("aria-busy", "false");
    }
  }
}

export function startGuideDownload(codec: ImportCodec): void {
  try {
    start(codec);
  } catch {
    const error = document.querySelector<HTMLParagraphElement>("#error");
    if (error) {
      error.textContent = "The guide file is incomplete. Generate a fresh download page.";
      error.hidden = false;
    }
  }
}
