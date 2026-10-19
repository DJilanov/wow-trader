import { describe, expect, it } from "vitest";
import {
  DUNGEON_RELEASE,
  WESTFALL_ROUTE,
  createCharacterProfile,
  emptyDungeonPlan,
  emptyPremadeProgress,
  advancePremadeStage,
  emptyCampaignProgress,
  getDungeonBundle,
  updateDungeonBundleSlot,
  updatePremadeDungeonBundle,
  recordPremadeMemberIdentity,
} from "@wow-trader/leveling";
import {
  WESTFALL_CHAPTER_ID,
  emptyLevelingWorkspace,
  readLevelingWorkspace,
  serializeLevelingWorkspace,
  updateCharacterSession,
  updatePersonalDungeonPlan,
  updateStepProgress,
} from "./leveling-experience";
import { exportLevelingBackup, readLevelingBackup } from "./leveling-backup";

describe("premade party persistence", () => {
  it("preserves guaranteed bundle levels, exclusions and slot choices through workspace backup", () => {
    let workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "bundle-party",
      createCharacterProfile(),
    );
    const bundle = updateDungeonBundleSlot(
      { ...getDungeonBundle("alcaz", "alliance")!, included: false, planningQuestLevel: 33 },
      2,
      { selected: false },
    );
    const premade = recordPremadeMemberIdentity(
      updatePremadeDungeonBundle(emptyPremadeProgress(), bundle),
      1,
      { raceId: "gnome", classSlug: "priest" },
    );
    premade.members[0]!.questStates["92456"] = "rewarded";
    premade.stages["dalaran-clear"] = true;
    workspace = updatePersonalDungeonPlan(workspace, "bundle-party", (plan) => ({
      ...plan,
      premade,
    }));
    const restored = readLevelingBackup(exportLevelingBackup(workspace)).sessions[0]!.dungeonPlans[
      DUNGEON_RELEASE
    ]!.premade!;
    const saved = getDungeonBundle("alcaz", "alliance", restored.guaranteedBundles)!;
    expect(saved.included).toBe(false);
    expect(saved.planningQuestLevel).toBe(33);
    expect(saved.slots[1]!.selected).toBe(false);
    expect(restored.members[0]!.questStates["92456"]).toBe("rewarded");
    expect(restored.stages["dalaran-clear"]).toBe(true);
    expect(restored.members[1]).toMatchObject({ raceId: "gnome", classSlug: "priest" });
  });
  it("saves the continuous campaign alongside the old circuit without overwriting chapter progress", () => {
    let workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "campaign",
      createCharacterProfile(),
    );
    workspace = updateStepProgress(
      workspace,
      "campaign",
      WESTFALL_CHAPTER_ID,
      WESTFALL_ROUTE.steps[0]!.id,
      "done",
    );
    const oldProgress = workspace.sessions[0]!.progress;
    const premade = {
      ...emptyPremadeProgress(),
      selectedStopId: "deadmines" as const,
      campaigns: {
        "campaign-test-human": {
          ...emptyCampaignProgress(),
          selectedActionId: "duskwood-watch-source-step-0051",
          completion: { "start-115-brief": "done" as const },
        },
      },
    };
    workspace = updatePersonalDungeonPlan(workspace, "campaign", (plan) => ({ ...plan, premade }));
    const backup = readLevelingBackup(exportLevelingBackup(workspace));
    expect(
      backup.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]?.premade?.campaigns["campaign-test-human"]
        ?.selectedActionId,
    ).toBe("duskwood-watch-source-step-0051");
    expect(backup.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]?.premade?.selectedStopId).toBe(
      "deadmines",
    );
    expect(backup.sessions[0]!.progress).toEqual(oldProgress);
  });
  it("retains the exact stop/stage and original chapter progress across reload and backup", () => {
    let workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "party",
      createCharacterProfile(),
    );
    workspace = updateStepProgress(
      workspace,
      "party",
      WESTFALL_CHAPTER_ID,
      WESTFALL_ROUTE.steps[0]!.id,
      "done",
    );
    const original = workspace.sessions[0]!;
    const premade = advancePremadeStage(
      { ...emptyPremadeProgress(), selectedStopId: "deadmines" },
      true,
    );
    workspace = updatePersonalDungeonPlan(workspace, "party", (plan) => ({ ...plan, premade }));
    const restored = readLevelingWorkspace(serializeLevelingWorkspace(workspace));
    expect(restored).toEqual(workspace);
    expect(restored?.sessions[0]?.dungeonPlans[DUNGEON_RELEASE]?.premade?.selectedStage).toBe(
      "clear",
    );
    expect(restored?.sessions[0]?.progress).toEqual(original.progress);
    expect(restored?.sessions[0]?.lastChapterId).toBe(original.lastChapterId);
    expect(readLevelingBackup(exportLevelingBackup(workspace))).toEqual(workspace);
  });

  it("accepts old saves without party progress and rejects malformed new party data", () => {
    const workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "party",
      createCharacterProfile(),
    );
    const { premade: _premade, ...legacyPlan } = emptyDungeonPlan();
    const legacy = {
      ...workspace,
      sessions: [{ ...workspace.sessions[0]!, dungeonPlans: { [DUNGEON_RELEASE]: legacyPlan } }],
    };
    expect(
      readLevelingWorkspace(JSON.stringify(legacy))?.sessions[0]?.dungeonPlans[DUNGEON_RELEASE]
        ?.premade,
    ).toBeNull();
    const corrupt = {
      ...legacy,
      sessions: [
        {
          ...legacy.sessions[0]!,
          dungeonPlans: {
            [DUNGEON_RELEASE]: {
              ...legacyPlan,
              premade: { ...emptyPremadeProgress(), selectedStopId: "unknown" },
            },
          },
        },
      ],
    };
    expect(readLevelingWorkspace(JSON.stringify(corrupt))).toBeNull();
  });
});
