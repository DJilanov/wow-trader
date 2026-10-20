import type { ReferenceRecord } from "@wow-trader/reference-data";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as CatalogReferenceModule from "./catalog-reference";

vi.mock("./catalog-reference", async (importOriginal): Promise<object> => ({
  ...(await importOriginal<typeof CatalogReferenceModule>()),
  getCatalogReference: vi.fn(),
}));
vi.mock("./forever-world", (): object => ({ getForeverQuest: vi.fn() }));

import QuestPage, { generateMetadata } from "../app/forever/encyclopedia/quests/[questId]/page";
import { getCatalogReference } from "./catalog-reference";
import { getForeverQuest } from "./forever-world";
import { HELPER_SITE_URL } from "./seo";

afterEach((): void => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("quest reference fallback", () => {
  it("does not index a useful partial quest reference", async () => {
    vi.mocked(getCatalogReference).mockResolvedValue({
      schema: "wowhead-reference.v1",
      game: "forever",
      kind: "quest",
      id: 1,
      name: "Partial Quest",
      sourceUrl: "https://www.wowhead.com/forever/quest=1",
      capturedAt: new Date().toISOString(),
      permissionRef: "test",
      sourceSha256: "a".repeat(64),
      tooltipLines: [],
      numericFacts: {},
      quickFacts: ["Requires level 5"],
      objectives: ["Bring the item."],
      description: "",
      rewards: [],
      relations: [],
    });
    vi.mocked(getForeverQuest).mockResolvedValue(null);
    const props = { params: Promise.resolve({ questId: "1" }) };
    expect((await generateMetadata(props)).robots).toMatchObject({ index: false });
    const markup = renderToStaticMarkup(await QuestPage(props));
    expect(markup).toContain("Partial reference.");
    expect(markup).toContain("Bring the item.");
  });
  it("renders approved external facts and a canonical when the client service fails", async () => {
    const reference: ReferenceRecord = {
      schema: "wowhead-reference.v1",
      game: "forever",
      kind: "quest",
      id: 1,
      name: "Test Quest",
      sourceUrl: "https://www.wowhead.com/forever/quest=1/test-quest",
      capturedAt: new Date().toISOString(),
      permissionRef: "unit-test",
      sourceSha256: "a".repeat(64),
      tooltipLines: [],
      numericFacts: {},
      quickFacts: ["Requires level 5"],
      objectives: ["Bring the item."],
      description: "Quest story.",
      rewards: ["50 reputation"],
      relations: [{ relation: "start", kind: "npc", id: 5, name: "Keeper" }],
    };
    vi.mocked(getCatalogReference).mockResolvedValue(reference);
    vi.mocked(getForeverQuest).mockRejectedValue(new Error("Client service unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation((): void => {});
    const props = { params: Promise.resolve({ questId: "1" }) };
    const metadata = await generateMetadata(props);
    const markup = renderToStaticMarkup(await QuestPage(props));
    expect(metadata.alternates?.canonical).toBe(`${HELPER_SITE_URL}/forever/encyclopedia/quests/1`);
    expect(metadata.robots).toBeUndefined();
    expect(markup).toContain("External reference");
    expect(markup).toContain("Bring the item.");
    expect(markup).toContain("50 reputation");
    expect(markup).toContain(reference.sourceUrl);
    expect(log).toHaveBeenCalled();
  });

  it("does not make the client outage indexable when no approved reference exists", async () => {
    vi.mocked(getCatalogReference).mockResolvedValue(null);
    vi.mocked(getForeverQuest).mockRejectedValue(new Error("Client service unavailable"));
    vi.spyOn(console, "error").mockImplementation((): void => {});
    const props = { params: Promise.resolve({ questId: "1" }) };
    expect((await generateMetadata(props)).robots).toMatchObject({ index: false, follow: true });
    const markup = renderToStaticMarkup(await QuestPage(props));
    expect(markup).toContain("Quest client data is currently unavailable");
    expect(markup).not.toContain("Attributed external reference");
  });
});
