import type { Metadata } from "next";

import {
  CatalogProfessionPage,
  createCatalogProfessionMetadata,
} from "../../../../professions/[slug]/page";
import { FOREVER_CATALOG_PAGE_CONFIG } from "../../../../../lib/catalog-page-config";

export const dynamic = "force-dynamic";

interface ForeverProfessionPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateMetadata(props: ForeverProfessionPageProps): Promise<Metadata> {
  return createCatalogProfessionMetadata(props, FOREVER_CATALOG_PAGE_CONFIG);
}

export default function ForeverProfessionPage(
  props: ForeverProfessionPageProps,
): Promise<React.JSX.Element> {
  return CatalogProfessionPage({ ...props, config: FOREVER_CATALOG_PAGE_CONFIG });
}
