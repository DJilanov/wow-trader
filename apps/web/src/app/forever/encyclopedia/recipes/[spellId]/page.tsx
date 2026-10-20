import type { Metadata } from "next";

import { CatalogRecipePage, createCatalogRecipeMetadata } from "../../../../recipes/[spellId]/page";
import { FOREVER_CATALOG_PAGE_CONFIG } from "../../../../../lib/catalog-page-config";

export const revalidate = 3_600;

interface ForeverRecipePageProps {
  readonly params: Promise<{ readonly spellId: string }>;
}

export function generateMetadata(props: ForeverRecipePageProps): Promise<Metadata> {
  return createCatalogRecipeMetadata(props, FOREVER_CATALOG_PAGE_CONFIG);
}

export default function ForeverRecipePage(
  props: ForeverRecipePageProps,
): Promise<React.JSX.Element> {
  return CatalogRecipePage({ ...props, config: FOREVER_CATALOG_PAGE_CONFIG });
}
