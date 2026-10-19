export function encodeCbor(value: unknown): Buffer {
  if (value === null) return Buffer.from([0xf6]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Test encoder requires finite numbers");
    if (!Number.isInteger(value)) {
      const output = Buffer.alloc(9);
      output[0] = 0xfb;
      output.writeDoubleBE(value, 1);
      return output;
    }
    return value >= 0 ? integer(0, value) : integer(1, -1 - value);
  }
  if (typeof value === "string") {
    const text = Buffer.from(value, "utf8");
    return Buffer.concat([integer(3, text.length), text]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([integer(4, value.length), ...value.map(encodeCbor)]);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return Buffer.concat([
      integer(5, entries.length),
      ...entries.flatMap(([key, entry]) => [encodeCbor(key), encodeCbor(entry)]),
    ]);
  }
  throw new Error("Unsupported test CBOR value");
}

function integer(major: number, value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid test CBOR integer");
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value <= 0xff) return Buffer.from([(major << 5) | 24, value]);
  if (value <= 0xffff) {
    const output = Buffer.alloc(3);
    output[0] = (major << 5) | 25;
    output.writeUInt16BE(value, 1);
    return output;
  }
  if (value <= 0xffffffff) {
    const output = Buffer.alloc(5);
    output[0] = (major << 5) | 26;
    output.writeUInt32BE(value, 1);
    return output;
  }
  throw new Error("Test CBOR integer is too large");
}
