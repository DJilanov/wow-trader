import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  campaignExportSelectionSchema,
  compileCampaignAddon,
  CHAPTER_REFERENCES,
  parseGuideChapter,
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

function collectionFixture(label = "") {
  const value = fixture({ race: "human", classSlug: "warrior" });
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116);
  const guide = parseGuideChapter(
    `step\n.collect 769,4,700,1,1${label ? ` >> ${label}` : ""}\n.accept 700`,
    reference.id,
    "a".repeat(64),
    70205,
  );
  value.plan.actions[0] = {
    ...value.plan.actions[0],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0].id },
    itemCollections: [
      {
        questId: 700,
        itemId: 769,
        quantity: 4,
        objectiveBitmask: 1,
        confirmationKey: "test-physical-collection",
      },
    ],
  };
  value.options.nativeSources = [{ reference, guide }];
  value.artifact = compileCampaignAddon(value.plan, value.actions, value.options);
  return value;
}

test("review verifier preserves raw material counts and the checkbox-only flag in both roles", () => {
  const { plan, actions, artifact, options } = collectionFixture();
  verifyCampaignAddonReview(plan, actions, artifact, options);
  for (const role of ["leader", "party"])
    assert(
      artifact.documents.some(
        (document) => document.role === role && document.content.includes(".collect 769,4,700,1,1"),
      ),
    );
});

test("review verifier separates captured collect labels from numeric arguments", () => {
  const { plan, actions, artifact, options } = collectionFixture("Chunk of Boar Meat (4)");
  verifyCampaignAddonReview(plan, actions, artifact, options);
});

test("review verifier requires a blocking counter for an extracted required material task", () => {
  const value = collectionFixture("Required meat");
  const original = value.plan.actions[0];
  const material = { ...original, id: "personal-material", kind: "instructions", questChanges: [] };
  value.plan.actions.unshift(material);
  value.plan.legs[0].actionIds.unshift(material.id);
  delete value.plan.actions[1].itemCollections;
  value.artifact = compileCampaignAddon(value.plan, value.actions, value.options);
  verifyCampaignAddonReview(value.plan, value.actions, value.artifact, value.options);
  const broken = structuredClone(value.artifact);
  const document = broken.documents.find(
    (entry) => entry.role === "leader" && entry.content.includes("#label kfc-personal-material"),
  );
  const before = document.content;
  document.content = before.replace(
    ".collect 769,4,700,1 >> Required meat",
    ".collect 769,4,700,1,1 >> Required meat",
  );
  broken.lua = broken.lua.replace(before, document.content);
  assert.throws(
    () => verifyCampaignAddonReview(value.plan, value.actions, broken, value.options),
    /required checkbox mode/,
  );
});

test("review verifier requires the captured source for material provenance", () => {
  const { plan, actions, artifact, options } = collectionFixture();
  assert.throws(
    () => verifyCampaignAddonReview(plan, actions, artifact, { ...options, nativeSources: [] }),
    /collection source is absent/,
  );
});

for (const replacement of [
  "",
  ".collect 769,3,700,1,1",
  ".collect 769,4,701,1,1",
  ".collect 769,4,700,2,1",
  ".collect 769,4,700,1,0",
])
  test(`review verifier rejects changed material work (${replacement || "removed"})`, () => {
    const { plan, actions, artifact, options } = collectionFixture();
    const broken = structuredClone(artifact);
    const document = broken.documents.find(
      (entry) => entry.role === "leader" && entry.content.includes(".collect 769,4,700,1,1"),
    );
    const before = document.content;
    document.content = before.replace(".collect 769,4,700,1,1", replacement);
    broken.lua = broken.lua.replace(before, document.content);
    assert.throws(
      () => verifyCampaignAddonReview(plan, actions, broken, options),
      /item collection lost or changed/,
    );
  });

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

for (const objectiveKind of ["shared-kills", "interaction"]) {
  test(`review verifier rejects a receipted removal of a later ${objectiveKind} opportunity`, () => {
    const { plan, actions, options } = fixture();
    const ground = {
      questId: 701,
      itemId: 2998,
      objectiveIndex: 1,
      objectId: 1166,
      objectName: "Test chest",
      positions: [{ zone: "1436", x: 36, y: 54 }],
      sourceArchiveSha256: "a".repeat(64),
      source: { chapterId: "test", version: "v1", stepId: "step-1" },
    };
    const mapped = actions.map((action) =>
      action.questChanges[0].questId === 701
        ? {
            ...action,
            libraryQuestId: 701,
            libraryObjective: objectiveKind,
            fundingCheckpointId: "early",
            xpOptional: true,
            ...(objectiveKind === "interaction" ? { fundingGroundPickup: ground } : {}),
          }
        : action,
    );
    const early = mapped.flatMap((action) =>
      objectiveKind === "interaction" &&
      action.libraryQuestId === 701 &&
      action.questChanges[0].state === "accepted"
        ? [
            action,
            {
              ...action,
              id: "shared-objective",
              questChanges: [
                { ...action.questChanges[0], state: "objectives-complete", objectiveIndex: 1 },
              ],
            },
          ]
        : [action],
    );
    const later = early
      .filter((action) => action.libraryQuestId === 701)
      .map((action) => ({
        ...action,
        id: `later-${action.id}`,
        fundingCheckpointId: "later",
      }));
    const requested = [...early, ...later];
    const artifact = compileCampaignAddon(plan, requested, options);
    verifyCampaignAddonReview(plan, requested, artifact, options);
    const dropped = structuredClone(artifact);
    const ids = new Set(later.map((action) => action.id));
    for (const guide of dropped.guides) {
      guide.actionIds = guide.actionIds.filter((id) => !ids.has(id));
      guide.normalizations.push(
        ...later.map((action) => ({
          actionId: action.id,
          reason: "duplicate-one-time-quest-phase",
          removedQuestChanges: action.questChanges,
        })),
      );
    }
    for (const document of dropped.documents)
      document.actionIds = document.actionIds.filter((id) => !ids.has(id));
    assert.throws(
      () => verifyCampaignAddonReview(plan, requested, dropped, options),
      /optional quest opportunity lost a required phase/,
    );

    const unguarded = structuredClone(artifact);
    for (const document of unguarded.documents)
      document.content = document.content.replaceAll("    .isQuestAvailable 701\n", "");
    assert.throws(
      () => verifyCampaignAddonReview(plan, requested, unguarded, options),
      /quest-status guard/,
    );
  });
}

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
