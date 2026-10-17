import type { Metadata } from "next";

import { CatalogItemPage, createCatalogItemMetadata } from "../../../../items/[itemId]/page";
import { FOREVER_CATALOG_PAGE_CONFIG } from "../../../../../lib/catalog-page-config";

export const dynamic = "force-dynamic";

interface ForeverItemPageProps {
  readonly params: Promise<{ readonly itemId: string }>;
  readonly searchParams?: Promise<{
    readonly class?: string | readonly string[];
    readonly level?: string | readonly string[];
  }>;
}

export function generateMetadata(props: ForeverItemPageProps): Promise<Metadata> {
  return createCatalogItemMetadata(props, FOREVER_CATALOG_PAGE_CONFIG);
}

export default function ForeverItemPage(props: ForeverItemPageProps): Promise<React.JSX.Element> {
  return CatalogItemPage({ ...props, config: FOREVER_CATALOG_PAGE_CONFIG });
}
