import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";

assert.equal(process.argv.length, 2, "Native preflight does not accept arguments");
const root = resolve(import.meta.dirname, "..");
const workspace = await acquireSimulatorWorkspace(
  root,
  join(root, "artifacts/forever-simulator/optimization/native-preflight"),
);
try {
  const workers = await createNativeRunners(root, 1);
  workers.forEach((worker) => worker.close());
  console.log(JSON.stringify({ status: "native-ready", binarySha256: workers[0].binarySha256 }));
} finally {
  await workspace.release();
}
