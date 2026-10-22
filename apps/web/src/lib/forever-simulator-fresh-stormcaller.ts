import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  record = z.record(z.string(), z.unknown()),
  positiveInteger = z.number().int().positive().safe();

export const stormcallerModelEvidenceReferenceSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(240)
      .refine(
        (path: string): boolean =>
          /^(?:artifacts\/forever-simulator\/)?optimization\/.+\.json$/.test(path) &&
          !path.includes("\\") &&
          !path.includes("\0") &&
          !path.split("/").includes(".."),
      ),
    sha256: digest,
    byteSha256: digest.optional(),
  })
  .strict();
export type StormcallerModelEvidenceReference = z.infer<
  typeof stormcallerModelEvidenceReferenceSchema
>;

export const stormcallerModelEntrySchema = z
  .object({
    id: z.literal("shaman-stormcaller-static"),
    profile: z.literal("elemental_shaman"),
    build: stormcallerModelEvidenceReferenceSchema,
    settingsSha256: digest,
    hrefSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    requestTemplates: z
      .array(
        z
          .object({
            arm: z.string().min(1).max(80),
            requestBase64: z.string().min(20).max(512000),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();
export type StormcallerModelEntry = z.infer<typeof stormcallerModelEntrySchema>;

export const verifiedStormcallerDelivery = Object.freeze({
  sourceRelease: "137f6ec1ba5757af03c5bb95",
  buildSha256: "b6a3f749c666b478855ffc67f6d8983e837adbd1792acc869ee22748cfb97581",
  confirmationSha256: "df2bc6d5fbcd89fc97c082e9c046621996c148dc83035470a57b2e6db9bfb7bc",
});

const sourceRelease = "137f6ec1ba5757af03c5bb95",
  confirmationSha256 = "df2bc6d5fbcd89fc97c082e9c046621996c148dc83035470a57b2e6db9bfb7bc",
  binding = z
    .object({
      index: z.number().int().nonnegative(),
      actionSha256: digest,
      text: z.string().min(1),
    })
    .strict(),
  buildSchema = z
    .object({
      schema: z.literal("kfc-fresh-first-pass-build.v2"),
      id: z.literal("shaman-stormcaller-static"),
      profile: z.literal("elemental_shaman"),
      variant: z.literal("stormcaller"),
      name: z.enum([
        "Stormcaller melee-weave · pre-raid tested",
        "Stormcaller ranged · pre-raid tested",
      ]),
      sourceRelease: z.literal(sourceRelease),
      revision: z.string().min(1),
      modelPolicy: z.literal("ignore-item-bonuses"),
      dbSha256: digest,
      nativeBinarySha256: digest,
      referenceDps: z.number().finite().positive(),
      validationIterations: z.literal(40000),
      settings: record,
      state: record,
      approval: record,
      evidence: z
        .object({
          anchor: stormcallerModelEvidenceReferenceSchema,
          anchorResult: stormcallerModelEvidenceReferenceSchema,
          gear: stormcallerModelEvidenceReferenceSchema,
          gearResult: stormcallerModelEvidenceReferenceSchema,
          feedback: stormcallerModelEvidenceReferenceSchema,
          feedbackResult: stormcallerModelEvidenceReferenceSchema,
          confirmation: stormcallerModelEvidenceReferenceSchema,
          confirmationResult: stormcallerModelEvidenceReferenceSchema,
          confirmationDeclaration: stormcallerModelEvidenceReferenceSchema,
          parity: stormcallerModelEvidenceReferenceSchema,
          meleeModel: stormcallerModelEvidenceReferenceSchema,
          catalogModel: stormcallerModelEvidenceReferenceSchema,
          consumeModel: stormcallerModelEvidenceReferenceSchema,
        })
        .strict(),
      rotationGuidance: z
        .object({
          schema: z.literal("kfc-stormcaller-rotation-guidance.v1"),
          rotationSha256: digest,
          talents: z.string().regex(/^\d+\/\d+\/\d+$/),
          scenario: z.string().min(1),
          instruction: z.string().min(1),
          priorities: z.array(z.string().min(1)).min(1),
          priorityBindings: z.array(binding).min(1),
          prepull: z.array(z.string().min(1)).max(1),
          prepullBindings: z.array(binding).max(1),
          caveats: z.array(z.string().min(1)).min(1),
        })
        .strict(),
      scope: z
        .object({
          name: z.literal("bounded-stormcaller-first-pass.v2"),
          sourceRole: z.literal("stormcaller-practical-first-pass-confirmed"),
          closingFeedbackCompleted: z.literal(true),
          fixedPointWithinDeclaredPolicy: z.literal(true),
          feedbackCycles: positiveInteger.max(2),
          currentModelGearSweeps: positiveInteger.max(6),
          gearedStateRecheckCompleted: z.literal(true),
          finalGearSmallGainStop: z.literal(true),
          gearApplicabilityRequired: z.literal(false),
          previousModelNumericalReuse: z.literal(false),
          exactCurrentBackendScalarReuse: z.literal(true),
          maximumRetainedGapFraction: z.literal(0.02),
          largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
          originalStrictAssessmentAccepted: z.boolean(),
          selectionChanged: z.literal(false),
          globalOptimalityProven: z.literal(false),
          livePvpAccessVerified: z.literal(false),
          numericalJobs: positiveInteger,
          numericalIterations: positiveInteger,
        })
        .passthrough(),
      requiresProvisionalEnchantOptIn: z.literal(false),
      publicPromotion: z.literal(false),
      browserHandoffRequired: z.literal(true),
    })
    .passthrough(),
  approvedPlanSchema = z
    .object({
      schema: z.literal("kfc-approved-first-pass-frozen-confirmation.v1"),
      approvalPolicy: z
        .object({
          schema: z.literal("kfc-owner-approved-first-pass-margin.v1"),
          maximumRetainedGapFraction: z.literal(0.02),
          originalMaximumRetainedGapFraction: z.literal(0.01),
          selectionFromHoldoutsAllowed: z.literal(false),
          scope: z.string().min(1).max(4000),
        })
        .strict(),
      originalPlan: z
        .object({
          arms: z
            .array(
              z
                .object({
                  name: z.string(),
                  category: z.string(),
                  settings: record,
                  inspected: record,
                })
                .passthrough(),
            )
            .min(2)
            .max(12),
          policy: z
            .object({
              version: z.string(),
              iterations: z.number(),
              ranges: z.number(),
              reservedRangeIterations: z.number(),
              inspectedIterations: z.number(),
              inspectedSeed: z.number(),
              maximumArms: z.number(),
              maximumRetainedGapFraction: z.number(),
              standardErrorMultiplier: z.number(),
            })
            .strict(),
          seeds: z.array(positiveInteger).length(2),
          requestIds: z.array(digest).min(4).max(24),
          inspectedSeedRanges: z
            .array(z.object({ seed: positiveInteger, iterations: positiveInteger }).strict())
            .min(1),
        })
        .passthrough(),
    })
    .strict();

export type FreshStormcallerSimulatorBuild = z.infer<typeof buildSchema>;
export interface StormcallerModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  /** This trusted code-review pin must not be taken from the untrusted entry itself. */
  readonly reviewedBuildSha256: string;
  readonly reference: (reference: StormcallerModelEvidenceReference) => Promise<unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function same(left: unknown, right: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(left, right), message);
}

export async function readFreshStormcallerSimulatorBuild(
  rawEntry: unknown,
  options: StormcallerModelBuildOptions,
): Promise<FreshStormcallerSimulatorBuild> {
  const entry = stormcallerModelEntrySchema.parse(rawEntry),
    reviewedBuildSha256 = digest.parse(options.reviewedBuildSha256);
  requireMatch(
    reviewedBuildSha256 === verifiedStormcallerDelivery.buildSha256 &&
      entry.build.sha256 === reviewedBuildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/shaman-stormcaller-first-pass-v1/build-${reviewedBuildSha256.slice(0, 16)}.json`,
    "Unreviewed Stormcaller export requires an independent delivery review",
  );
  async function reference(raw: StormcallerModelEvidenceReference): Promise<unknown> {
    const ref = stormcallerModelEvidenceReferenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Stormcaller evidence checksum changed: " + ref.path);
    return value;
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Stormcaller publication model, settings or DPS changed",
  );
  async function completed(ref: StormcallerModelEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: StormcallerModelEvidenceReference;
    declarationRef: StormcallerModelEvidenceReference;
  }> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: stormcallerModelEvidenceReferenceSchema,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = stormcallerModelEvidenceReferenceSchema.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "Stormcaller completed source identity changed",
    );
    return {
      result,
      declaration: record.parse(await reference(declarationRef)),
      resultRef: completion.result,
      declarationRef,
    };
  }
  const evidence = build.evidence,
    anchor = await completed(evidence.anchor),
    geared = await completed(evidence.gear),
    feedback = await completed(evidence.feedback),
    confirmation = await completed(evidence.confirmation);
  for (const [source, schema, resultRef] of [
    [anchor, "kfc-full-raid-stormcaller-blue-declaration.v1", evidence.anchorResult],
    [geared, "kfc-stormcaller-first-pass-gear-declaration.v1", evidence.gearResult],
    [feedback, "kfc-stormcaller-geared-feedback-declaration.v1", evidence.feedbackResult],
    [
      confirmation,
      "kfc-stormcaller-independent-confirmation-declaration.v1",
      evidence.confirmationResult,
    ],
  ] as const) {
    requireMatch(
      source.declaration.schema === schema &&
        source.declaration.profile === "elemental_shaman" &&
        source.declaration.variant === "stormcaller" &&
        source.declaration.expectedPlayerClass === 7 &&
        source.declaration.sourceRelease === sourceRelease,
      "Stormcaller reused another class, spec or engine",
    );
    same(source.resultRef, resultRef, "Stormcaller result reference changed");
  }
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "Stormcaller confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === confirmationSha256,
    "Unreviewed Stormcaller confirmation",
  );
  for (const [source, parent, parentRef] of [
    [geared, anchor, evidence.anchor],
    [feedback, geared, evidence.gear],
    [confirmation, feedback, evidence.feedback],
  ] as const) {
    same(source.declaration.sourceCompletion, parentRef, "Stormcaller lost its measured parent");
    same(source.declaration.sourceResult, parent.resultRef, "Stormcaller lost its parent result");
    same(
      source.declaration.importedJournals,
      parent.result.journals,
      "Stormcaller origin reuse changed",
    );
  }
  const backend = record.parse(confirmation.declaration.backend),
    melee = record.parse(await reference(evidence.meleeModel)),
    catalog = record.parse(await reference(evidence.catalogModel)),
    consume = record.parse(await reference(evidence.consumeModel));
  for (const source of [anchor, geared, feedback])
    same(source.declaration.backend, backend, "Stormcaller source backend changed");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      melee.schema === "kfc-shaman-caster-melee-model-context.v1" &&
      melee.release === sourceRelease &&
      melee.nativeBinarySha256 === build.nativeBinarySha256 &&
      record.parse(melee.descriptor).databaseSha256 === build.dbSha256 &&
      record.parse(melee.descriptor).parentModel === catalog.release &&
      catalog.schema === "kfc-shaman-pvp-model-context.v1" &&
      catalog.release === "e81f4ce09db5771ac8f73ace" &&
      record.parse(catalog.descriptor).databaseSha256 === build.dbSha256 &&
      record.parse(catalog.descriptor).parentModel === consume.release &&
      consume.schema === "kfc-greater-mageblood-model-context.v1" &&
      consume.release === "a4eabfa5c89f3813c1b74bde",
    "Stormcaller catalog, melee or Greater20 provenance changed",
  );

  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).min(1).max(2).parse(closing.cycles),
    last = cycles.at(-1),
    lastGear = record.parse(last?.gear),
    lastState = record.parse(
      closing.closing ? record.parse(closing.closing).recheck : last?.recheck,
    ),
    gearResults = [
      record.parse(record.parse(geared.result.semantic).evaluation),
      ...cycles.map((cycle): Record<string, unknown> => record.parse(cycle.gear)),
    ],
    sweeps = gearResults.flatMap((gear): Record<string, unknown>[] =>
      z.array(record).min(1).max(2).parse(gear.sweeps),
    );
  requireMatch(
    closing.schema === "kfc-stormcaller-geared-feedback-result.v1" &&
      closing.fixedPointWithinDeclaredPolicy === true &&
      closing.gearApplicabilityRequired === false &&
      closing.independentFinalValidation === false &&
      closing.publicationAllowed === false &&
      lastGear.stoppedForSmallGain === true &&
      build.scope.feedbackCycles === cycles.length &&
      build.scope.currentModelGearSweeps === sweeps.length,
    "Stormcaller gear/state feedback did not close",
  );
  same(closing.settings, build.settings, "Stormcaller final settings changed");
  same(closing.state, build.state, "Stormcaller final state changed");
  same(lastGear.gear, closing.gear, "Stormcaller final gear changed");
  same(lastGear.state, build.state, "Stormcaller gear applicability used another state");
  same(
    record.parse(lastState.selected).metric,
    record.parse(lastGear.selected).metric,
    "Stormcaller final state/gear origin changed",
  );
  for (const sweep of sweeps) {
    z.array(z.array(z.number().int().nonnegative()).min(1))
      .length(17)
      .parse(sweep.candidateIdsBySlot);
    const names = new Set(
      z
        .array(record)
        .parse(sweep.groups)
        .map((group): string => z.string().parse(group.name)),
    );
    for (const name of [
      ...Array.from({ length: 10 }, (_, index): string => `slot:${index}`),
      "slot:14",
      "slot:16",
      "pair:14+15",
      "pair:10+11",
      "pair:12+13",
      "expanded-sets",
    ])
      requireMatch(names.has(name), "Stormcaller omitted a slot, ordered pair or set");
    requireMatch(
      [...names].some((name): boolean => name.startsWith("enchant:")),
      "Stormcaller omitted enchant comparisons",
    );
  }

  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing or duplicated Stormcaller wire templates",
  );
  const request = (
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing actual Stormcaller wire");
    return {
      requestBase64,
      gear: record.parse(player.equipment).items,
      talentsString: player.talentsString,
      rotation: player.rotation,
      iterations,
      seed,
      detail: false,
    };
  };
  for (const arm of plan.arms) {
    const player = record.parse(arm.settings.player),
      consumes = record.parse(player.consumes);
    requireMatch(
      player.class === "ClassShaman" &&
        player.level === 60 &&
        player.elementalShaman &&
        !player.enhancementShaman &&
        !player.restorationShaman &&
        [5, 20].includes(z.number().parse(player.distanceFromTarget)) &&
        player.inFrontOfTarget === false &&
        player.foreverTier1Bonuses === false &&
        player.enableItemSwap === false &&
        consumes.manaRegenElixir === "GreaterMagebloodElixir" &&
        !record.parse(arm.settings.debuffs).stormstrike,
      "Stormcaller final arm changed its class or fixed conditions",
    );
    for (const [values, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(values);
      for (const [name, value] of Object.entries(required))
        same(actual[name], value, "Stormcaller raid buff changed: " + name);
    }
    requireMatch(
      hash(request(arm, 10000, 77191)) === arm.inspected.id,
      "Stormcaller inspected request changed",
    );
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "Stormcaller holdout request changed",
  );
  same(
    plan.arms[0]?.settings,
    build.settings,
    "Stormcaller selected winner changed after holdouts",
  );
  const approval = record.parse(record.parse(confirmation.result.semantic).evaluation),
    original = record.parse(approval.originalAssessment),
    records = z
      .array(
        z
          .object({
            seed: positiveInteger,
            arm: z.string(),
            metric: z
              .object({
                id: digest,
                dps: z.number().finite().positive(),
                stdev: z.number().finite().nonnegative(),
                iterations: positiveInteger,
              })
              .strict(),
          })
          .strict(),
      )
      .min(4)
      .max(24)
      .parse(original.records),
    math = evaluateApprovedSimulatorConfirmation(approved, records);
  requireMatch(math.accepted, "Stormcaller exceeds the approved2% margin");
  same(approval, build.approval, "Stormcaller exported approval changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Stormcaller approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Stormcaller1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "Stormcaller disclosed precision changed",
  );
  const reservation = record.parse(
    await reference(stormcallerModelEvidenceReferenceSchema.parse(approval.reservation)),
  );
  requireMatch(
    reservation.identity === confirmationSha256 &&
      reservation.planSha256 ===
        hash(record.parse(record.parse(confirmation.declaration.confirmationPlan).originalPlan)) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Stormcaller fresh RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Stormcaller reserved seeds changed");

  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === "kfc-stormcaller-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.schema === "kfc-elemental-shaman-selected-native-wasm-parity.v1" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      Math.abs(z.number().parse(native.dps) - z.number().parse(browser.dps)) < 1e-8 &&
      Math.abs(z.number().parse(native.stdev) - z.number().parse(browser.stdev)) < 1e-8 &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Actual selected Stormcaller native/WASM parity missing",
  );
  same(parity.errors, [], "Stormcaller parity has browser errors");
  same(descriptor.backend, backend, "Stormcaller parity backend changed");
  same(
    record.parse(descriptor.sourceValidation).completion,
    evidence.confirmation,
    "Stormcaller parity lost fresh confirmation",
  );
  same(native, plan.arms[0]?.inspected, "Stormcaller parity native origin changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList),
    prepull = z
      .array(record)
      .max(1)
      .parse(rotation.prepullActions ?? []);
  requireMatch(
    hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      guide.priorities.length === actions.length &&
      guide.prepullBindings.length === prepull.length &&
      guide.prepull.length === prepull.length &&
      player.talentsString === build.state.talentsString &&
      record.parse(player.consumes).defaultConjured === "ConjuredDemonicRune",
    "Stormcaller guide lost its measured actions",
  );
  for (const [bindings, entries, texts] of [
    [guide.priorityBindings, actions, guide.priorities],
    [guide.prepullBindings, prepull, guide.prepull],
  ] as const)
    bindings.forEach((item, index): void =>
      requireMatch(
        item.index === index &&
          item.actionSha256 === hash(entries[index]) &&
          item.text === texts[index],
        "Stormcaller ordered action guidance changed",
      ),
    );
  const meleeRange = player.distanceFromTarget === 5;
  requireMatch(
    build.name ===
      (meleeRange ? "Stormcaller melee-weave" : "Stormcaller ranged") + " · pre-raid tested" &&
      guide.instruction.includes(meleeRange ? "melee-range setup" : "ranged setup"),
    "Stormcaller range guidance changed",
  );
  if (record.parse(record.parse(player.elementalShaman).options).mainHandImbue === "RockbiterImbue")
    requireMatch(
      guide.caveats.some((text): boolean => text.includes("additional threat")),
      "Stormcaller omitted Rockbiter threat guidance",
    );
  return build;
}
