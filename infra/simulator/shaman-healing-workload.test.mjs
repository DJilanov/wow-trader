import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  integrateShamanHealingWorkload,
  renderShamanHealingWorkloadJob,
} from "./shaman-healing-workload.mjs";

test("damage integration uses the owned initialization and rejects duplicate application", async () => {
  const source = await readFile(new URL("shaman-healing-baseline.go", import.meta.url), "utf8");
  const output = integrateShamanHealingWorkload(source);
  assert(output.includes("resto.Shaman.Initialize()\n\tresto.registerKFCShamanWorkloadDamage()"));
  assert.throws(() => integrateShamanHealingWorkload(output));
  assert.throws(() =>
    integrateShamanHealingWorkload(source.replace("resto.Shaman.Initialize()", "")),
  );
});

test("strict common worker is bound to the Shaman schema and runner", async () => {
  const source = await readFile(new URL("healing-job.go", import.meta.url), "utf8");
  const output = renderShamanHealingWorkloadJob(source);
  assert(output.startsWith("package restoration\n"));
  assert(output.includes("RunKFCShamanHealingWorkload(ctx, request, job.Workload)"));
  assert(output.includes('job.Schema != "kfc-shaman-healing-job.v1"'));
  assert(output.includes("decoder.DisallowUnknownFields()"));
  assert(!output.includes("KFCHealing"));
  assert.throws(() => renderShamanHealingWorkloadJob(output));
});
