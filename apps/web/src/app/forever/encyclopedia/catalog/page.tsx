import type { Metadata } from "next";

import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import {
  CatalogDirectoryPage,
  createCatalogDirectoryMetadata,
} from "../../../tbc/encyclopedia/page";
import { FOREVER_CATALOG_PAGE_CONFIG } from "../../../../lib/catalog-page-config";

export const dynamic = "force-dynamic";

interface ForeverCatalogPageProps {
  readonly searchParams: Promise<{
    readonly q?: string | readonly string[];
    readonly type?: string | readonly string[];
  }>;
}

const catalogPath = "/forever/encyclopedia/catalog";

export function generateMetadata(props: ForeverCatalogPageProps): Promise<Metadata> {
  return createCatalogDirectoryMetadata(props, FOREVER_CATALOG_PAGE_CONFIG);
}

export default function ForeverCatalogPage(
  props: ForeverCatalogPageProps,
): Promise<React.JSX.Element> {
  return renderForeverCatalogPage(props);
}

async function renderForeverCatalogPage(
  props: ForeverCatalogPageProps,
): Promise<React.JSX.Element> {
  const catalog = await CatalogDirectoryPage({
    ...props,
    config: FOREVER_CATALOG_PAGE_CONFIG,
    catalogPath,
    showBis: false,
  });
  return (
    <>
      <ForeverEncyclopediaNav active="catalog" />
      {catalog}
    </>
  );
}
