import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import saved from "./fixtures/hunter-marksmanship-state-controls.json";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import {
  appendHunterMarksmanshipSimulatorDelivery,
  hunterMarksmanshipDeliveryDefinition as definition,
  readHunterMarksmanshipSimulatorDelivery,
} from "./forever-simulator-hunter-marksmanship-reviews";
import { createPracticalSimulatorDeliveryReader } from "./forever-simulator-practical-reviews";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function objectAt(root: unknown, ...path: readonly (string | number)[]): Record<string, unknown> {
  let value = root;
  for (const part of path) {
    if (typeof part === "number" && Array.isArray(value)) value = value[part];
    else if (typeof part === "string" && isObject(value)) value = value[part];
    else throw new Error("Missing fixture node: " + path.join("/"));
  }
  if (!isObject(value)) throw new Error("Fixture node is not an object: " + path.join("/"));
  return value;
}

describe("genuine Marksmanship state adapter controls, not an approved build", () => {
  it("retains the original failed1% result and authentic source references without inventing approval", () => {
    expect(saved.schema).toBe("kfc-hunter-marksmanship-state-adapter-fixture.v1");
    expect(hash(saved)).toBe("c708c154466d57fc07d878ec85b259a2774807d8f323035c6db105796e11db27");
    expect(saved.publicationAllowed).toBe(false);
    expect(saved.confirmation.accepted).toBe(false);
    expect(saved.confirmation.maximumRetainedGapFraction).toBe(0.01);
    expect(saved.confirmation.largestConservativeRetainedGapFraction).toBe(0.010163824207106717);
    expect(saved.confirmation.selectedDps).toBe(849.0660376744213);
    expect(saved.confirmation.selectedIterations).toBe(40000);
    expect(saved.confirmation.selectionChanged).toBe(false);
    const documents: Readonly<Record<string, unknown>> = saved.documents;
    const raw = documents[saved.source.result.path];
    expect(hash(raw)).toBe(saved.source.result.sha256);
    expect(objectAt(raw, "semantic", "evaluation")).toEqual(saved.confirmation);
    expect(saved.arms).toHaveLength(11);
    expect(saved.arms[0]?.settings).toEqual(saved.confirmation.selected);
  });

  it("accepts every genuine class2 MM arm, pet policy and exact action-bound guide without changing the fixture", () => {
    const before = hash(saved);
    for (const arm of saved.arms) {
      expect(() => definition.validateArm(arm.state, arm.settings.player)).not.toThrow();
      expect(() => definition.validateGuidance(arm.guidance, arm.settings.player)).not.toThrow();
      expect(definition.scenarioHash(arm.settings)).toBe(saved.scenarioSha256);
      expect(arm.inspected.iterations).toBe(10000);
      expect(arm.guidance.rotationSha256).toBe(hash(arm.settings.player.rotation));
      expect(arm.guidance.priorityBindings).toHaveLength(
        arm.settings.player.rotation.priorityList.length,
      );
      for (const [index, entry] of arm.guidance.priorityBindings.entries()) {
        expect(entry.index).toBe(index);
        expect(entry.actionSha256).toBe(hash(arm.settings.player.rotation.priorityList[index]));
        expect(entry.text).toBe(arm.guidance.priorities[index]);
      }
    }
    expect(hash(saved)).toBe(before);
  });

  it("covers real no-pet, all five offensive families and genuine Hawk/Lone-Wolf alternatives", () => {
    const pets = new Set(saved.arms.map((arm) => arm.state.petType));
    expect([...pets].sort()).toEqual(
      ["PetNone", "Cat", "Raptor", "WindSerpent", "CarrionBird", "Scorpid"].sort(),
    );
    expect(saved.arms.some((arm) => arm.name === "family-summonhawk")).toBe(true);
    expect(saved.arms.some((arm) => arm.name === "family-lonewolf")).toBe(true);
    const noPet = saved.arms.find((arm) => arm.state.petType === "PetNone");
    expect(noPet?.guidance.petInstruction).toContain("no permanent pet");
    const selected = saved.arms[0];
    expect(selected?.name).toBe("selected");
    expect(selected?.guidance.talents).toBe("7/40/4");
    expect(selected?.guidance.petType).toBe("Cat");
    expect(selected?.guidance.priorities).toHaveLength(5);
    expect(selected?.guidance.priorities.join(" ")).toContain("Sniper Shot");
    expect(selected?.guidance.priorities.join(" ")).toContain("30%");
    expect(selected?.guidance.prepull).toHaveLength(1);
  });

  it("rejects foreign classes/spec allocations, mismatched state, unmodeled pets, invalid ammo/speed and malformed17-slot equipment", () => {
    const original = saved.arms[0];
    if (!original) throw new Error("Missing selected genuine fixture control");
    const mutations: readonly ((arm: Record<string, unknown>) => void)[] = [
      (arm) => {
        objectAt(arm, "settings", "player").class = "ClassRogue";
      },
      (arm) => {
        objectAt(arm, "settings", "player").level = 59;
      },
      (arm) => {
        objectAt(arm, "settings", "player").talentsString = "5320001505101251-00522510005";
      },
      (arm) => {
        objectAt(arm, "state").talentsString = "5-0050552011523051-50005001";
      },
      (arm) => {
        objectAt(arm, "state").petType = "Raptor";
      },
      (arm) => {
        objectAt(arm, "settings", "player", "hunter", "options").petType = "Bat";
      },
      (arm) => {
        objectAt(arm, "settings", "player", "hunter", "options").ammo = "Invented";
      },
      (arm) => {
        objectAt(arm, "settings", "player", "hunter", "options").petUptime = 0.5;
      },
      (arm) => {
        objectAt(arm, "settings", "player", "hunter", "options").petAttackSpeed = "Two";
      },
      (arm) => {
        objectAt(arm, "settings", "player", "equipment").items = [];
      },
      (arm) => {
        objectAt(arm, "state", "rotationPolicy").sniperMana = 99;
      },
      (arm) => {
        objectAt(arm, "state", "rotationPolicy").sniper = "invented";
      },
    ];
    for (const mutate of mutations) {
      const arm = structuredClone(original);
      mutate(arm);
      expect(() => definition.validateArm(arm.state, arm.settings.player)).toThrow();
    }
  });

  it("rejects wrong pet/talents, omitted prepull, changed prepull action binding and missing pet instruction", () => {
    const original = saved.arms[0];
    if (!original) throw new Error("Missing selected genuine fixture control");
    const mutations: readonly ((guide: Record<string, unknown>) => void)[] = [
      (guide) => {
        guide.petType = "Raptor";
      },
      (guide) => {
        guide.talents = "31/20/0";
      },
      (guide) => {
        guide.prepull = [];
      },
      (guide) => {
        objectAt(guide, "prepullBindings", 0).actionSha256 = "0".repeat(64);
      },
      (guide) => {
        guide.petInstruction = "Use any pet you want.";
      },
      (guide) => {
        guide.instruction = "Ignore the selected pet.";
      },
    ];
    for (const mutate of mutations) {
      const guide = structuredClone(original.guidance);
      mutate(guide);
      expect(() => definition.validateGuidance(guide, original.settings.player)).toThrow();
    }
  });

  it("retains a fixed encounter/race/profession fingerprint while allowing genuine gear/talent/pet/APL arms", () => {
    const selected = saved.arms[0];
    if (!selected) throw new Error("Missing selected genuine fixture control");
    for (const mutate of [
      (settings: Record<string, unknown>): void => {
        objectAt(settings, "player").race = "RaceOrc";
      },
      (settings: Record<string, unknown>): void => {
        objectAt(settings, "player").profession2 = "Blacksmithing";
      },
      (settings: Record<string, unknown>): void => {
        objectAt(settings, "encounter").duration = 120;
      },
    ]) {
      const settings = structuredClone(selected.settings);
      mutate(settings);
      expect(definition.scenarioHash(settings)).not.toBe(saved.scenarioSha256);
    }
  });

  it("never treats a genuine completed numeric result as a reviewed share or silently changes current presets", async () => {
    const reads: string[] = [];
    const documents: Readonly<Record<string, unknown>> = saved.documents;
    const options: Parameters<typeof readHunterMarksmanshipSimulatorDelivery>[1] = {
      campaignIdentity: "0".repeat(64),
      sourceRelease: saved.sourceRelease,
      revision: saved.revision,
      databaseSha256: async (): Promise<string> => saved.databaseSha256,
      read: async (path): Promise<unknown> => {
        reads.push(path);
        if (!Object.hasOwn(documents, path))
          throw Object.assign(new Error("No reviewed pointer"), { code: "ENOENT" });
        return documents[path];
      },
      reference: async (ref): Promise<unknown> => {
        reads.push(ref.path);
        return documents[ref.path];
      },
    };
    await expect(
      readHunterMarksmanshipSimulatorDelivery(saved.source.result, options),
    ).rejects.toThrow(/kfc-local-hunter-marksmanship-first-pass-share\.v1/);
    const cases: readonly LocalSimulatorBuildReview[] = [];
    expect(await appendHunterMarksmanshipSimulatorDelivery({ ...options, cases })).toBe(cases);
    expect(reads).toEqual([
      saved.source.result.path,
      "hunter-marksmanship-first-pass-delivery.json",
    ]);
  });

  it("rejects a foreign class registration before reading any source", () => {
    expect(() => createPracticalSimulatorDeliveryReader({ ...definition, playerClass: 6 })).toThrow(
      /profile\/protobuf class mismatch/,
    );
  });
});
