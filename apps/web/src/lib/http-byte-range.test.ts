import { describe, expect, it } from "vitest";

import { parseByteRange } from "./http-byte-range";

describe("parseByteRange", () => {
  it("supports complete, open-ended, and suffix ranges", () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("rejects malformed, multiple, and unsatisfiable ranges", () => {
    expect(parseByteRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBe("invalid");
    expect(parseByteRange("items=0-1", 100)).toBe("invalid");
  });
});
