import { describe, expect, it } from "vitest";
import type { CampaignAction } from "./campaign.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter, type ImportedDirective } from "./guide-archive.js";
import { capturedSourceNpcHandoffWait, isCapturedSourceNpcTimer } from "./campaign-source-npc-timers.js";

const parentId = 350001, childId = 350002;
interface Fixture {
  action: CampaignAction;
  directives: ImportedDirective[];
  catalog: Map<number, QuestCatalogEntry>;
}

function fixture(timer = "20,Archive RP"): Fixture {
  const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
  const guide = parseGuideChapter([
    "step", ".goto Elwynn Forest,50,50", ">>Talk to Archivist",
    `.turnin ${parentId}`, `.timer ${timer}`, `.accept ${childId}`, ".target Archivist",
  ].join("\n"), reference.id, "f".repeat(64), 70205);
  const step = guide.steps[0]!, directives = [...step.directives];
  const npc = { npcId: 235, name: "Archivist", friendlyToAlliance: true,
    positions: [{ zone: "1429", x: 50, y: 50 }] };
  const parent: QuestCatalogEntry = {
    questId: parentId, title: "First report", minimumLevel: 1, questLevel: 3,
    requiredRaces: 0, requiredClasses: 0, starts: [npc], ends: [npc],
    prerequisites: { allOf: [], anyOf: [] }, exclusiveWith: [], category: "delivery",
    objectives: [], unsupportedRequirements: [],
  };
  const child: QuestCatalogEntry = { ...parent, questId: childId, title: "Next report",
    prerequisites: { allOf: [parentId], anyOf: [] } };
  const action: CampaignAction = {
    id: "return-report", legId: "prepare", title: "Turn in First report", instructions: [],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
    positions: directives.flatMap((row) => row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : []),
    kind: "quests", leaderOnly: false, targetLevel: null, targetStopId: null, raidOnly: false,
    questChanges: [{ questId: parentId, title: parent.title, state: "rewarded", objectiveIndex: null }],
  };
  return { action, directives, catalog: new Map([[parentId, parent], [childId, child]]) };
}
function matches(input: Fixture): boolean {
  return isCapturedSourceNpcTimer(input.action, input.directives.find((row) => row.tag === ".timer")!,
    input.directives, input.catalog);
}

const invalidSources: { name: string; change: (input: Fixture) => void }[] = [
  { name: "missing parent", change: (input) => { input.catalog.delete(parentId); } },
  { name: "missing child", change: (input) => { input.catalog.delete(childId); } },
  { name: "unrelated next quest", change: (input) => { input.catalog.set(childId,
    { ...input.catalog.get(childId)!, prerequisites: { allOf: [], anyOf: [] } }); } },
  { name: "different NPC", change: (input) => { const child = input.catalog.get(childId)!;
    input.catalog.set(childId, { ...child, starts: child.starts.map((npc) => ({ ...npc, npcId: 236 })) }); } },
  { name: "unfriendly NPC", change: (input) => { const child = input.catalog.get(childId)!;
    input.catalog.set(childId, { ...child, starts: child.starts.map((npc) => ({ ...npc, friendlyToAlliance: false })) }); } },
  { name: "wrong source target", change: (input) => { input.directives = input.directives.map((row) =>
    row.tag === ".target" ? { ...row, arguments: "Someone Else" } : row); } },
  { name: "two source targets", change: (input) => { input.directives.push({
    ...input.directives.find((row) => row.tag === ".target")!, arguments: "Someone Else" }); } },
  { name: "no captured position", change: (input) => { input.directives = input.directives.filter((row) => !row.position); } },
  { name: "NPC in a different zone", change: (input) => { const child = input.catalog.get(childId)!;
    input.catalog.set(childId, { ...child, starts: child.starts.map((npc) => ({ ...npc,
      positions: [{ zone: "1434", x: 50, y: 50 }] })) }); } },
  { name: "two timers", change: (input) => { input.directives.push({
    ...input.directives.find((row) => row.tag === ".timer")! }); } },
  { name: "two returns", change: (input) => { input.directives.push({
    ...input.directives.find((row) => row.tag === ".turnin")! }); } },
  { name: "two pickups", change: (input) => { input.directives.push({
    ...input.directives.find((row) => row.tag === ".accept")! }); } },
  { name: "wait before return", change: (input) => { const timer = input.directives.find((row) => row.tag === ".timer")!;
    input.directives = [timer, ...input.directives.filter((row) => row !== timer)]; } },
  { name: "wait after pickup", change: (input) => { const timer = input.directives.find((row) => row.tag === ".timer")!;
    input.directives = [...input.directives.filter((row) => row !== timer), timer]; } },
];

describe("captured NPC handoff timers", () => {
  it.each([1, 6, 20, 300])("qualifies a bound %i-second wait", (seconds) => {
    const input = fixture(`${seconds},Archive RP`), before = structuredClone(input);
    expect(capturedSourceNpcHandoffWait(input.directives, input.catalog)).toEqual({
      parentId, childId, npcId: 235, npcName: "Archivist", seconds,
    });
    expect(matches(input)).toBe(true);
    expect(input).toEqual(before);
  });
  it.each(["0", "-1", "301", "1.5", "Infinity", "10000", "wait", "20,first\nsecond"])(
    "rejects an invalid source duration: %s", (value) => {
      const input = fixture();
      input.directives = input.directives.map((row) => row.tag === ".timer" ? { ...row, arguments: value } : row);
      expect(capturedSourceNpcHandoffWait(input.directives, input.catalog)).toBeNull();
      expect(matches(input)).toBe(false);
    },
  );
  it.each(invalidSources)("rejects $name", ({ change }) => {
    const input = fixture(); change(input);
    expect(capturedSourceNpcHandoffWait(input.directives, input.catalog)).toBeNull();
    expect(matches(input)).toBe(false);
  });
  it("binds the same wait to the dependent pickup", () => {
    const input = fixture();
    input.action = { ...input.action, questChanges: [{ questId: childId,
      title: "Next report", state: "accepted", objectiveIndex: null }] };
    expect(matches(input)).toBe(true);
  });
  it.each(["not-captured", "wrong-quest", "wrong-phase", "mixed-phases", "missing-position", "different-position"])(
    "rejects an unbound action: %s", (mode) => {
      const input = fixture(), change = input.action.questChanges[0]!;
      if (mode === "not-captured") input.action = { ...input.action, source: null };
      if (mode === "wrong-quest") input.action = { ...input.action, questChanges: [{ ...change, questId: childId }] };
      if (mode === "wrong-phase") input.action = { ...input.action,
        questChanges: [{ ...change, state: "objectives-complete", objectiveIndex: 1 }] };
      if (mode === "mixed-phases") input.action = { ...input.action, questChanges: [change, change] };
      if (mode === "missing-position") input.action = { ...input.action, positions: [] };
      if (mode === "different-position") input.action = { ...input.action,
        positions: input.action.positions.map((row) => ({ ...row, position: { ...row.position, x: 51 } })) };
      expect(capturedSourceNpcHandoffWait(input.directives, input.catalog)).not.toBeNull();
      expect(matches(input)).toBe(false);
    },
  );
  it("rejects a timer directive copied from a different source object", () => {
    const input = fixture(), timer = input.directives.find((row) => row.tag === ".timer")!;
    expect(isCapturedSourceNpcTimer(input.action, { ...timer }, input.directives, input.catalog)).toBe(false);
  });
});
