import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceRecord } from "@wow-trader/reference-data";
import type * as CatalogReferenceModule from "./catalog-reference";

vi.mock("./data", (): object => ({ getItemDetail: vi.fn(), getReferenceClientItems: vi.fn() }));
vi.mock("./catalog-reference", async (importOriginal): Promise<object> => ({
  ...(await importOriginal<typeof CatalogReferenceModule>()),
  getCatalogReference: vi.fn(),
}));
import { createCatalogItemMetadata } from "../app/items/[itemId]/page";
import { CatalogReference } from "../components/catalog-reference";
import { getItemDetail } from "./data";
import { getCatalogReference } from "./catalog-reference";
import { FOREVER_CATALOG_PAGE_CONFIG } from "./catalog-page-config";
import { HELPER_SITE_URL } from "./seo";

afterEach((): void => {
  vi.resetAllMocks();
});
function fixture(): ReferenceRecord {
  return {
    schema: "wowhead-reference.v1",
    game: "forever",
    kind: "item",
    id: 25,
    name: "Test Sword",
    sourceUrl: "https://www.wowhead.com/forever/item=25",
    capturedAt: new Date().toISOString(),
    permissionRef: "test",
    sourceSha256: "a".repeat(64),
    tooltipLines: ["Test Sword", "Item Level 2", "1 - 3 Damage"],
    numericFacts: { classId: 2, subclassId: 7 },
    quickFacts: [],
    objectives: [],
    description: "",
    rewards: [],
    relations: [{ relation: "sold-by", kind: "npc", id: 1, name: "Vendor" }],
  };
}

describe("automatic publication page policy", () => {
  it("labels a useful partial reference without rendering unsafe markup", () => {
    const partial = {
      ...fixture(),
      relations: [],
      tooltipLines: ["<script>unsafe()</script>", "Item Level 2", "1 - 3 Damage"],
    };
    const markup = renderToStaticMarkup(createElement(CatalogReference, { record: partial }));
    expect(markup).toContain("Partial reference.");
    expect(markup).toContain("acquisition or crafting sources");
    expect(markup).toContain("Wowhead Forever reference");
    expect(markup).not.toContain("<script>");
  });
  it("keeps incomplete and conflicting item pages noindex while allowing complete matching items", async () => {
    vi.mocked(getItemDetail).mockResolvedValue({
      itemId: 25,
      name: "Test Sword",
      classId: 2,
      subclassId: 7,
      requiredLevel: 1,
      itemLevel: 2,
    } as Awaited<ReturnType<typeof getItemDetail>>);
    const props = { params: Promise.resolve({ itemId: "25" }) };
    vi.mocked(getCatalogReference).mockResolvedValue(fixture());
    const complete = await createCatalogItemMetadata(props, FOREVER_CATALOG_PAGE_CONFIG);
    expect(complete.robots).toBeUndefined();
    expect(complete.alternates?.canonical).toBe(`${HELPER_SITE_URL}/forever/encyclopedia/items/25`);
    vi.mocked(getCatalogReference).mockResolvedValue({ ...fixture(), relations: [] });
    expect(
      (await createCatalogItemMetadata(props, FOREVER_CATALOG_PAGE_CONFIG)).robots,
    ).toMatchObject({ index: false });
    vi.mocked(getCatalogReference).mockResolvedValue({ ...fixture(), name: "Other Sword" });
    expect(
      (await createCatalogItemMetadata(props, FOREVER_CATALOG_PAGE_CONFIG)).robots,
    ).toMatchObject({ index: false });
  });
});
