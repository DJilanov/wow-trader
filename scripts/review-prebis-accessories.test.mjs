import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(root, "artifacts/forever-simulator/optimization");
const tool = join(root, "scripts/review-prebis-accessories.mjs");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
function execute(args) {
  return execFileSync(process.execPath, [tool, ...args], {
    cwd: root,
    stdio: "pipe",
    timeout: 180000,
    maxBuffer: 1024 * 1024,
  });
}
function rejects(args, pattern) {
  assert.throws(
    () => execute(args),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), pattern);
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
  const candidates = Object.values(state.cases).filter(
    (entry) => entry.status === "reviewed-local",
  );
  const entry = candidates.find((value) => value.entry.id === "fury-horde") ?? candidates[0];
  if (!entry) return null;
  const reference = entry.final.accessories.find((value) =>
    value.path.includes("accessory-trinkets-"),
  );
  if (!reference) return null;
  const path = resolve(root, reference.path);
  return { path, audit: read(path) };
}
const fixture = currentFixture();
const integration = { skip: !fixture, timeout: 180000 };
function altered(t, mutate) {
  const directory = mkdtempSync(join(archive, "accessory-review-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const audit = globalThis.structuredClone(fixture.audit);
  mutate(audit);
  const path = join(directory, "changed-audit.json");
  writeFileSync(path, JSON.stringify(audit));
  return [`--audit=${path}`];
}

test("requires exactly one explicit audit argument before reading evidence", () => {
  for (const args of [[], ["--audit=x.json", "--force"], ["--audit=x.json", "--audit=y.json"]])
    rejects(args, /Pass exactly --audit=/);
});
test("refuses evidence outside its archive", () => {
  rejects(["--audit=/tmp/outside-accessory.json"], /outside its allowed directory/);
});
test("checks evidence size before parsing", { skip: !existsSync(archive) }, (t) => {
  const directory = mkdtempSync(join(archive, "accessory-review-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "oversized.json");
  writeFileSync(path, " ".repeat(8_000_001));
  rejects([`--audit=${path}`], /Invalid or oversized evidence file/);
});
test(
  "refuses archive symlinks escaping to an external file",
  { skip: !existsSync(archive) || process.platform === "win32" },
  (t) => {
    const directory = mkdtempSync(join(archive, "accessory-review-test-"));
    const external = mkdtempSync(join(tmpdir(), "kfc-accessory-review-external-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    t.after(() => rmSync(external, { recursive: true, force: true }));
    const target = join(external, "private.json");
    writeFileSync(target, "invalid JSON that must never be parsed");
    const path = join(directory, "escape.json");
    symlinkSync(target, path);
    rejects([`--audit=${path}`], /Evidence symlink escaped/);
  },
);
test(
  "replays the complete current real ordered-pair screen and all independent comparisons",
  integration,
  () => {
    const result = JSON.parse(execute([`--audit=${fixture.path}`]).toString());
    assert.equal(result.schema, "kfc-readonly-accessory-coverage.v1");
    assert.equal(result.status, "passed");
    assert.equal(result.kind, "trinkets");
    assert.equal(result.screened, fixture.audit.screened.length);
    assert.equal(result.nearCandidates, fixture.audit.challenges.length);
    assert.equal(result.statusReproduced, fixture.audit.status);
    assert(result.uniqueRawCacheRecords >= result.screened);
    assert.equal(result.rawMetricReferencesByIterations[2000], result.screened);
    assert.equal(result.rawMetricReferencesByIterations[100000], 2 + result.nearCandidates * 2);
    assert.equal(result.validationSeedRanges.length, 9);
  },
);
test("rejects unfinished and unsupported audits", integration, (t) => {
  rejects(
    altered(t, (audit) => {
      audit.status = "running";
    }),
    /Accessory audit is not complete/,
  );
  rejects(
    altered(t, (audit) => {
      audit.kind = "weapons";
    }),
    /Unknown accessory kind/,
  );
});
test(
  "rejects altered feedback, input hashes and source identities before trusting measurements",
  integration,
  (t) => {
    rejects(
      altered(t, (audit) => {
        audit.feedbackReviewSha256 = "0".repeat(64);
      }),
      /Feedback receipt changed/,
    );
    rejects(
      altered(t, (audit) => {
        audit.inputHashes[0] = "0".repeat(64);
      }),
      /Accessory input hashes changed/,
    );
    rejects(
      altered(t, (audit) => {
        audit.sourceHashes[Object.keys(audit.sourceHashes)[0]] = "0".repeat(64);
      }),
      /Accessory source changed/,
    );
  },
);
test(
  "rejects an omitted eligible item even if the published rows remain present",
  integration,
  (t) => {
    rejects(
      altered(t, (audit) => {
        audit.eligibleIdsBySlot[0].pop();
      }),
      /Accessory candidate pools changed/,
    );
  },
);
test("rejects missing, reordered or altered raw screen measurements", integration, (t) => {
  rejects(
    altered(t, (audit) => {
      audit.screened.pop();
    }),
    /Incomplete accessory screen/,
  );
  rejects(
    altered(t, (audit) => {
      [audit.screened[0], audit.screened[1]] = [audit.screened[1], audit.screened[0]];
    }),
    /Raw screen mismatch/,
  );
  rejects(
    altered(t, (audit) => {
      audit.screened[0].dps += 0.1;
    }),
    /Raw screen mismatch/,
  );
});
test("requires the complete independently rebuilt shortlist", integration, (t) => {
  assert(fixture.audit.challenges.length > 0);
  rejects(
    altered(t, (audit) => {
      audit.challenges.pop();
    }),
    /Incomplete accessory shortlist/,
  );
});
test(
  "rejects modified precision, confidence thresholds and unsupported gain flags",
  integration,
  (t) => {
    rejects(
      altered(t, (audit) => {
        audit.validationIterations = 20000;
      }),
      /100000/,
    );
    rejects(
      altered(t, (audit) => {
        audit.challenges[0].comparisons[0].threshold += 0.1;
      }),
      /Raw challenger verdict mismatch/,
    );
    rejects(
      altered(t, (audit) => {
        audit.challenges[0].confirmed = !audit.challenges[0].confirmed;
      }),
      /Raw challenger verdict mismatch/,
    );
  },
);
test("does not accept an arbitrary final status as a reconstructed verdict", integration, (t) => {
  rejects(
    altered(t, (audit) => {
      audit.status =
        audit.status === "no-confirmed-challenger"
          ? "challenger-requires-feedback"
          : "no-confirmed-challenger";
    }),
    /Accessory status contradicts raw comparisons/,
  );
});
