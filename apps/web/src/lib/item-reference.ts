import { FOREVER_CLIENT_PRODUCT, type SupportedClientProduct } from "./game-versions";

export interface ExternalItemReference {
  readonly href: string;
  readonly label: string;
}

export function getExternalItemReference(
  clientProduct: SupportedClientProduct,
  itemId: number,
): ExternalItemReference | null {
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return null;
  if (clientProduct !== FOREVER_CLIENT_PRODUCT) return null;

  return {
    href: `https://www.wowhead.com/forever/item=${itemId}`,
    label: "Wowhead",
  };
}

export function getExternalSpellReference(
  clientProduct: SupportedClientProduct,
  spellId: number,
): ExternalItemReference | null {
  if (!Number.isSafeInteger(spellId) || spellId <= 0) return null;
  if (clientProduct !== FOREVER_CLIENT_PRODUCT) return null;

  return {
    href: `https://www.wowhead.com/forever/spell=${spellId}`,
    label: "Wowhead",
  };
}
