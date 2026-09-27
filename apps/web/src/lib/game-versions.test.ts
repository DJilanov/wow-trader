import { describe, expect, it } from "vitest";

import {
  FOREVER_CLIENT_PRODUCT,
  isSupportedClientProduct,
  TBC_CLIENT_PRODUCT,
} from "./game-versions";

describe("supported game versions", () => {
  it("accepts only the explicitly routed client products", () => {
    expect(isSupportedClientProduct(TBC_CLIENT_PRODUCT)).toBe(true);
    expect(isSupportedClientProduct(FOREVER_CLIENT_PRODUCT)).toBe(true);
    expect(isSupportedClientProduct("wow")).toBe(false);
    expect(isSupportedClientProduct("")).toBe(false);
  });
});
