import type { JsonValue } from "@wow-trader/contracts";

const BREAK = Symbol("cbor-break");

/** Decodes the bounded, JSON-compatible CBOR subset used by WoW addon metadata. */
export function decodeJsonCbor(bytes: Uint8Array): JsonValue {
  if (bytes.byteLength > 1_000_000) throw new Error("CBOR value exceeds size budget");
  const decoder = new Decoder(bytes);
  const value = decoder.read(0);
  if (value === BREAK) throw new Error("Unexpected CBOR break marker");
  if (!decoder.complete) throw new Error("CBOR value has trailing bytes");
  return value;
}

class Decoder {
  private offset = 0;

  public constructor(private readonly bytes: Uint8Array) {}

  public get complete(): boolean {
    return this.offset === this.bytes.byteLength;
  }

  public read(depth: number): JsonValue | typeof BREAK {
    if (depth > 64) throw new Error("CBOR nesting exceeds depth budget");
    const initial = this.byte();
    if (initial === 0xff) return BREAK;
    const major = initial >> 5;
    const info = initial & 0x1f;
    if (major === 0) return this.safeNumber(this.length(info));
    if (major === 1) return this.safeNumber(-1n - this.length(info));
    if (major === 2) {
      const value = this.bytesValue(info, depth);
      return new TextDecoder("utf-8", { fatal: true }).decode(value);
    }
    if (major === 3) return this.textValue(info, depth);
    if (major === 4) return this.arrayValue(info, depth);
    if (major === 5) return this.mapValue(info, depth);
    if (major === 6) {
      this.length(info);
      return this.expectValue(this.read(depth + 1));
    }
    if (major !== 7) throw new Error(`Unsupported CBOR major type ${major}`);
    if (info === 20) return false;
    if (info === 21) return true;
    if (info === 22 || info === 23) return null;
    if (info === 25) return this.float16(this.unsigned(2));
    if (info === 26) return this.float(4);
    if (info === 27) return this.float(8);
    throw new Error(`Unsupported CBOR simple value ${info}`);
  }

  private arrayValue(info: number, depth: number): JsonValue[] {
    const result: JsonValue[] = [];
    if (info === 31) {
      while (true) {
        const value = this.read(depth + 1);
        if (value === BREAK) return result;
        result.push(value);
        if (result.length > 100_000) throw new Error("CBOR array exceeds entry budget");
      }
    }
    const length = this.safeLength(this.length(info));
    for (let index = 0; index < length; index += 1)
      result.push(this.expectValue(this.read(depth + 1)));
    return result;
  }

  private mapValue(info: number, depth: number): { readonly [key: string]: JsonValue } {
    const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    const readEntry = (): boolean => {
      const key = this.read(depth + 1);
      if (key === BREAK) return false;
      if (typeof key !== "string" && typeof key !== "number")
        throw new Error("CBOR map keys must be strings or numbers");
      const normalized = String(key);
      if (Object.hasOwn(result, normalized)) throw new Error("CBOR map contains a duplicate key");
      result[normalized] = this.expectValue(this.read(depth + 1));
      return true;
    };
    if (info === 31) {
      let count = 0;
      while (readEntry()) {
        count += 1;
        if (count > 100_000) throw new Error("CBOR map exceeds entry budget");
      }
      return result;
    }
    const length = this.safeLength(this.length(info));
    for (let index = 0; index < length; index += 1) readEntry();
    return result;
  }

  private bytesValue(info: number, depth: number): Uint8Array {
    if (info !== 31) return this.take(this.safeLength(this.length(info)));
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const initial = this.byte();
      if (initial === 0xff) break;
      if (initial >> 5 !== 2) throw new Error("Invalid indefinite CBOR byte string chunk");
      const chunk = this.bytesValue(initial & 0x1f, depth + 1);
      size += chunk.byteLength;
      if (size > 1_000_000) throw new Error("CBOR byte string exceeds size budget");
      chunks.push(chunk);
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  private textValue(info: number, depth: number): string {
    if (info !== 31) return this.text(this.safeLength(this.length(info)));
    let result = "";
    while (true) {
      const initial = this.byte();
      if (initial === 0xff) return result;
      if (initial >> 5 !== 3) throw new Error("Invalid indefinite CBOR text chunk");
      result += this.textValue(initial & 0x1f, depth + 1);
      if (Buffer.byteLength(result) > 1_000_000) throw new Error("CBOR text exceeds size budget");
    }
  }

  private length(info: number): bigint {
    if (info < 24) return BigInt(info);
    if (info === 24) return BigInt(this.unsigned(1));
    if (info === 25) return BigInt(this.unsigned(2));
    if (info === 26) return BigInt(this.unsigned(4));
    if (info === 27) {
      const high = BigInt(this.unsigned(4));
      const low = BigInt(this.unsigned(4));
      return (high << 32n) | low;
    }
    throw new Error(`Unsupported CBOR length encoding ${info}`);
  }

  private safeNumber(value: bigint): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("CBOR integer exceeds safe range");
    return number;
  }

  private safeLength(value: bigint): number {
    const length = this.safeNumber(value);
    if (length < 0 || length > 1_000_000) throw new Error("CBOR collection exceeds size budget");
    return length;
  }

  private float(size: 4 | 8): number {
    const bytes = this.take(size);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const value = size === 4 ? view.getFloat32(0) : view.getFloat64(0);
    if (!Number.isFinite(value)) throw new Error("CBOR contains a non-finite number");
    return value;
  }

  private float16(bits: number): number {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    const value =
      exponent === 0
        ? sign * 2 ** -14 * (fraction / 1024)
        : exponent === 31
          ? Number.NaN
          : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    if (!Number.isFinite(value)) throw new Error("CBOR contains a non-finite number");
    return value;
  }

  private unsigned(size: 1 | 2 | 4): number {
    const bytes = this.take(size);
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    return value;
  }

  private text(length: number): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(this.take(length));
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.byteLength) throw new Error("Truncated CBOR value");
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  private byte(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new Error("Truncated CBOR value");
    this.offset += 1;
    return value;
  }

  private expectValue(value: JsonValue | typeof BREAK): JsonValue {
    if (value === BREAK) throw new Error("Unexpected CBOR break marker");
    return value;
  }
}
