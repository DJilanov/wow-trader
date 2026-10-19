import { describe, expect, it } from "vitest";

import { encodeCbor } from "./cbor-test-encoder.js";
import { decodeJsonCbor } from "./cbor.js";

describe("JSON CBOR decoder", () => {
  it("decodes the scalar and nested collection shapes used by addon metadata", () => {
    expect(
      decodeJsonCbor(
        encodeCbor({
          "1": "Quest name",
          "4": 34,
          p: 6,
          nested: [true, null, -2, { "1519": [[42.5, 24]] }],
        }),
      ),
    ).toEqual({
      "1": "Quest name",
      "4": 34,
      p: 6,
      nested: [true, null, -2, { "1519": [[42.5, 24]] }],
    });
    expect(decodeJsonCbor(Buffer.from([0x44, 0x4e, 0x61, 0x6d, 0x65]))).toBe("Name");
  });

  it("rejects trailing bytes and unsafe values", () => {
    expect(() => decodeJsonCbor(Buffer.from([0x01, 0x01]))).toThrow(/trailing/);
    expect(() => decodeJsonCbor(Buffer.from([0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 0]))).toThrow(
      /non-finite/,
    );
  });
});
