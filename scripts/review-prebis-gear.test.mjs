import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tool = join(root, "scripts/review-prebis-gear.mjs");
const archive = join(root, "artifacts/forever-simulator/optimization");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
function execute(args) {
  return execFileSync(process.execPath, [tool, ...args], {
    cwd: root,
    stdio: "pipe",
    timeout: 180000,
    maxBuffer: 1024 * 1024,
  });
}
function rejects(args, expected) {
  assert.throws(
    () => execute(args),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), expected);
      return true;
    },
  );
}
function currentFixture() {
  const latestPath = join(archive, "campaigns/latest.json");
  if (!existsSync(latestPath)) return null;
  const status = JSON.parse(
    execFileSync(process.execPath, ["scripts/update-simulator-prebis.mjs", "--status"], {
      cwd: root,
      stdio: "pipe",
      maxBuffer: 2 * 1024 * 1024,
    }).toString(),
  );
  const latest = read(latestPath);
  if (status.identity !== latest.identity || status.changes.changed || status.recaptureRequired)
    return null;
  const state = read(join(archive, "campaigns", latest.identity, "state.json"));
  const completed = Object.values(state.cases).find((entry) => entry.status === "reviewed-local");
  if (!completed) return null;
  const review = read(resolve(root, completed.final.review.path));
  const path = resolve(root, review.evidencePaths["gear-review"]);
  return {
    path,
    wrapper: read(path),
    report: read(path.replace(/-gear\.json$/, "-results.json")),
    checkpoint: read(path + ".checkpoint.json"),
  };
}
const fixture = currentFixture();
const integration = { skip: !fixture, timeout: 180000 };

test("requires an explicit completed gear receipt before reading engine data", () => {
  rejects([], /Pass exactly --gear-review=/);
});
test("rejects unsupported flags", () => {
  rejects(["--gear-review=example-gear.json", "--force"], /Pass exactly --gear-review=/);
});
test("rejects repeated receipt selection", () => {
  rejects(
    ["--gear-review=example-gear.json", "--gear-review=example-gear.json"],
    /Pass exactly --gear-review=/,
  );
});
test("cannot read a receipt outside the optimization archive", () => {
  rejects(["--gear-review=/tmp/outside-gear.json"], /outside its allowed directory/);
});
test("rejects oversized evidence before parsing it", { skip: !existsSync(archive) }, (t) => {
  const temporary = mkdtempSync(join(archive, "coverage-test-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const path = join(temporary, "oversized-gear.json");
  writeFileSync(path, " ".repeat(8_000_001));
  rejects([`--gear-review=${path}`], /Invalid or oversized evidence file/);
});
test(
  "rejects symlink escapes before reading their contents",
  { skip: !existsSync(archive) || process.platform === "win32" },
  (t) => {
    const temporary = mkdtempSync(join(archive, "coverage-test-"));
    const outside = mkdtempSync(join(tmpdir(), "gear-audit-external-"));
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    const target = join(outside, "external.json");
    writeFileSync(target, "not valid JSON: this must never be parsed");
    const path = join(temporary, "escaped-gear.json");
    symlinkSync(target, path);
    rejects([`--gear-review=${path}`], /Evidence symlink escaped its allowed directory/);
  },
);

function alteredFixture(t, mutate) {
  const temporary = mkdtempSync(join(archive, "coverage-test-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const data = globalThis.structuredClone(fixture);
  mutate(data);
  data.report.profiles = [data.wrapper.result];
  const path = join(temporary, "example-gear.json");
  for (const [destination, value] of [
    [path, data.wrapper],
    [path.replace(/-gear\.json$/, "-results.json"), data.report],
    [path + ".checkpoint.json", data.checkpoint],
  ])
    writeFileSync(destination, JSON.stringify(value));
  return [`--gear-review=${path}`];
}

test("replays the real current final sweep and raw independent validations", integration, () => {
  const result = JSON.parse(execute([`--gear-review=${fixture.path}`]).toString());
  assert.equal(result.schema, "kfc-readonly-gear-coverage.v1");
  assert.equal(result.status, "passed");
  assert.equal(result.gearSearchFingerprint, fixture.wrapper.fingerprint);
  assert.equal(result.candidateCountBySlot.length, 17);
  assert(result.groups.length > 0);
  assert(result.rawMetricReferencesByIterations[80] > 0);
  assert(result.rawMetricReferencesByIterations[500] > 0);
  assert(result.rawMetricReferencesByIterations[2000] > 0);
  assert.equal(result.rawMetricReferencesByIterations[100000], 4);
  assert(result.uniqueRawCacheRecords > 0);
  assert.equal(result.validationSeedRanges.length, 6);
  assert.match(result.talentTreeSha256, /^[a-f0-9]{64}$/);
});
test("rejects unfinished gear evidence even when linked reports agree", integration, (t) => {
  const args = alteredFixture(t, (data) => {
    data.wrapper.result.converged = false;
  });
  rejects(args, /Gear search has not converged/);
});
test("rejects an omitted slot candidate, not just inconsistent report hashes", integration, (t) => {
  const args = alteredFixture(t, (data) => {
    const pool = data.wrapper.result.candidateIdsBySlot.find((values) => values.length > 1);
    assert(pool);
    pool.pop();
  });
  rejects(args, /Candidate pool differs for slot/);
});
test("rejects an omitted final group in otherwise self-consistent evidence", integration, (t) => {
  const args = alteredFixture(t, (data) => {
    const comparisons = data.wrapper.result.comparisons;
    const finalPass = Math.max(...comparisons.map((row) => row.pass));
    const index = comparisons.findIndex((row) => row.pass === finalPass);
    comparisons.splice(index, 1);
    data.checkpoint.comparisons = comparisons;
  });
  rejects(args, /Final sweep omitted or reordered a search group/);
});
test(
  "recomputes the numerical fingerprint rather than trusting matching labels",
  integration,
  (t) => {
    const args = alteredFixture(t, (data) => {
      data.wrapper.fingerprint = "0".repeat(64);
      data.report.fingerprint = data.wrapper.fingerprint;
      data.checkpoint.fingerprint = data.wrapper.fingerprint;
    });
    rejects(args, /Gear-search inputs changed/);
  },
);
test("rejects a changed DPS aggregate even when linked reports agree", integration, (t) => {
  const args = alteredFixture(t, (data) => {
    data.wrapper.result.optimizedDps += 0.5;
  });
  rejects(args, /Reported selected DPS average differs from its measurements/);
});
