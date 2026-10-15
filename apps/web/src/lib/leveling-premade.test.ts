import { describe, expect, it } from "vitest";
import {
  DUNGEON_RELEASE,
  WESTFALL_ROUTE,
  createCharacterProfile,
  emptyDungeonPlan,
  emptyPremadeProgress,
  advancePremadeStage,
  emptyCampaignProgress,
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
