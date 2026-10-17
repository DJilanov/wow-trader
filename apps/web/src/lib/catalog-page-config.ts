import {
  FOREVER_CLIENT_PRODUCT,
  TBC_CLIENT_PRODUCT,
  type SupportedClientProduct,
} from "./game-versions";

export interface CatalogPageConfig {
  readonly clientProduct: SupportedClientProduct;
  readonly gameLabel: string;
  readonly encyclopediaLabel: string;
  readonly encyclopediaBasePath: string;
  readonly traderPath: string;
  readonly wowheadGamePath: "forever" | "tbc";
  readonly maximumViewerLevel: number;
}

export const TBC_CATALOG_PAGE_CONFIG: CatalogPageConfig = {
  clientProduct: TBC_CLIENT_PRODUCT,
  gameLabel: "TBC Classic",
  encyclopediaLabel: "TBC Encyclopedia",
  encyclopediaBasePath: "/tbc/encyclopedia",
  traderPath: "/tbc/trader",
  wowheadGamePath: "tbc",
  maximumViewerLevel: 70,
};

export const FOREVER_CATALOG_PAGE_CONFIG: CatalogPageConfig = {
  clientProduct: FOREVER_CLIENT_PRODUCT,
  gameLabel: "WoW Forever",
  encyclopediaLabel: "Forever Encyclopedia",
  encyclopediaBasePath: "/forever/encyclopedia",
  traderPath: "/forever/trader",
  wowheadGamePath: "forever",
  maximumViewerLevel: 60,
};
