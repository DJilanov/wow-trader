import assert from "node:assert/strict";

const parentRelease = "546fce4ba3d23c2b6d7f3b43",
  correctedRelease = "57ac00a190de1da00d51b72d",
  frameIds = ["feral-cat-static", "balance-static"],
  productionOverrides = [
    "sim/core/kfc_stable_metric_moments.go",
    "sim/core/sim_concurrent.go",
    "sim/core/utils.go",
  ];

/** Bind the entire existing control matrix to the corrected engine without carrying results.
 * The caller authenticates file bytes; this function checks the cross-file contract.
 * @param {{parent:object,model:object,prepared:object,framePreparation:object,database:object,window:object}} source
 * @returns {object}
 */
export function bindDruidStatisticsControls({
  parent,
  model,
  prepared,
  framePreparation,
  database,
  window,
}) {
  assert.equal(parent.release, parentRelease);
  assert.equal(model.schema, "kfc-druid-stable-statistics-model.v1");
  assert.equal(model.release, correctedRelease);
  assert.equal(model.parentModel, parent.release);
  assert.notEqual(model.nativeBinarySha256, parent.nativeBinarySha256);
  assert.notEqual(model.wasmSha256, parent.wasmSha256);
  assert.equal(model.databaseBinarySha256, parent.databaseBinarySha256);
  assert.deepEqual(model.codecs, parent.codecs);
  assert.deepEqual(model.model.pages, parent.model.pages);
  assert.deepEqual([...model.productionSourceOverrides].sort(), productionOverrides);
  assert.equal(model.catalogAndGameplaySourcesPreserved, true);
  assert.equal(model.strictFiniteMetricGateChanged, false);
  assert.equal(model.numericalReuseAllowed, false);
  assert.equal(model.publicationAllowed, false);
  assert.equal(model.nativeCombatJobs + model.browserCombatJobs, 0);
  for (const digest of [
    model.nativeBinarySha256,
    model.wasmSha256,
    model.databaseBinarySha256,
    model.codecs.codecSha256,
  ])
    assert(typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest));
  assert.equal(database.items.length, 2703);
  for (const name of [
    "assets/database/db.json",
    "assets/database/leftover_db.json",
    "assets/database/db.bin",
    "assets/database/leftover_db.bin",
  ])
    assert.equal(model.model.files[name].sha256, parent.model.files[name].sha256, name);

  assert.equal(window.schema, "kfc-approved-full-raid-update-window.v1");
  assert.equal(window.authorization.questionReference, "call_8183aa9693344b5d83183075f2db2d03/0");
  assert.equal(window.budget.classSlug, "druid");
  assert.equal(window.budget.startedAt, "2026-10-24T23:25:34.014Z");
  assert.equal(window.budget.deadlineAt, "2026-10-25T23:25:34.014Z");
  assert.equal(window.budget.maxDurationMs, 86400000);
  assert.equal(window.authorization.maximumHours, 24);
  assert.equal(window.authorization.retainedContenderMargin, 0.02);
  assert.equal(window.authorization.separateOriginalAuditMargin, 0.01);
  assert.equal(window.authorization.maximumBossDebuffs, 16);
  assert.equal(window.authorization.playerBuffLimit, null);
  assert.equal(window.authorization.deepTimingSearches, false);
  assert.equal(
    window.originalLedger.path,
    "artifacts/forever-simulator/optimization/first-pass-class-budgets/druid.json",
  );
  assert(/^[a-f0-9]{64}$/.test(window.originalLedger.byteSha256));
  assert.equal(model.descriptor.originalDeadlineAt, window.budget.deadlineAt);
  assert.equal(prepared.schema, "kfc-druid-full-raid-derived-control-requests.v1");
  assert.equal(prepared.model.release, parent.release);
  assert.equal(prepared.actualUiCapture, false);
  assert.equal(prepared.derivedNativeRequestsPrepared, true);
  assert.equal(prepared.combatExecuted, false);
  assert.equal(prepared.publicationAllowed, false);
  assert.deepEqual(
    prepared.frames.map((frame) => frame.id),
    frameIds,
  );
  assert.equal(prepared.cases.length, 20);
  assert.equal(framePreparation.schema, "kfc-druid-full-raid-control-preparation.v1");
  assert.equal(framePreparation.model.release, parent.release);
  assert.deepEqual(
    framePreparation.frames.map((frame) => frame.id),
    frameIds,
  );
  const frames = framePreparation.frames.map((frame) => {
    const full = prepared.cases.find((entry) => entry.control.label === "full-" + frame.id);
    assert.deepEqual(frame.profile.settings, full.control.settings);
    assert.equal(frame.profile.playerClass, 1);
    assert.equal(frame.profile.dbSha256, prepared.backend.compiledDatabaseSha256);
    assert.equal(frame.profile.variant, frame.id === "feral-cat-static" ? "feral" : "balance");
    assert.equal(
      frame.profile.profile,
      frame.profile.variant === "feral" ? "feral_druid" : "balance_druid",
    );
    return {
      id: frame.id,
      variant: frame.profile.variant,
      profileName: frame.profile.profile,
      source: structuredClone(frame.source),
      profile: structuredClone(frame.profile),
    };
  });

  const items = new Map(database.items.map((item) => [item.id, item])),
    controls = [];
  for (const id of frameIds) {
    const cases = prepared.cases.filter((entry) => entry.control.sourceId === id);
    assert.deepEqual(
      cases.map((entry) => entry.control.label),
      [
        "original-" + id,
        "full-" + id,
        ...Array.from({ length: 8 }, (_, index) => "feralheart-" + (index + 1) + "-" + id),
      ],
    );
    for (const [index, entry] of cases.entries()) {
      const control = entry.control,
        player = control.settings.player;
      assert.equal(
        control.kind,
        index === 0 ? "published-original" : index === 1 ? "full-raid" : "feralheart-threshold",
      );
      assert.equal(control.allowProvisionalEnchants, false);
      assert.equal(control.settings.settings.ruleset, "RulesetForever");
      assert.equal(player.class, "ClassDruid");
      assert(Boolean(player.feralDruid) !== Boolean(player.balanceDruid));
      assert.equal(Boolean(player.feralDruid), id === "feral-cat-static");
      assert.equal(player.distanceFromTarget, id === "feral-cat-static" ? 5 : 30);
      assert.equal(player.equipment.items.length, 17);
      const pieces = player.equipment.items.filter(
        (item) => items.get(item.id)?.setId === 513,
      ).length;
      assert.equal(pieces, control.feralheartPieces);
      if (index >= 2) assert.equal(pieces, index - 1);
      // Previous derived requests and provenance contain old-backend identities.
      // Only settings are proposal inputs; every UI capture/result must be new.
      controls.push(structuredClone(control));
    }
  }
  return {
    schema: "kfc-druid-statistics-control-plan.v1",
    sourceRelease: model.release,
    originalRelease: parent.release,
    backend: {
      binarySha256: model.nativeBinarySha256,
      wasmSha256: model.wasmSha256,
      databaseBinarySha256: model.databaseBinarySha256,
      codecSha256: model.codecs.codecSha256,
    },
    window: {
      classSlug: "druid",
      authorizationReference: window.authorization.questionReference,
      startedAt: window.budget.startedAt,
      deadlineAt: window.budget.deadlineAt,
      originalLedger: structuredClone(window.originalLedger),
    },
    controls,
    frames,
    matrix: { frames: 2, controls: 20, originals: 2, fullRaid: 2, baseSetBoundaries: 16 },
    requiresFreshUiCaptures: true,
    requiresExplicitForeverWire: true,
    requiresCompleteFiniteNativeBrowserMetrics: true,
    previousNumericalResultsIncluded: false,
    numericalQualification: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}
