import { createHash } from "node:crypto";
import { z } from "zod";
import {
  createPracticalSimulatorDeliveryReader,
  type PracticalSimulatorDeliveryDefinition,
} from "./forever-simulator-practical-reviews";

const record = z.record(z.string(), z.unknown());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const petType = z.enum(["Cat", "Raptor", "WindSerpent", "CarrionBird", "Scorpid"]);
const petNames: Readonly<Record<z.infer<typeof petType>, string>> = {
  Cat: "Cat",
  Raptor: "Raptor",
  WindSerpent: "Wind Serpent",
  CarrionBird: "Carrion Bird",
  Scorpid: "Scorpid",
};
const optionsSchema = z
  .object({
    ammo: z.enum(["ThoriumHeadedArrow", "ThoriumShells"]),
    quiverBonus: z.literal("Speed15"),
    petType,
    petUptime: z.literal(1),
    petAttackSpeed: z.literal("OneTwo"),
  })
  .strict();
const playerSchema = z
  .object({
    class: z.literal("ClassHunter"),
    level: z.literal(60),
    talentsString: z.string().regex(/^[0-5]+(?:-[0-5]*){0,2}$/),
    hunter: z.object({ options: optionsSchema }).passthrough(),
    equipment: z
      .object({
        items: z
          .array(
            z
              .object({
                id: z.number().int().nonnegative().optional(),
                enchant: z.number().int().nonnegative().optional(),
              })
              .strict(),
          )
          .length(17),
      })
      .strict(),
    rotation: z
      .object({ priorityList: z.array(record).min(1), prepullActions: z.array(record).optional() })
      .passthrough(),
  })
  .passthrough();
const stateSchema = z
  .object({
    talentsString: z.string().min(1),
    petType,
    rotationPolicy: z
      .object({
        name: z.string().min(1),
        hawk: z.enum(["maintain", "cooldown"]),
        sting: z.boolean(),
        shot: z.enum(["aimed", "multi"]).nullable(),
        arcaneMana: z.union([z.literal(15), z.literal(40)]).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const binding = z
  .object({ index: z.number().int().nonnegative(), actionSha256: digest, text: z.string().min(1) })
  .strict();
const guideSchema = z
  .object({
    schema: z.literal("kfc-hunter-beast-mastery-rotation-guidance.v1"),
    rotationSha256: digest,
    talents: z.string().min(1),
    petType,
    prepull: z.array(z.string().min(1)).max(8),
    prepullBindings: z.array(binding).max(8),
    petInstruction: z.string().min(1),
    scenario: z.string().min(1),
    instruction: z.string().min(1),
    priorities: z.array(z.string().min(1)).min(1).max(32),
    priorityBindings: z.array(binding).min(1).max(32),
    caveats: z.array(z.string().min(1)).min(1).max(20),
  })
  .strict();
const scopeSchema = z
  .object({
    name: z.literal("bounded-hunter-beast-mastery-practical-first-pass.v1"),
    gearSearchStatus: z.enum([
      "single-correction-small-gain-stop-needs-confirmation",
      "single-correction-cap-needs-confirmation",
    ]),
    initialGearSweeps: z.literal(2),
    correctionGearSweeps: z.literal(1),
    gearGloballyConverged: z.literal(false),
    selectedStateChanged: z.literal(true),
    selectedStateFrozenThroughCorrection: z.literal(true),
    materialStateRecheckGainFraction: z.number().finite().gte(0.01),
    independentIncumbentMeasurement: z.literal(true),
    iterationsPerRange: z.literal(20000),
    ranges: z.literal(2),
    strictRetainedDominancePassed: z.boolean(),
    largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
    maximumRetainedGapFraction: z.literal(0.01),
    globalOptimalityProven: z.literal(false),
    deeperOptimizationDeferred: z.literal(true),
  })
  .strict();
const enchantSchema = z
  .object({
    gearIndex: z.number().int().min(0).max(16),
    itemId: z.number().int().positive(),
    effectId: z.number().int().positive(),
    key: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["static", "scripted"]),
  })
  .strict();

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function allocation(talentsString: string): string {
  const trees = talentsString.split("-");
  const points = Array.from({ length: 3 }, (_, index): number =>
    [...(trees[index] ?? "")].reduce((sum, value) => sum + Number(value), 0),
  );
  requireMatch(
    points.reduce((sum, value) => sum + value, 0) === 51 && (points[0] ?? 0) >= 31,
    "Hunter Beast Mastery talent allocation changed",
  );
  return points.join("/");
}

export const hunterBeastMasteryDeliveryDefinition: PracticalSimulatorDeliveryDefinition = {
  profile: "hunter",
  variant: "beast_mastery",
  playerClass: 2,
  playerClassName: "ClassHunter",
  allowedEmptySlots: [15],
  caseId: "hunter-beast-mastery-static",
  scenario: "beast-mastery-static",
  displayName: "Beast Mastery · first-pass tested",
  sourceRole: "hunter-beast-mastery-first-pass-corrected-gear",
  sourceEvidence: "gear",
  scopeName: "bounded-hunter-beast-mastery-practical-first-pass.v1",
  pointerFile: "hunter-beast-mastery-first-pass-delivery.json",
  checkedClassKey: "actualHunterClass",
  checkedStateKey: "talentsRotationPetAndAmmo",
  schemas: {
    guidance: "kfc-hunter-beast-mastery-rotation-guidance.v1",
    declaration: "kfc-hunter-beast-mastery-practical-confirmation-declaration.v1",
    model: "kfc-hunter-beast-mastery-practical-confirmation-model.v1",
    share: "kfc-local-hunter-beast-mastery-first-pass-share.v1",
    build: "kfc-hunter-beast-mastery-first-pass-build.v1",
    parityReview: "kfc-practical-hunter-selected-parity-review.v1",
    parityControl: "kfc-hunter-selected-wasm-control.v1",
    paritySummary: "kfc-hunter-selected-native-wasm-parity.v1",
    pointer: "kfc-local-hunter-beast-mastery-first-pass-delivery.v1",
  },
  scenarioHash(settings: Record<string, unknown>): string {
    const value = structuredClone(settings),
      player = record.parse(value.player),
      consumes = record.parse(player.consumes),
      hunter = record.parse(player.hunter),
      options = record.parse(hunter.options);
    requireMatch(player.class === "ClassHunter", "Hunter scenario has another class");
    player.equipment = {};
    player.talentsString = "";
    player.rotation = {};
    delete consumes.mainHandImbue;
    delete consumes.offHandImbue;
    delete options.petType;
    delete options.ammo;
    hunter.options = options;
    player.hunter = hunter;
    player.consumes = consumes;
    value.player = player;
    return hash(value);
  },
  validateBuild(build): void {
    scopeSchema.parse(build.scope);
    requireMatch(build.style === "ranged", "Hunter build style changed");
    const player = playerSchema.parse(build.settings.player);
    allocation(player.talentsString);
    const choices = z.array(enchantSchema).max(17).parse(build.enchants),
      slots = player.equipment.items.flatMap((item, index) => (item.enchant ? [index] : []));
    requireMatch(
      choices.length === slots.length &&
        new Set(choices.map((entry) => entry.gearIndex)).size === slots.length,
      "Hunter enchant coverage changed",
    );
    for (const choice of choices) {
      const item = player.equipment.items[choice.gearIndex];
      requireMatch(
        item?.id === choice.itemId &&
          item.enchant === choice.effectId &&
          choice.key.startsWith(choice.effectId + ":"),
        "Hunter enchant binding changed",
      );
    }
  },
  validateSelectedState(build, rawState): void {
    const state = stateSchema.parse(rawState),
      player = playerSchema.parse(build.settings.player);
    requireMatch(
      state.talentsString === player.talentsString &&
        state.petType === player.hunter.options.petType,
      "Hunter selected talents/pet changed",
    );
  },
  validateArm(rawState, rawPlayer): void {
    const state = stateSchema.parse(rawState),
      player = playerSchema.parse(rawPlayer);
    allocation(player.talentsString);
    requireMatch(
      state.talentsString === player.talentsString &&
        state.petType === player.hunter.options.petType,
      "Hunter arm pet/options changed",
    );
  },
  validateGuidance(rawGuide, rawPlayer): void {
    const guide = guideSchema.parse(rawGuide),
      player = playerSchema.parse(rawPlayer),
      prepull = player.rotation.prepullActions ?? [];
    requireMatch(
      guide.petType === player.hunter.options.petType &&
        guide.talents === allocation(player.talentsString),
      "Hunter guide pet/talents changed",
    );
    requireMatch(
      guide.petInstruction.includes(petNames[guide.petType]) &&
        guide.instruction.includes(guide.petInstruction),
      "Hunter pet instruction was omitted",
    );
    requireMatch(
      guide.prepull.length === prepull.length && guide.prepullBindings.length === prepull.length,
      "Hunter prepull guide coverage changed",
    );
    for (const [index, entry] of guide.prepullBindings.entries())
      requireMatch(
        entry.index === index &&
          entry.actionSha256 === hash(prepull[index]) &&
          entry.text === guide.prepull[index],
        "Hunter prepull instruction lost its exact action binding",
      );
  },
  validateParity(prepared, summary, rawPlayer): void {
    const player = playerSchema.parse(rawPlayer);
    requireMatch(
      prepared.petType === player.hunter.options.petType && summary.petType === prepared.petType,
      "Hunter parity pet changed",
    );
  },
};

const reader = createPracticalSimulatorDeliveryReader(hunterBeastMasteryDeliveryDefinition);
export const readHunterBeastMasterySimulatorDelivery = reader.read;
export const appendHunterBeastMasterySimulatorDelivery = reader.append;
