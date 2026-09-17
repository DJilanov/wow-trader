export interface SearchableProduct {
  readonly name: string;
}

export function matchesProductName(products: readonly SearchableProduct[], query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) return true;

  return products.some((product) => product.name.toLocaleLowerCase().includes(normalizedQuery));
}
