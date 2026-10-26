import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { FullRaidDruidBuildOptions } from "./forever-simulator-full-raid-druid";
import { fullRaidDruidBuildEntrySchema } from "./forever-simulator-full-raid-druid-schema";
import {
  fullRaidDruidBuildPinsV2Schema,
  fullRaidDruidBuildV2Schema,
  type FullRaidDruidBuildPinsV2,
  type ReviewedFullRaidDruidBuildV2,
} from "./forever-simulator-full-raid-druid-schema-v2";

export type FullRaidDruidBuildReaderV2 = (
  entry: unknown,
  options: FullRaidDruidBuildOptions,
) => Promise<ReviewedFullRaidDruidBuildV2>;

const definitions = {
  "feral-cat-static": {
    profile: "feral_druid",
    variant: "feral",
    profession: "Leatherworking",
    distance: 5,
    spec: "feralDruid",
  },
  "balance-static": {
    profile: "balance_druid",
    variant: "balance",
    profession: "Tailoring",
    distance: 30,
    spec: "balanceDruid",
  },
} as const;
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertReviewedBuild(value: unknown): asserts value is ReviewedFullRaidDruidBuildV2 {
  // Keep the actual export representation and its key order intact.
  fullRaidDruidBuildV2Schema.parse(value);
}

/** Validate unchanged numerical exports against the actually reviewed attempt.
 * This succeeds only with independently supplied code-owned pins. Source and
 * browser admission remain separate; importing claims cannot select an owner.
 * V1 remains frozen as historical evidence for its original supervisor attempt.
 */
export function createReviewedFullRaidDruidBuildReaderV2(
  rawPins: FullRaidDruidBuildPinsV2,
): FullRaidDruidBuildReaderV2 {
  const pins = fullRaidDruidBuildPinsV2Schema.parse(rawPins);
  return async (
    rawEntry: unknown,
    options: FullRaidDruidBuildOptions,
  ): Promise<ReviewedFullRaidDruidBuildV2> => {
    const entry = fullRaidDruidBuildEntrySchema.parse(rawEntry),
      definition = definitions[entry.id],
      expectedHash = pins.builds[entry.id];
    requireMatch(
      entry.build.sha256 === expectedHash &&
        entry.build.path ===
          "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/exports/build-" +
            definition.variant +
            "-" +
            expectedHash.slice(0, 16) +
            ".json",
      "Druid build is not a pinned independently reviewed primary",
    );
    const raw = await options.reference(entry.build);
    requireMatch(hash(raw) === expectedHash, "Reviewed Druid build checksum changed");
    assertReviewedBuild(raw);
    const build = raw,
      player = build.settings.player,
      guide = build.rotationGuidance;
    requireMatch(
      build.id === entry.id &&
        build.profile === entry.profile &&
        build.profile === definition.profile &&
        build.variant === definition.variant &&
        build.sourceRelease === options.sourceRelease &&
        build.revision === options.revision &&
        build.dbSha256 === options.databaseSha256 &&
        hash(build.settings) === build.settingsSha256 &&
        build.settingsSha256 === entry.settingsSha256 &&
        build.referenceDps === entry.referenceDps &&
        build.validationIterations === entry.validationIterations,
      "Druid entry lost its reviewed setup, samples or model",
    );
    requireMatch(
      build.evidence.correction.byteSha256 === pins.correctionByteSha256 &&
        build.evidence.confirmation.byteSha256 === pins.confirmationByteSha256 &&
        build.evidence.supervisor.runId === pins.supervisorRunId &&
        build.evidence.supervisor.runSha256 === pins.supervisorRunSha256,
      "Druid correction, confirmation or completed owner differs from the reviewed source",
    );
    requireMatch(
      player.profession2 === definition.profession &&
        player.distanceFromTarget === definition.distance &&
        player[definition.spec] !== undefined &&
        player[definition.spec === "feralDruid" ? "balanceDruid" : "feralDruid"] === undefined,
      "Druid spec, professions or range changed",
    );
    requireMatch(
      guide.caseId === build.id &&
        guide.variant === build.variant &&
        guide.sourceSettingsSha256 === build.settingsSha256 &&
        guide.stateSha256 === hash(build.state) &&
        guide.rotationSha256 === hash(player.rotation) &&
        guide.consumesSha256 === hash(player.consumes) &&
        guide.sourceRequestKey === build.evidence.selectedEffectiveInputKey,
      "Druid guidance lost its exact source binding",
    );
    const allocation = player.talentsString
      .split("-")
      .map((tree: string): number =>
        [...tree].reduce((sum: number, point: string): number => sum + Number(point), 0),
      );
    while (allocation.length < 3) allocation.push(0);
    requireMatch(
      allocation.reduce((sum: number, points: number): number => sum + points, 0) === 51 &&
        allocation.join("/") === guide.talents &&
        build.state.talentsString === player.talentsString,
      "Druid talent instructions changed",
    );
    requireMatch(
      guide.conjured === build.state.conjured &&
        isDeepStrictEqual(guide.selectedConsumes, player.consumes) &&
        player.consumes.defaultConjured ===
          (guide.conjured === "tea" ? "ConjuredRogueThistleTea" : "ConjuredDemonicRune") &&
        (build.variant === "feral" || guide.conjured === "rune"),
      "Druid conjured resource or consume instructions changed",
    );
    for (const [bindings, actions, texts] of [
      [guide.priorityBindings, player.rotation.priorityList, guide.priorities],
      [guide.prepullBindings, player.rotation.prepullActions ?? [], guide.prepull],
    ] as const) {
      requireMatch(
        bindings.length === actions.length && texts.length === actions.length,
        "Druid guidance dropped an action",
      );
      bindings.forEach((binding, index): void =>
        requireMatch(
          binding.index === index &&
            binding.actionSha256 === hash(actions[index]) &&
            binding.text === texts[index],
          "Druid guidance action binding changed",
        ),
      );
    }
    const coverage = build.scope.freshConfirmationCoverage;
    requireMatch(
      coverage.sourceOrigins ===
        coverage.retainedStateFinalists +
          coverage.retainedGearFinalists +
          coverage.retainedConsumeFinalists +
          1 && coverage.effectiveArms + coverage.aliases === coverage.sourceOrigins,
      "Druid retained confirmation coverage changed",
    );
    return build;
  };
}
