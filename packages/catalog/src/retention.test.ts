import { describe, expect, it } from "vitest";

import {
  selectSupersededCatalogBuildIds,
  type CatalogBuildRetentionCandidate,
} from "./retention.js";

const current: CatalogBuildRetentionCandidate = {
  id: "current",
  product: "wow_classic_beta",
  locale: "enUS",
  status: "review_required",
};

describe("selectSupersededCatalogBuildIds", () => {
  it("removes every previous build when the current catalog is published", () => {
    const candidates: CatalogBuildRetentionCandidate[] = [
      current,
      { ...current, id: "published", status: "published" },
      { ...current, id: "older-review" },
      { ...current, id: "rejected", status: "rejected" },
    ];

    expect(
      selectSupersededCatalogBuildIds(candidates, {
        currentBuildId: current.id,
        product: current.product,
        locale: current.locale,
        publishing: true,
      }),
    ).toEqual(["published", "older-review", "rejected"]);
  });

  it("keeps the published catalog while replacing older review candidates", () => {
    const candidates: CatalogBuildRetentionCandidate[] = [
      current,
      { ...current, id: "published", status: "published" },
      { ...current, id: "older-review" },
    ];

    expect(
      selectSupersededCatalogBuildIds(candidates, {
        currentBuildId: current.id,
        product: current.product,
        locale: current.locale,
        publishing: false,
      }),
    ).toEqual(["older-review"]);
  });

  it("never crosses product or locale boundaries", () => {
    const candidates: CatalogBuildRetentionCandidate[] = [
      current,
      { ...current, id: "other-product", product: "wow_anniversary", status: "published" },
      { ...current, id: "other-locale", locale: "deDE", status: "published" },
    ];

    expect(
      selectSupersededCatalogBuildIds(candidates, {
        currentBuildId: current.id,
        product: current.product,
        locale: current.locale,
        publishing: true,
      }),
    ).toEqual([]);
  });
});
