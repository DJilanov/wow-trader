import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";
import { openHealingNativeRunners } from "./healing-native-runner.mjs";
import { assertHealingJob, parseHealingJobReply } from "./healing-protocol.mjs";

const bytes = readFileSync(new URL("./fixtures/healing-job-response.v1.json", import.meta.url));
const sha = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(bytes), "2d7b37cccc258377a2b2d09c7bdf3310c9c2a1c47d1e315f82271b7e95605326");
const fixture = JSON.parse(bytes);

test("actual standalone native/browser replies preserve effective healing and failed assignments", () => {
  assert.equal(fixture.schema, "kfc-healing-job-response-fixture.v1");
  assert.equal(
    fixture.componentIdentity,
    "d3bb0d23bd8d8d5c68031183d2bea453a94f3cc8125574795a180ad6dbfbb7a9",
  );
  assertHealingJob(fixture.job);
  for (const [name, reply] of Object.entries(fixture.responses)) {
    const parsed = parseHealingJobReply(JSON.stringify(reply), reply.id, name === "normal");
    assert.equal(parsed.status, "complete");
    assert.equal(parsed.result.classQualified, false);
    assert.equal(parsed.result.publicationAllowed, false);
  }
  assert.equal(fixture.responses.zero.result.hps, 0);
  assert.equal(fixture.responses.fatal.result.survivalRate, 0);
  assert.equal(fixture.responses.normal.result.hps, fixture.responses.compact.result.hps);
});

for (const [name, change] of [
  [
    "wrong correlation",
    (reply) => {
      reply.id = "another-job";
    },
  ],
  [
    "old DPS protocol",
    (reply) => {
      reply.schema = "kfc-dps-result.v1";
    },
  ],
  [
    "numeric coercion",
    (reply) => {
      reply.result.hps = String(reply.result.hps);
    },
  ],
  [
    "negative mana",
    (reply) => {
      reply.result.manaRemainingMean = -1;
    },
  ],
  [
    "inconsistent effective accounting",
    (reply) => {
      reply.result.effectiveHealingHps += 5;
    },
  ],
  [
    "inconsistent raw accounting",
    (reply) => {
      reply.result.rawHps += 5;
    },
  ],
  [
    "impossible survival",
    (reply) => {
      reply.result.survivalRate = 2;
    },
  ],
  [
    "lost qualification gate",
    (reply) => {
      delete reply.result.classQualified;
    },
  ],
  [
    "invented class qualification",
    (reply) => {
      reply.result.classQualified = true;
    },
  ],
  [
    "invented publication permission",
    (reply) => {
      reply.result.publicationAllowed = true;
    },
  ],
  [
    "DPS relabelled as healing",
    (reply) => {
      reply.result.dps = 1000;
    },
  ],
  [
    "missing iterations",
    (reply) => {
      delete reply.result.iterations;
    },
  ],
  [
    "nonfinite HPS",
    (reply) => {
      reply.result.hps = Number.NaN;
    },
  ],
])
  test(`rejects ${name}`, () => {
    const reply = globalThis.structuredClone(fixture.responses.compact);
    change(reply);
    assert.throws(() => parseHealingJobReply(JSON.stringify(reply), fixture.responses.compact.id));
  });

test("detailed metrics must be requested and agree with their summary", () => {
  const reply = globalThis.structuredClone(fixture.responses.normal);
  assert.throws(() => parseHealingJobReply(JSON.stringify(reply), reply.id, false));
  reply.result.metrics.hps.avg += 10;
  assert.throws(() => parseHealingJobReply(JSON.stringify(reply), reply.id, true));
  assert.throws(() =>
    parseHealingJobReply(
      JSON.stringify(fixture.responses.compact),
      fixture.responses.compact.id,
      true,
    ),
  );
});

test("invalid input envelopes fail before entering the native or browser executor", () => {
  for (const change of [
    (job) => {
      job.schema = "kfc-dps-job.v1";
    },
    (job) => {
      job.id = "contains spaces";
    },
    (job) => {
      delete job.detail;
    },
    (job) => {
      job.workload = [];
    },
  ]) {
    const job = globalThis.structuredClone(fixture.job);
    change(job);
    assert.throws(() => assertHealingJob(job));
  }
});

async function transportWorker(t, timeoutMs = 5000) {
  const directory = await mkdtemp(join(tmpdir(), "kfc-healing-transport-"));
  const path = join(directory, "transport.mjs");
  const script = `#!${process.execPath}
import {createInterface} from 'node:readline';
import process from 'node:process';
const recorded = ${JSON.stringify(fixture.responses.compact)};
createInterface({input:process.stdin}).on('line',line=>{
 const job=JSON.parse(line);
 if(job.id==='silent')return;
 const reply=job.id==='rejected'?{schema:'kfc-healing-job-result.v1',id:job.id,status:'error',error:{code:'workload_failed',message:'Controlled input rejection'}}:{...recorded,id:job.id==='mismatch'?'wrong-job':job.id};
 process.stdout.write(JSON.stringify(reply)+'\\n');
});
`;
  await writeFile(path, script, { mode: 0o700 });
  const [runner] = await openHealingNativeRunners(path, directory, sha(script), { timeoutMs });
  t.after(async () => {
    const exited =
      runner.child.exitCode !== null || runner.child.signalCode !== null
        ? Promise.resolve()
        : once(runner.child, "exit");
    runner.terminate();
    await exited;
    await rm(directory, { recursive: true, force: true });
  });
  return runner;
}

test("native transport survives a rejected workload without replacing its worker", async (t) => {
  const runner = await transportWorker(t);
  const pid = runner.child.pid;
  await assert.rejects(
    runner.run({ ...fixture.job, id: "rejected" }),
    (error) => error.code === "workload_failed",
  );
  const reply = await runner.run({ ...fixture.job, id: "recovered" });
  assert.equal(reply.id, "recovered");
  assert.equal(reply.result.hps, fixture.responses.compact.result.hps);
  assert.equal(runner.child.pid, pid);
});

test("native transport stops a pending job and disallows reuse after termination", async (t) => {
  const runner = await transportWorker(t);
  const pending = runner.run({ ...fixture.job, id: "silent" });
  runner.terminate();
  await assert.rejects(pending, /interrupted/);
  assert.throws(() => runner.run(fixture.job), /closed/);
});

test("native transport times out and terminates an unresponsive worker", async (t) => {
  const runner = await transportWorker(t, 100);
  await assert.rejects(runner.run({ ...fixture.job, id: "silent" }), /exceeded/);
  assert(runner.closed);
});

test("native transport terminates on a reply for a different job", async (t) => {
  const runner = await transportWorker(t);
  await assert.rejects(runner.run({ ...fixture.job, id: "mismatch" }), /does not match/);
  assert(runner.closed);
});

test("native transport closes idle workers cleanly", async (t) => {
  const runner = await transportWorker(t);
  await runner.run({ ...fixture.job, id: "before-close" });
  const exited = once(runner.child, "exit");
  runner.close();
  const [code] = await exited;
  assert.equal(code, 0);
  assert.throws(() => runner.run(fixture.job), /closed/);
});

test("native transport verifies the executable before spawning", async () => {
  await assert.rejects(
    openHealingNativeRunners(process.execPath, process.cwd(), "0".repeat(64)),
    /engine changed/,
  );
});
