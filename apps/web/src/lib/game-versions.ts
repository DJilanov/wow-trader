export const TBC_CLIENT_PRODUCT = "wow_anniversary";
export const FOREVER_CLIENT_PRODUCT = "wow_classic_beta";

export type SupportedClientProduct = typeof TBC_CLIENT_PRODUCT | typeof FOREVER_CLIENT_PRODUCT;

export function isSupportedClientProduct(value: string): value is SupportedClientProduct {
  return value === TBC_CLIENT_PRODUCT || value === FOREVER_CLIENT_PRODUCT;
}
