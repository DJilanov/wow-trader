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
 * Check optional generated opportunities independently of the compiler's lifecycle keys.
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAction[]} actions
 * @param {import("../packages/leveling/dist/index.js").CampaignAddonGuideSummary} summary
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAddonGuideDocument[]} documents
 * @returns {void}
 */
function verifyOptionalOpportunities(actions, summary, documents) {
  const quests = new Map();
  for (const action of actions)
    for (const questId of new Set(action.questChanges.map((change) => change.questId))) {
      const entries = quests.get(questId) ?? [];
      entries.push(action);
      quests.set(questId, entries);
    }
  const retained = new Set(summary.actionIds);
  const removals = new Map(
    summary.normalizations.map((entry) => [entry.actionId, entry.removedQuestChanges]),
  );
  const phase = (change) => `${change.state}:${change.objectiveIndex ?? 0}`;
  for (const [questId, entries] of quests) {
    const groundReferences = entries.map((entry) => entry.fundingGroundPickup);
    const reference = groundReferences[0];
    const groundOpportunity =
      reference?.questId === questId &&
      new Set(groundReferences.map((ground) => JSON.stringify(ground))).size === 1 &&
      entries.every(
        (entry) =>
          entry.libraryObjective === "interaction" &&
          !entry.itemCollections?.length &&
          entry.questChanges.every(
            (change) =>
              change.state !== "objectives-complete" ||
              change.objectiveIndex === reference.objectiveIndex,
          ),
      );
    if (
      !entries.some((entry) => entry.xpOptional) ||
      entries.some(
        (entry) =>
          entry.source !== null ||
          entry.kind !== "quests" ||
          entry.libraryQuestId !== questId ||
          (entry.libraryObjective !== "shared-kills" && !groundOpportunity) ||
          !entry.fundingCheckpointId ||
          entry.questChanges.some((change) => change.questId !== questId),
      )
    )
      continue;
    const windows = new Set(entries.map((entry) => entry.fundingCheckpointId));
    if (windows.size < 2) continue;
    for (const window of windows) {
      const expected = entries.filter((entry) => entry.fundingCheckpointId === window);
      const emitted = expected.filter((entry) => retained.has(entry.id));
      const phases = new Set(expected.flatMap((entry) => entry.questChanges.map(phase)));
      if (groundOpportunity)
        assert(
          phases.has(`objectives-complete:${reference.objectiveIndex}`),
          "A ground opportunity has no object objective.",
        );
      for (const required of phases)
        assert(
          emitted.some(
            (entry) =>
              entry.questChanges.filter((change) => phase(change) === required).length >
              (removals.get(entry.id) ?? []).filter((change) => phase(change) === required).length,
          ),
          "An optional quest opportunity lost a required phase.",
        );
      for (const action of emitted) {
        const document = documents.find((entry) => entry.actionIds.includes(action.id));
        assert(document, "An optional opportunity has no guide document.");
        const label = `    #label kfc-${action.id}\n`;
        const block = document.content.split(label)[1]?.split("\nstep")[0];
        const guard =
          action.questChanges[0].state === "accepted" ? ".isQuestAvailable" : ".isOnQuest";
        assert(
          block?.split("\n").includes(`    ${guard} ${questId}`),
          "An optional quest opportunity lost its quest-status guard.",
        );
      }
    }
  }
}

/**
 * Check physical collection targets against captured raw rows, independently of native lowering.
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAction[]} actions
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAddonGuideDocument[]} documents
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignSource[] | undefined} sources
 * @returns {void}
 */
function verifyItemCollections(actions, documents, sources) {
  const tuple = (argumentsValue) =>
    argumentsValue
      .split(/\s+>>/, 1)[0]
      .split(",")
      .map((value) => value.trim());
  for (const action of actions) {
    if (!action.source || !action.itemCollections?.length) continue;
    const source = sources?.find(
      (entry) =>
        entry.guide.chapterId === action.source.chapterId &&
        entry.guide.version === action.source.version,
    );
    const step = source?.guide.steps.find((entry) => entry.id === action.source.stepId);
    assert(step, "A canonical collection source is absent.");
    const document = documents.find((entry) => entry.actionIds.includes(action.id));
    assert(document, "A canonical item collection disappeared from the native guide.");
    const block = document.content.split(`    #label kfc-${action.id}\n`)[1]?.split("\nstep")[0];
    assert(block, "A canonical item collection has no labeled native block.");
    const emitted = [...block.matchAll(/^\s*\.collect\s+([^\r\n]+)$/gm)].map((match) =>
      tuple(match[1]),
    );
    for (const target of action.itemCollections) {
      const expected = [target.itemId, target.quantity, target.questId, target.objectiveBitmask];
      const raw = step.directives
        .filter((row) => row.tag === ".collect")
        .map((row) => tuple(row.arguments))
        .filter(
          (args) =>
            (args.length === 4 || (args.length === 5 && ["0", "1"].includes(args[4]))) &&
            args.slice(0, 4).every((value, index) => Number(value) === expected[index]),
        );
      assert(raw.length > 0, "A canonical item collection has no matching raw target.");
      const requiredRows = raw.map((args) =>
        action.questChanges.length === 0 && args.length === 5 && args[4] === "1"
          ? args.slice(0, 4)
          : args,
      );
      assert(
        emitted.some((args) =>
          requiredRows.some(
            (original) =>
              args.length === original.length &&
              args.every((value, index) => value === original[index]),
          ),
        ),
        "A canonical item collection lost or changed its target, quantity, mask or required checkbox mode.",
      );
    }
  }
}

/**
 * Independent manifest/coverage checks; not a simulation of in-game quest availability.
 * @param {import("../packages/leveling/dist/index.js").CampaignPlan} plan
 * @param {readonly import("../packages/leveling/dist/index.js").CampaignAction[]} actions
 * @param {import("../packages/leveling/dist/index.js").CampaignAddonArtifact} artifact
 * @param {{runtimeBuild: number, restedXpVersion: string, selection: import("../packages/leveling/dist/index.js").CampaignExportSelection, partyStarter?: import("../packages/leveling/dist/index.js").CampaignPartyStarter, nativeSources?: readonly import("../packages/leveling/dist/index.js").CampaignSource[]}} options
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
    verifyOptionalOpportunities(expected, summary, emitted);
    verifyItemCollections(expected, emitted, options.nativeSources);
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
