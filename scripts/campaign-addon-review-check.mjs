import assert from "node:assert/strict";
import {
  CAMPAIGN_ADDON_COMPILER_REVISION,
  restedXpDocumentSetSchema,
} from "../packages/leveling/dist/index.js";

/**
 * @param {import("../packages/leveling/dist/index.js").CampaignPlan} plan
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAction[]} actions
 * @param {import("../packages/leveling/dist/index.js").CampaignPartyStarter} starter
 * @returns {readonly import("../packages/leveling/dist/index.js").CampaignAction[]}
 */
function personalActions(plan, actions, starter) {
  if (starter.race === plan.race && starter.classSlug === plan.leaderClass) {
    const legs = new Set(plan.legs.filter((leg) => leg.kind === "starter").map((leg) => leg.id));
    return actions.filter((action) => action.leaderOnly && legs.has(action.legId));
  }
  const catalog = plan.starters;
  assert(catalog, "The canonical member starter catalog is absent.");
  const route = catalog.routes.find(
    (entry) => entry.race === starter.race && entry.classSlug === starter.classSlug,
  );
  assert(route, "The requested member starter is absent from the canonical catalog.");
  return route.actionIndexes.map((index) => {
    const entry = catalog.entries[index];
    assert(entry, "The requested member starter has a missing action.");
    return entry.action;
  });
}

/**
 * Independent manifest/coverage checks; not a simulation of in-game quest availability.
 * @param {import("../packages/leveling/dist/index.js").CampaignPlan} plan
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAction[]} actions
 * @param {import("../packages/leveling/dist/index.js").CampaignAddonArtifact} artifact
 * @param {{runtimeBuild: number, restedXpVersion: string, selection: import("../packages/leveling/dist/index.js").CampaignExportSelection, partyStarter?: import("../packages/leveling/dist/index.js").CampaignPartyStarter}} options
 * @returns {void}
 */
export function verifyCampaignAddonReview(plan, actions, artifact, options) {
  const documents = restedXpDocumentSetSchema.parse({
    schema: "kfc-restedxp-documents.v1",
    publication: "review",
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    routeRelease: plan.release,
    sourceBuild: plan.targetBuild,
    runtimeBuild: options.runtimeBuild,
    restedXpVersion: options.restedXpVersion,
    nativePolicy: artifact.nativePolicy,
    edition: {
      leader: { race: plan.race, classSlug: plan.leaderClass },
      partyStarter: options.partyStarter,
    },
    selection: options.selection,
    documents: artifact.documents,
  });
  assert.deepEqual(
    artifact.guides.map((guide) => guide.role),
    ["leader", "party"],
  );
  const shared = actions.filter((action) => !action.leaderOnly);
  const member = options.partyStarter
    ? [
        ...personalActions(plan, actions, options.partyStarter).map((action) => ({
          ...action,
          id: `party-personal-${action.id}`,
        })),
        ...shared,
      ]
    : shared;
  for (const summary of artifact.guides) {
    const expected = summary.role === "leader" ? actions : member;
    assert.deepEqual(
      summary.requestedActionIds,
      expected.map((action) => action.id),
      "Wrong canonical role/starter action inventory.",
    );
    const emitted = documents.documents.filter((document) => document.role === summary.role);
    assert.deepEqual(
      emitted.map((document) => document.name),
      summary.names,
      "Guide chapter order differs from its summary.",
    );
    assert(emitted.every((document) => document.group === summary.group));
    assert.deepEqual(
      emitted.flatMap((document) => document.actionIds),
      summary.actionIds,
      "Guide documents differ from their action summary.",
    );
    assert.equal(
      new Set(summary.actionIds).size,
      summary.actionIds.length,
      "Action repeated across chapters.",
    );
    const expectedById = new Map(expected.map((action) => [action.id, action]));
    /** @type {Map<string, import("../packages/leveling/dist/index.js").CampaignAddonGuideSummary["normalizations"][number]>} */
    const normalizations = new Map();
    for (const record of summary.normalizations) {
      const original = expectedById.get(record.actionId);
      assert(
        original && !normalizations.has(record.actionId),
        "Unknown or duplicate normalization receipt.",
      );
      assert.equal(record.reason, "duplicate-one-time-quest-phase");
      assert(record.removedQuestChanges.length > 0, "Empty normalization receipt.");
      for (const change of record.removedQuestChanges)
        assert(
          original.questChanges.some((entry) => JSON.stringify(entry) === JSON.stringify(change)),
          "Normalization contains an unauthored quest phase.",
        );
      normalizations.set(record.actionId, record);
    }
    const retained = new Set(summary.actionIds);
    for (const id of retained)
      assert(expectedById.has(id), "Export contains an unrequested action.");
    for (const action of expected) {
      if (retained.has(action.id)) continue;
      assert.deepEqual(
        normalizations.get(action.id)?.removedQuestChanges,
        action.questChanges,
        "An action disappeared without an exact duplicate-phase receipt.",
      );
      assert(action.questChanges.length > 0, "A non-quest instruction disappeared.");
    }
    for (const [index, document] of emitted.entries()) {
      const next = /^#next ([^\r\n]+)\r?$/m.exec(document.content)?.[1];
      assert.equal(next, emitted[index + 1]?.name, "Chapter chain skips, loops or changes order.");
      assert(
        artifact.lua.includes(document.content),
        "ZIP Lua differs from its native guide document.",
      );
    }
  }
}
