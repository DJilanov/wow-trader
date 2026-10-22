import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  campaignExportSelectionSchema,
  compileCampaignAddon,
} from "../packages/leveling/dist/index.js";
import { verifyCampaignAddonReview } from "./campaign-addon-review-check.mjs";

function quest(id, legId, leaderOnly, questId) {
  return ["accepted", "rewarded"].map((state) => ({
    id: `${id}-${state}`,
    legId,
    leaderOnly,
    questChanges: [{ questId, title: "Test quest", state, objectiveIndex: null }],
    title: "Test quest",
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  }));
}

function fixture(partyStarter) {
  const personal = quest("personal", "personal", true, 700);
  const shared = quest("shared", "shared", false, 701);
  const other = quest("other", "other", true, 702);
  const leg = (id, actions, kind) => ({
    id,
    title: id,
    from: 1,
    to: 10,
    kind,
    actionIds: actions.map((action) => action.id),
    questIds: actions.map((action) => action.questChanges[0].questId),
    unresolvedQuestIds: [],
    stopId: null,
  });
  const actions = [...personal, ...shared];
  const plan = {
    release: "review-check-fixture",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [leg("personal", personal, "starter"), leg("shared", shared, "xp-bridge")],
    starters: {
      entries: other.map((action) => ({ action, activities: [] })),
      routes: [
        {
          race: "dwarf",
          classSlug: "priest",
          actionIndexes: [0, 1],
          legs: [leg("other", other, "starter")],
        },
      ],
    },
  };
  const options = {
    version: "0.2.0-review.6",
    runtimeBuild: 70450,
    interfaceVersion: 16001,
    restedXpVersion: "v4.11.27",
    partyStarter,
    selection: campaignExportSelectionSchema.parse({ raidGoals: false }),
  };
  return { plan, actions, options, artifact: compileCampaignAddon(plan, actions, options) };
}

test("review verifier checks shared-only, same-edition and independent member starters", () => {
  for (const starter of [
    undefined,
    { race: "human", classSlug: "warrior" },
    { race: "dwarf", classSlug: "priest" },
  ]) {
    const { plan, actions, artifact, options } = fixture(starter);
    verifyCampaignAddonReview(plan, actions, artifact, options);
  }
});

test("review verifier rejects a different member inventory and altered document action IDs", () => {
  const original = fixture({ race: "dwarf", classSlug: "priest" });
  assert.throws(
    () =>
      verifyCampaignAddonReview(
        { ...original.plan, starters: undefined },
        original.actions,
        original.artifact,
        original.options,
      ),
    /canonical member starter catalog is absent/,
  );
  const wrongStarter = globalThis.structuredClone(original.artifact);
  wrongStarter.guides[1].requestedActionIds[0] = "party-personal-wrong-starter";
  assert.throws(
    () =>
      verifyCampaignAddonReview(original.plan, original.actions, wrongStarter, original.options),
    /Wrong canonical role\/starter/,
  );
  const wrongDocument = globalThis.structuredClone(original.artifact);
  wrongDocument.documents[0].actionIds[0] = "unrequested-action";
  assert.throws(
    () =>
      verifyCampaignAddonReview(original.plan, original.actions, wrongDocument, original.options),
    /action summary/,
  );
});

test("review verifier catches a cyclic chapter chain even when all referenced names exist", () => {
  const { plan, actions, artifact, options } = fixture();
  const first = artifact.documents[0];
  first.content = first.content.replace(/^#next .+$/m, "#next " + first.name);
  assert.throws(
    () => verifyCampaignAddonReview(plan, actions, artifact, options),
    /Chapter chain skips, loops or changes order/,
  );
});

test("review verifier accepts duplicate-phase receipts but refuses missing or fabricated receipts", () => {
  const { plan, actions, options } = fixture();
  const repeated = quest("repeated", "shared", false, 701);
  const requested = [...actions, ...repeated];
  const artifact = compileCampaignAddon(plan, requested, options);
  verifyCampaignAddonReview(plan, requested, artifact, options);
  const missing = globalThis.structuredClone(artifact);
  missing.guides[0].normalizations = [];
  assert.throws(
    () => verifyCampaignAddonReview(plan, requested, missing, options),
    /exact duplicate-phase receipt/,
  );
  const fabricated = globalThis.structuredClone(artifact);
  fabricated.guides[0].normalizations[0].removedQuestChanges[0].questId = 999;
  assert.throws(
    () => verifyCampaignAddonReview(plan, requested, fabricated, options),
    /unauthored quest phase/,
  );
});

test("full matrix CLI rejects ambiguous flags before reading any input files", () => {
  const script = resolve(import.meta.dirname, "build-leveling-campaign-addon.mjs");
  const required = [
    "--archive=unused",
    "--rewards=unused",
    "--reward-import=unused",
    "--runtime-build=70450",
    "--restedxp-version=v4.11.27",
  ];
  for (const [flags, message] of [
    [["--verify-party-matrix"], /requires --verify-all/],
    [
      ["--verify-all", "--verify-party-matrix", "--party-race=dwarf", "--party-class=priest"],
      /cannot use a fixed member edition/,
    ],
  ]) {
    const result = spawnSync(process.execPath, [script, ...required, ...flags], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  }
});
