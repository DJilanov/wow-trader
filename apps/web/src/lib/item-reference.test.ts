import { describe, expect, it } from "vitest";

import { FOREVER_CLIENT_PRODUCT, TBC_CLIENT_PRODUCT } from "./game-versions";
import { getExternalItemReference, getExternalSpellReference } from "./item-reference";

describe("getExternalItemReference", () => {
  it("builds a Forever Wowhead item link from the item ID", () => {
    expect(getExternalItemReference(FOREVER_CLIENT_PRODUCT, 10_502)).toEqual({
      href: "https://www.wowhead.com/forever/item=10502",
      label: "Wowhead",
    });
  });

  it("leaves TBC items on the internal encyclopedia path", () => {
    expect(getExternalItemReference(TBC_CLIENT_PRODUCT, 10_502)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid item ID %s", (itemId) => {
    expect(getExternalItemReference(FOREVER_CLIENT_PRODUCT, itemId)).toBeNull();
  });
});

describe("getExternalSpellReference", () => {
  it("builds a Forever Wowhead spell link from the recipe spell ID", () => {
    expect(getExternalSpellReference(FOREVER_CLIENT_PRODUCT, 12_615)).toEqual({
      href: "https://www.wowhead.com/forever/spell=12615",
      label: "Wowhead",
    });
  });

  it("rejects unsupported products and invalid spell IDs", () => {
    expect(getExternalSpellReference(TBC_CLIENT_PRODUCT, 12_615)).toBeNull();
    expect(getExternalSpellReference(FOREVER_CLIENT_PRODUCT, 0)).toBeNull();
  });
});
