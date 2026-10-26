import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertPaladinHealerLibraryCandidate,
  resolvePaladinHealerLibraryConfiguration,
} from "./paladin-healing-library.mjs";
import { simulationHash as hash } from "./simulation-fingerprint.mjs";

const bytes = readFileSync(
  new URL("./fixtures/paladin-healing-library-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "6fdd0739773860ac0260149a125bd9742726a96f31f22b8018e9d45c569299e5",
);
const fixture = JSON.parse(gunzipSync(bytes));
const library = fixture.library;

test("the portable library is the exact genuine reviewed export", () => {
  assert.equal(fixture.schema, "kfc-paladin-healing-library-fixture.v1");
  assert.equal(
    fixture.export.byteSha256,
    "092328e2c5e36a481fa3b1c9224f3f1d3c3da139d2f784385f81353b412a1c9b",
  );
  assert.equal(
    fixture.libraryRef.byteSha256,
    "dce293c29e8875d6f0e84cb5b26f54ec5b3759f9fefef02139d2d908dd0dd86f",
  );
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(library) + "\n")
      .digest("hex"),
    fixture.libraryRef.byteSha256,
  );
  assert.equal(fixture.newNumericalRequests, 0);
  assert.equal(fixture.publicationAllowed, false);
  assertPaladinHealerLibraryCandidate(library);
  assert.equal(library.groups.length, 18);
  assert.equal(library.configurations.length, 504);
  assert.equal(library.workloads.length, 330);
  assert.equal(library.catalog.length, 2243);
});

test("all 504 resolved configurations reproduce their complete original source states", () => {
  assert.equal(fixture.checks.length, 504);
  for (const check of fixture.checks) {
    const actual = resolvePaladinHealerLibraryConfiguration(library, check);
    const job = {
      schema: actual.job.schema,
      id: actual.job.id,
      requestBase64: actual.job.requestBase64,
      workload: actual.job.workload,
      detail: actual.job.detail,
    };
    assert.equal(
      hash({
        optionId: actual.optionId,
        option: actual.option,
        job,
        sourceEvidence: actual.sourceEvidence,
        reference: actual.reference,
      }),
      check.expectedSha256,
      check.groupId + "/" + check.scenarioId,
    );
  }
});

test("all eighteen defaults select the actual reference scenario", () => {
  for (const group of library.groups) {
    const actual = resolvePaladinHealerLibraryConfiguration(library, { groupId: group.id });
    assert.equal(actual.scenarioId, "reference");
    assert.equal(actual.configurationId, group.defaultConfigurationId);
    assert.deepEqual(actual.group.context, group.context);
  }
});

test("a mechanics change swaps the whole build instead of retaining another scenario's option", () => {
  const group = library.groups.find(
    (entry) =>
      new Set(
        library.configurations
          .filter((config) => config.groupId === entry.id)
          .map((config) => config.optionId),
      ).size > 1,
  );
  assert(group);
  const configs = library.configurations.filter((entry) => entry.groupId === group.id);
  const first = configs[0],
    second = configs.find((entry) => entry.optionId !== first.optionId);
  assert(second);
  const a = resolvePaladinHealerLibraryConfiguration(library, {
    groupId: group.id,
    scenarioId: first.scenarioId,
  });
  const b = resolvePaladinHealerLibraryConfiguration(library, {
    groupId: group.id,
    scenarioId: second.scenarioId,
  });
  assert.equal(a.optionId, first.optionId);
  assert.equal(b.optionId, second.optionId);
  assert.notEqual(hash(a.option), hash(b.option));
  assert.notEqual(a.job.requestBase64, b.job.requestBase64);
});

test("personal edits cannot mutate any stored option, request or workload", () => {
  const groupId = library.defaultGroupId;
  const original = resolvePaladinHealerLibraryConfiguration(library, { groupId });
  const edited = resolvePaladinHealerLibraryConfiguration(library, { groupId });
  edited.option.gear.items[0].id = 0;
  edited.option.manaRegenElixir = 0;
  edited.job.requestBase64 = "personal-edit";
  edited.job.workload.priorities[0].minimumMissingHealth += 100;
  edited.group.context.professions[0] = 8;
  assert.deepEqual(resolvePaladinHealerLibraryConfiguration(library, { groupId }), original);
  assert(Object.isFrozen(library));
  assert(Object.isFrozen(library.configurations[0].option.gear.items[0]));
});

test("a shallow-frozen incoming library still has every nested value frozen on admission", () => {
  const copy = structuredClone(library);
  Object.freeze(copy);
  assertPaladinHealerLibraryCandidate(copy);
  assert(Object.isFrozen(copy.groups[0].context.professions));
  assert(Object.isFrozen(copy.workloads[0].frame.priorities[0]));
  assert.throws(() => {
    copy.configurations[0].option.gear.items[0].id = 0;
  });
});

test("missing or unknown selections cannot silently fall back to a different build", () => {
  assert.throws(() => resolvePaladinHealerLibraryConfiguration(library, { groupId: "missing" }));
  assert.throws(() =>
    resolvePaladinHealerLibraryConfiguration(library, {
      groupId: library.defaultGroupId,
      scenarioId: "missing",
    }),
  );
  const copy = structuredClone(library);
  copy.groups[0].configurationIds.pop();
  assert.throws(() => assertPaladinHealerLibraryCandidate(copy));
});

test("mismatched saved requests or workload links are rejected", () => {
  const requestCopy = structuredClone(library);
  requestCopy.configurations[0].job.requestBase64 = requestCopy.configurations.find(
    (entry) => entry.job.requestBase64 !== requestCopy.configurations[0].job.requestBase64,
  ).job.requestBase64;
  assert.throws(() => assertPaladinHealerLibraryCandidate(requestCopy));
  const workloadCopy = structuredClone(library);
  workloadCopy.configurations[0].workloadId = workloadCopy.workloads.find(
    (entry) => entry.id !== workloadCopy.configurations[0].workloadId,
  ).id;
  assert.throws(() => assertPaladinHealerLibraryCandidate(workloadCopy));
});

test("mana-elixir settings and Vigil guards cannot be dropped during a library transform", () => {
  const optionCopy = structuredClone(library);
  delete optionCopy.configurations[0].option.manaRegenElixir;
  assert.throws(() => assertPaladinHealerLibraryCandidate(optionCopy));
  const workloadCopy = structuredClone(library);
  const frame = workloadCopy.workloads.find((entry) =>
    entry.frame.priorities.some(
      (priority) => priority.maintainVigil !== undefined || priority.requireVigil !== undefined,
    ),
  );
  assert(frame);
  const priority = frame.frame.priorities.find(
    (entry) => entry.maintainVigil !== undefined || entry.requireVigil !== undefined,
  );
  delete priority.maintainVigil;
  delete priority.requireVigil;
  assert.throws(() => assertPaladinHealerLibraryCandidate(workloadCopy));
});

test("reference means, sample counts and finite metrics remain bound to the original four rounds", () => {
  for (const mutate of [
    (entry) => {
      entry.reference.hps += 1;
    },
    (entry) => {
      entry.reference.iterations += 1;
    },
    (entry) => {
      entry.reference.summaries[0].hps = NaN;
    },
    (entry) => {
      entry.reference.rounds[1].seed = entry.reference.rounds[0].seed;
    },
  ]) {
    const copy = structuredClone(library);
    mutate(copy.configurations[0]);
    assert.throws(() => assertPaladinHealerLibraryCandidate(copy));
  }
});

test("missing selected items and changed acquisition profiles cannot pass admission", () => {
  const itemCopy = structuredClone(library);
  itemCopy.catalog = itemCopy.catalog.filter(
    (entry) => entry.item.id !== itemCopy.configurations[0].option.gear.items[0].id,
  );
  assert.throws(() => assertPaladinHealerLibraryCandidate(itemCopy));
  const profileCopy = structuredClone(library);
  profileCopy.groups[0].context.raceId = 8;
  assert.throws(() => assertPaladinHealerLibraryCandidate(profileCopy));
});

test("a three-minute candidate cannot promote its scope or grant website publication", () => {
  for (const mutate of [
    (entry) => {
      entry.publicationAllowed = true;
    },
    (entry) => {
      entry.websiteAdmissionComplete = true;
    },
    (entry) => {
      entry.fullClassQualified = true;
    },
    (entry) => {
      entry.scope.durationSeconds = 300;
    },
    (entry) => {
      entry.scope.layout = "spread";
    },
    (entry) => {
      entry.scope.fiveMinuteAndSpreadQualification = true;
    },
  ]) {
    const copy = structuredClone(library);
    mutate(copy);
    assert.throws(() => assertPaladinHealerLibraryCandidate(copy));
  }
});
