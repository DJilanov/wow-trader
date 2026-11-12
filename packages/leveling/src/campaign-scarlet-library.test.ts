import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { stageEarlyScarletLibrary } from "./campaign-scarlet-library.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import fixture from "./fixtures/scarlet-library-70205.json" with { type: "json" };

function action(id: string, legId: string, questId?: number, state: CampaignQuestChange["state"] = "accepted"): CampaignAction {
  return { id, legId, title: id, instructions: [], kind: questId ? "quests" : "instructions", source: null,
    positions: [], leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    questChanges: questId ? [{ questId, state, title: `Quest ${questId}`, objectiveIndex: state === "objectives-complete" ? 1 : null }] : [] };
}
function control(): CampaignPlan {
  const work: CampaignAction = { ...action("dungeon-scarlet-monastery-objectives-complete-1053", "scarlet", 1053, "objectives-complete"),
    wholeQuestObjectives: true, questChanges: [4, 3, 1, 2].map((objectiveIndex) => ({ questId: 1053, state: "objectives-complete", title: "In the Name of the Light", objectiveIndex })) };
  const actions = [
    { ...action("anton-followup", "desolace", 1052), location: { zone: "1443" } },
    { ...action("stv-tasks", "stv"), location: { zone: "1434" } },
    { ...action("drowned-departure", "stv"), kind: "xp-check" as const, targetLevel: 37, targetStopId: "drowned-city" as const,
      positions: [{ sourceLine: 0, position: { zone: "1434", x: -54.59, y: -11628.54, floor: 0, space: "world" as const } }] },
    action("drowned-entry", "drowned"),
    action("letter-return", "northern", 1052, "rewarded"), action("light-pickup", "northern", 1053),
    action("titan-pickup", "northern", 1050), action("past-due-pickup", "northern", 96800),
    action("dungeon-scarlet-monastery-brief", "scarlet"),
    { ...action("dungeon-scarlet-monastery-entry", "scarlet"), kind: "checkpoint" as const, targetStopId: "scarlet-monastery" as const },
    work, action("titan-book", "scarlet", 1050, "objectives-complete"), action("runemaster-book", "scarlet", 96800, "objectives-complete"),
    action("light-return", "scarlet", 1053, "rewarded"), action("titan-return", "scarlet", 1050, "rewarded"),
    action("past-due-return", "scarlet", 96800, "rewarded"), action("dungeon-scarlet-monastery-deliveries", "scarlet"),
  ];
  return { release: "scarlet-library-routing-unit-test", race: "human", leaderClass: "warrior", sharedQuestsOnly: true,
    targetBuild: 70205, sourceArchiveSha256: fixture.sourceArchiveSha256, actions,
    legs: ["desolace", "stv", "drowned", "northern", "scarlet"].map((id) => ({ id, title: id,
      kind: id === "stv" ? "xp-bridge" : ["drowned", "scarlet"].includes(id) ? "dungeon" : "preparation",
      from: 34, to: 38, stopId: id === "scarlet" ? "scarlet-monastery" : null,
      actionIds: actions.filter((row) => row.legId === id).map((row) => row.id), questIds: [], unresolvedQuestIds: [] })) };
}

describe("the early Scarlet Library itinerary", () => {
  it("moves existing books and the Southshore handoff after STV, preserving the input and all quest phases", () => {
    const input = control(), original = structuredClone(input), data = combatDatasetSchema.parse(fixture.combat), catalog = questCatalogSchema.parse(fixture.catalog);
    const result = stageEarlyScarletLibrary(input, catalog, data), ids = result.actions.map((row) => row.id);
    expect(result).not.toBe(input);
    expect(ids.indexOf("stv-tasks")).toBeLessThan(ids.indexOf("titan-pickup"));
    expect(ids.indexOf("letter-return")).toBeLessThan(ids.indexOf("light-pickup"));
    expect(ids.indexOf("light-pickup")).toBeLessThan(ids.indexOf("early-scarlet-library-loksey"));
    expect(ids.indexOf("past-due-return")).toBeLessThan(ids.indexOf("drowned-departure"));
    expect(ids.indexOf("drowned-departure")).toBeLessThan(ids.indexOf("drowned-entry"));
    const phases = result.actions.flatMap((row) => row.questChanges);
    for (const questId of [1050, 96800, 1053]) for (const state of ["accepted", "rewarded"])
      expect(phases.filter((change) => change.questId === questId && change.state === state)).toHaveLength(1);
    expect(input).toEqual(original);
    expect(stageEarlyScarletLibrary(result, catalog, data)).toBe(result);
  });

  it("counts Loksey once and keeps the other three counters and full hand-in requirements", () => {
    const data = combatDatasetSchema.parse(fixture.combat), result = stageEarlyScarletLibrary(control(), questCatalogSchema.parse(fixture.catalog), data);
    expect(result.actions.find((row) => row.id === "early-scarlet-library-loksey")?.questChanges.map((change) => change.objectiveIndex)).toEqual([4]);
    const later = result.actions.find((row) => row.id === "dungeon-scarlet-monastery-objectives-complete-1053")!;
    expect(later.questChanges.map((change) => change.objectiveIndex)).toEqual([3, 1, 2]);
    expect(later.wholeQuestObjectives).toBeUndefined();
    expect(later.combatObjectiveScope).toBe("listed");
    expect(expandCampaignDungeonObjectives(result, data).actions.find((row) => row.id === later.id)?.questChanges).toEqual(later.questChanges);
    expect(result.actions.find((row) => row.id === "dungeon-scarlet-monastery-brief")?.instructions.join(" ")).toContain("no Library return");
    expect(result.actions.find((row) => row.id === "early-scarlet-library-entry")?.targetLevel).toBe(34);
    expect(result.actions.find((row) => row.id === "dungeon-scarlet-monastery-entry")?.targetStopId).toBe("scarlet-monastery");
  });

  it("leaves a fundable outdoor preparation gate after the book rewards", () => {
    const result = stageEarlyScarletLibrary(control(), questCatalogSchema.parse(fixture.catalog), combatDatasetSchema.parse(fixture.combat));
    const gate = result.actions.find((row) => row.id === "drowned-departure")!;
    expect(result.legs.find((leg) => leg.id === gate.legId)?.kind).toBe("preparation");
    expect(gate.targetStopId).toBe("drowned-city");
    expect(result.actions.find((row) => row.id === "early-scarlet-library-travel-6")?.positions).toEqual(gate.positions);
    expect(new Set(result.actions.map((row) => row.id)).size).toBe(result.actions.length);
    expect(result.legs.flatMap((leg) => leg.actionIds)).toEqual(result.actions.map((row) => row.id));
  });

  it.each(["missing letter", "missing counter", "class restriction", "unknown boss level"])("holds an unverified program: %s", (kind) => {
    const input = control(), catalog = questCatalogSchema.parse(fixture.catalog), data = combatDatasetSchema.parse(fixture.combat);
    const changed = kind === "missing letter" ? { ...input, actions: input.actions.filter((row) => row.id !== "anton-followup") }
      : kind === "missing counter" ? { ...input, actions: input.actions.map((row) => row.wholeQuestObjectives
        ? { ...row, questChanges: row.questChanges.filter((change) => change.objectiveIndex !== 4) } : row) } : input;
    if (kind === "class restriction") catalog.quests.find((quest) => quest.questId === 1050)!.requiredClasses = 1;
    if (kind === "unknown boss level") data.npcs.find((npc) => npc.id === 6487)!.maximumLevel = null;
    expect(stageEarlyScarletLibrary(changed, catalog, data)).toBe(changed);
  });
});
