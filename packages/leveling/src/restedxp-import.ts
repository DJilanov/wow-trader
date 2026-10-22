/** Stock v4.11.27 transport compatibility, not an authorization or content-encryption boundary. */
export const RESTEDXP_IMPORT_VERSION = 40000;
export const RESTEDXP_IMPORT_LIMITS = {
  guides: 500,
  plaintextBytes: 8_000_000,
  encodedCharacters: 12_000_000,
} as const;

export interface RestedXpCompression {
  compressZlib(bytes: Uint8Array): Promise<Uint8Array>;
  decompressZlib(bytes: Uint8Array, maximumBytes: number): Promise<Uint8Array>;
}

export interface RestedXpDecodedImport {
  readonly version: number;
  readonly guides: readonly string[];
  readonly checksum: number;
}

export function restedXpAdler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let start = 0; start < bytes.length; start += 5552) {
    const end = Math.min(start + 5552, bytes.length);
    for (let index = start; index < end; index++) {
      a += bytes[index]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function accountState(battleTag: string): Uint8Array {
  const normalized = battleTag.trim();
  if (
    !/^[^\s#]{1,40}#[0-9]{4,12}$/u.test(normalized) ||
    /[\uD800-\uDFFF]/u.test(normalized) ||
    Array.from(normalized).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error("Enter a BattleTag in Name#1234 format.");
  // Lua lower/sub operate on UTF-8 bytes, not Unicode code points or JS characters.
  const input = new TextEncoder().encode(normalized);
  for (let index = 0; index < input.length; index++)
    if (input[index]! >= 65 && input[index]! <= 90) input[index] = input[index]! + 32;
  const tail = input.subarray(Math.max(0, input.length - 16));
  const key = new Uint8Array(16);
  key.set(tail, 16 - tail.length);
  for (let index = 0; index < 16; index++)
    key[-index & 15] =
      key[(15 - index) & 15]! ^
      key[(13 - index) & 15]! ^
      key[(12 - index) & 15]! ^
      key[(10 - index) & 15]!;
  const state = Uint8Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let index = 0; index < 256; index++) {
    j = (j + state[index]! + key[index & 15]!) & 255;
    [state[index], state[j]] = [state[j]!, state[index]!];
  }
  input.fill(0);
  key.fill(0);
  return state;
}

function transform(bytes: Uint8Array, battleTag: string): Uint8Array {
  const state = accountState(battleTag);
  const output = new Uint8Array(bytes.length);
  let i = 0;
  let j = 0;
  try {
    for (let index = 0; index < bytes.length; index++) {
      i = (i + 1) & 255;
      j = (j + state[i]!) & 255;
      [state[i], state[j]] = [state[j]!, state[i]!];
      output[index] = bytes[index]! ^ state[(state[i]! + state[j]!) & 255]!;
    }
    return output;
  } finally {
    state.fill(0);
  }
}

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return globalThis.btoa(chunks.join(""));
}

function unbase64(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid RestedXP Base64 payload.");
  const decoded = globalThis.atob(value);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (base64(bytes) !== value) throw new Error("Non-canonical RestedXP Base64 payload.");
  return bytes;
}

function validateGuide(guide: string): void {
  if (
    guide.includes("\0") ||
    /^\s*RXPGuides[.:]/m.test(guide) ||
    !/^#(?:forever|classic|tbc|wotlk)\s*$/m.test(guide) ||
    (guide.match(/^#name [^\r\n]+\r?$/gm) ?? []).length !== 1 ||
    (guide.match(/^#group [^\r\n]+\r?$/gm) ?? []).length !== 1 ||
    !/^step(?:\s*<<[^\r\n]+)?\s*$/m.test(guide)
  )
    throw new Error("Import requires complete native guide documents, not Lua wrappers or HTML.");
}

function verifyZlib(bytes: Uint8Array, checksum: number): void {
  const cmf = bytes[0] ?? 0;
  const flg = bytes[1] ?? 0;
  const end = bytes.length;
  const trailer =
    ((bytes[end - 4] ?? 0) * 16777216 +
      (bytes[end - 3] ?? 0) * 65536 +
      (bytes[end - 2] ?? 0) * 256 +
      (bytes[end - 1] ?? 0)) >>>
    0;
  if (
    bytes.length < 8 ||
    (cmf & 15) !== 8 ||
    cmf > 0x78 ||
    (flg & 0x20) !== 0 ||
    (cmf * 256 + flg) % 31 !== 0 ||
    trailer !== checksum
  )
    throw new Error("RestedXP account mismatch or damaged payload.");
}

export async function encodeRestedXpImport(
  guides: readonly string[],
  battleTag: string,
  compression: RestedXpCompression,
): Promise<string> {
  if (!guides.length || guides.length > RESTEDXP_IMPORT_LIMITS.guides)
    throw new Error("RestedXP guide count exceeds the supported bounds.");
  guides.forEach(validateGuide);
  const bytes = new TextEncoder().encode(guides.join("\0"));
  if (bytes.length > RESTEDXP_IMPORT_LIMITS.plaintextBytes)
    throw new Error("RestedXP guide content exceeds its size limit.");
  const checksum = restedXpAdler32(bytes);
  const compressed = await compression.compressZlib(bytes);
  if (compressed.length > RESTEDXP_IMPORT_LIMITS.plaintextBytes + 65536)
    throw new Error("RestedXP compressed content exceeds its size limit.");
  verifyZlib(compressed, checksum);
  const encoded = `${guides.length}|${checksum}:${base64(transform(compressed, battleTag))}%|${RESTEDXP_IMPORT_VERSION}`;
  if (encoded.length > RESTEDXP_IMPORT_LIMITS.encodedCharacters)
    throw new Error("RestedXP import exceeds its size limit.");
  return encoded;
}

export async function decodeRestedXpImport(
  encoded: string,
  battleTag: string,
  compression: RestedXpCompression,
): Promise<RestedXpDecodedImport> {
  if (encoded.length > RESTEDXP_IMPORT_LIMITS.encodedCharacters)
    throw new Error("RestedXP import exceeds its size limit.");
  const match = /^([1-9]\d{0,2})\|([0-9]{1,10}):([A-Za-z0-9+/=]+)%\|([0-9]{1,6})$/.exec(
    encoded.trim(),
  );
  if (!match) throw new Error("Invalid or truncated RestedXP import envelope.");
  const count = Number(match[1]);
  const checksum = Number(match[2]);
  if (count > RESTEDXP_IMPORT_LIMITS.guides || checksum > 0xffffffff)
    throw new Error("RestedXP import metadata exceeds the supported bounds.");
  if (Number(match[4]) !== RESTEDXP_IMPORT_VERSION)
    throw new Error("Unsupported RestedXP import version.");
  const compressed = transform(unbase64(match[3]!), battleTag);
  verifyZlib(compressed, checksum);
  let bytes: Uint8Array;
  try {
    bytes = await compression.decompressZlib(compressed, RESTEDXP_IMPORT_LIMITS.plaintextBytes);
  } catch {
    throw new Error("RestedXP payload could not be decompressed within its size limit.");
  }
  if (bytes.length > RESTEDXP_IMPORT_LIMITS.plaintextBytes || restedXpAdler32(bytes) !== checksum)
    throw new Error("RestedXP content failed its size or checksum verification.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("RestedXP guide content is not valid UTF-8.");
  }
  const guides = text.split("\0");
  if (guides.length !== count) throw new Error("RestedXP guide count does not match its payload.");
  guides.forEach(validateGuide);
  return { version: RESTEDXP_IMPORT_VERSION, checksum, guides };
}
