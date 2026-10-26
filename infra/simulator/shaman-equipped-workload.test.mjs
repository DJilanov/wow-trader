import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderShamanEquippedWorkload } from "./shaman-equipped-workload.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("fixtures/shaman-equipped-workload-parent-source.v1.json.gz", import.meta.url),
    ),
  ),
);
assert.equal(fixture.schema, "kfc-shaman-equipped-workload-parent.v1");
const input = fixture.sources;

test("the original spell-only validation remains intact alongside the separate equipped entry", () => {
  const result = renderShamanEquippedWorkload(input);
  const guard = input.definitions.slice(
    input.definitions.indexOf("func validateKFCShamanWorkloadRequest("),
    input.definitions.indexOf("func (resto *RestorationShaman) validateKFCShamanWorkloadPriority("),
  );
  assert(result.definitions.includes(guard));
  assert(result.runner.includes("return runKFCShamanHealingWorkload(ctx,input,frame,nil)"));
  assert(result.runner.includes("validateKFCShamanEquippedRequest(request,player,equipped)"));
  assert(result.definitions.includes('`json:"equipped,omitempty"`'));
});

test("equipment policies initialize after the first reset and actual health setup, before prepull", () => {
  const { runner } = renderShamanEquippedWorkload(input);
  const reset = runner.indexOf("\t\tsim.Reset()"),
    health = runner.indexOf("unit.ConfigureKFCHealingBenchmarkHealth", reset),
    policy = runner.indexOf("healer.configureKFCShamanEquippedEffects", health),
    prepull = runner.indexOf("sim.PrePull()", policy);
  assert(reset > 0 && health > reset && policy > health && prepull > policy);
  assert(runner.slice(health, policy).includes("if iteration==0"));
  assert(runner.includes("equippedUses=make([]int,len(equipped.Cooldowns))"));
  assert(
    runner.includes("equipped Shaman maximum health must come from actual equipment and buffs"),
  );
});

test("the strict new job boundary shares the unknown-protobuf detector without redefining it", () => {
  const { job } = renderShamanEquippedWorkload(input);
  assert(job.includes("decoder.DisallowUnknownFields()"));
  assert(job.includes("base64.StdEncoding.Strict().DecodeString"));
  assert(job.includes("kfcShamanHealingUnknownFields(request.ProtoReflect())"));
  assert(!job.includes("func kfcShamanHealingUnknownFields("));
  assert(!job.includes('"google.golang.org/protobuf/reflect/protoreflect"'));
  assert(job.includes('job.Schema != "kfc-shaman-equipped-job.v1"'));
  assert(job.includes("RunKFCShamanEquippedHealingWorkload(ctx, request, job.Workload)"));
  assert(job.includes("*KFCShamanHealingWorkloadResult"));
  assert(job.includes("Missing equipped Shaman receipt or assignment"));
});

test("native and browser drivers call the same owned equipped protocol with separate browser globals", () => {
  const result = renderShamanEquippedWorkload(input);
  for (const source of [result.nativeDriver, result.wasmDriver]) {
    assert(source.includes("sim.RegisterAll()"));
    assert(!source.includes("restoration.RegisterRestorationShaman()"));
    assert(source.includes("restoration.RunKFCShamanEquippedHealingJob"));
    assert(!source.includes("holy."));
  }
  assert(result.wasmDriver.includes('Set("kfcShamanEquippedSimulate"'));
  assert(result.wasmDriver.includes('Get("kfcShamanEquippedWasmReady"'));
  assert(!result.wasmDriver.includes('Set("kfcHealingSimulate"'));
});

test("unknown parent source and duplicate integration fail instead of silently weakening guards", () => {
  for (const edit of [
    (value) => {
      value.runner = value.runner.replace(
        "validateKFCShamanWorkloadRequest(player, request.Raid)",
        "differentValidator(player, request.Raid)",
      );
    },
    (value) => {
      value.definitions = value.definitions.replace(
        "type KFCShamanHealingWorkloadResult struct {",
        "type Changed struct {",
      );
    },
    (value) => {
      value.job = value.job.replace(
        "func kfcShamanHealingUnknownFields(",
        "func missingUnknownFields(",
      );
    },
    (value) => {
      value.nativeDriver = value.nativeDriver.replace("holy.RegisterHolyPaladin()", "");
    },
    (value) => {
      value.runner = renderShamanEquippedWorkload(value).runner;
    },
  ]) {
    const value = structuredClone(input);
    edit(value);
    assert.throws(() => renderShamanEquippedWorkload(value));
  }
});

test("rendering preserves source inputs and keeps the full external-demand ledger", () => {
  const before = structuredClone(input),
    result = renderShamanEquippedWorkload(input);
  assert.deepEqual(input, before);
  const start = input.runner.indexOf("\t\tfinalMissing := missing(true)"),
    end = input.runner.indexOf("\t\tsim.Cleanup()", start);
  assert(start > 0 && end > start);
  assert(result.runner.includes(input.runner.slice(start, end)));
  assert.equal(result.runner.split("healer.useKFCShamanEquippedCooldowns").length, 2);
  assert.equal(result.runner.split("kfcShamanEquippedInactiveExtras").length, 3);
});
