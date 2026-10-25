import { describe, expect, it } from "vitest";

import {
  getIndexableCommunityDirectoryKinds,
  getCommunityEntitySearchSurface,
  type CommunityReferenceEntityDetail,
} from "./community-reference";

describe("community reference search policy", () => {
  it("keeps a newly imported reference-only NPC out of search until page quality is approved", () => {
    const entity = fixture();
    const surface = getCommunityEntitySearchSurface({
      ...entity,
      snapshot: { ...entity.snapshot, indexingApproved: false },
    });
    expect(surface.state).toBe("review_required");
    expect(surface.reasons).toContain("required_evidence_missing");
  });
  it("publishes directory roots only when they contain indexable entities", () => {
    expect(getIndexableCommunityDirectoryKinds(null)).toEqual([]);
    expect(getIndexableCommunityDirectoryKinds({ npcIds: [], objectIds: [] })).toEqual([]);
    expect(getIndexableCommunityDirectoryKinds({ npcIds: [5], objectIds: [] })).toEqual(["npc"]);
    expect(getIndexableCommunityDirectoryKinds({ npcIds: [5], objectIds: [7] })).toEqual([
      "npc",
      "object",
    ]);
  });

  it("indexes useful published entities and carries normalized outgoing links", () => {
    const entity = fixture();
    const surface = getCommunityEntitySearchSurface(entity);

    expect(surface).toMatchObject({
      state: "indexable",
      reasons: ["eligible"],
      evidenceKinds: ["published_community"],
    });
    expect(surface.outgoingLinks).toEqual([
      "https://kfcguild.online/tools/forever/encyclopedia/quests/7",
    ]);
  });

  it("holds identity conflicts and empty entities out of search", () => {
    const conflict = getCommunityEntitySearchSurface({
      ...fixture(),
      identityAgreement: {
        status: "conflicting",
        referenceCount: 1,
        observedCount: 1,
        agreeingObservedCount: 0,
        conflictingObservedCount: 1,
        conflictingNames: ["Other name"],
      },
    });
    const empty = getCommunityEntitySearchSurface({
      ...fixture(),
      locations: [],
      relationships: [],
      relationshipCount: 0,
    });

    expect(conflict.state).toBe("review_required");
    expect(conflict.reasons).toContain("identity_conflict");
    expect(empty.state).toBe("review_required");
    expect(empty.reasons).toContain("required_evidence_missing");
  });
});

function fixture(): CommunityReferenceEntityDetail {
  return {
    kind: "npc",
    id: 5,
    name: "Quest Keeper",
    subName: null,
    minimumLevel: null,
    maximumLevel: null,
    rank: null,
    zoneId: null,
    snapshot: {
      sourceName: "QuestieDB Forever",
      sourceVersion: "v1",
      sourceRevision: "abc",
      publishedAt: new Date("2026-10-18T00:00:00.000Z"),
      buildNumber: 70450,
      clientVersion: "1.15.8",
    },
    locations: [],
    rejectedLocationCount: 0,
    relationships: [
      {
        direction: "outgoing",
        relationKind: "starts_quest",
        normalizedKind: "starts_quest",
        label: "Quest start relationship",
        href: "/forever/encyclopedia/quests/7",
        relatedKind: "quest",
        relatedId: 7,
        relatedName: "A Test Quest",
      },
    ],
    relationshipCount: 1,
    observations: [],
    identityAgreement: {
      status: "single_source",
      referenceCount: 1,
      observedCount: 0,
      agreeingObservedCount: 0,
      conflictingObservedCount: 0,
      conflictingNames: [],
    },
  };
}
