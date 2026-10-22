import { describe, expect, it } from "vitest";
import {
  campaignExportSelectionSchema,
  campaignExportProgress,
  campaignExportSelectionFromProgress,
  campaignPartyStarterSchema,
  restedXpDocumentSetSchema,
} from "./index.js";

function document(
  name: string,
  next?: string,
): { role: "leader"; group: string; name: string; content: string; actionIds: string[] } {
  return {
    role: "leader",
    group: "KFC Fixture",
    name,
    content: `#forever\n#group KFC Fixture\n#name ${name}\n${next ? `#next ${next}\n` : ""}step\n    >> Follow the road.\n`,
    actionIds: [name.toLowerCase()],
  };
}
function fixture(): unknown {
  return {
    schema: "kfc-restedxp-documents.v1",
    publication: "review",
    compilerRevision: "test-v1",
    routeRelease: "test-route",
    sourceBuild: 70205,
    runtimeBuild: 70450,
    restedXpVersion: "v4.11.27",
    selection: {},
    documents: [document("First", "Second"), document("Second")],
  };
}

describe("review document and configuration boundary", () => {
  it("uses existing route-choice schemas without exporting actual player or campaign progress", () => {
    const selection = campaignExportSelectionSchema.parse({
      raidGoals: false,
      selectedExtras: { 123: true },
    });
    const progress = campaignExportProgress(selection);
    expect(progress.raidGoals).toBe(false);
    expect(progress.selectedExtras).toEqual({ 123: true });
    expect(campaignExportSelectionFromProgress(progress)).toEqual(selection);
    expect(progress.members).toHaveLength(5);
    expect(
      progress.members.every((member) => member.level === null && member.currentXp === null),
    ).toBe(true);
    for (const field of ["members", "campaigns", "account", "battleTag"])
      expect(campaignExportSelectionSchema.safeParse({ [field]: [] }).success).toBe(false);
  });

  it("accepts only a supported race/class for an independent personal starter", () => {
    expect(campaignPartyStarterSchema.parse({ race: "dwarf", classSlug: "priest" })).toEqual({
      race: "dwarf",
      classSlug: "priest",
    });
    for (const value of [
      { race: "gnome", classSlug: "druid" },
      { race: "orc", classSlug: "warrior" },
      { race: "dwarf", classSlug: "priest", name: "private character" },
    ])
      expect(campaignPartyStarterSchema.safeParse(value).success).toBe(false);
  });

  it("validates native chapter names and complete next chains", () => {
    const set = restedXpDocumentSetSchema.parse(fixture());
    expect(set.documents).toHaveLength(2);
    expect(
      restedXpDocumentSetSchema.safeParse({ ...set, documents: [set.documents[0]] }).success,
    ).toBe(false);
    expect(
      restedXpDocumentSetSchema.safeParse({
        ...set,
        documents: [set.documents[0], set.documents[0]],
      }).success,
    ).toBe(false);
    expect(
      restedXpDocumentSetSchema.safeParse({
        ...set,
        documents: [{ ...set.documents[0], name: "Changed" }, set.documents[1]],
      }).success,
    ).toBe(false);
    expect(
      restedXpDocumentSetSchema.safeParse({
        ...set,
        documents: [
          { ...set.documents[0], actionIds: ["duplicate", "duplicate"] },
          set.documents[1],
        ],
      }).success,
    ).toBe(false);
  });

  it("does not pretend review artifacts are approved public releases", () => {
    const set = restedXpDocumentSetSchema.parse(fixture());
    expect(restedXpDocumentSetSchema.safeParse({ ...set, publication: "published" }).success).toBe(
      false,
    );
    expect(
      restedXpDocumentSetSchema.safeParse({ ...set, battleTag: "DoNotPersist#1234" }).success,
    ).toBe(false);
  });
});
