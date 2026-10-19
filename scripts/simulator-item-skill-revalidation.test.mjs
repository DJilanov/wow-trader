import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  itemSkillConfirmationVerdict,
  itemSkillSearchPolicy,
  itemSkillSearchContext,
  uniqueItemSkillCandidates,
} from "../infra/simulator/item-skill-revalidation.mjs";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";

const gear = (id) => ({ items: Array.from({ length: 17 }, (_, slot) => ({ id: id + slot })) });
const metrics = (dps, stdev = 1) => [0, 1].map(() => ({ dps, stdev, iterations: 20000 }));

test("share links without UI faction use their reviewed faction, not the editor default", () => {
  const entry = {
    profile: "warrior",
    build: { id: "synthetic-unit-only", faction: "horde", requiresProvisionalEnchantOptIn: false },
    settings: {
      player: {
        race: "RaceOrc",
        profession1: "Engineering",
        profession2: "Blacksmithing",
        equipment: { items: Array.from({ length: 17 }, () => ({})) },
      },
    },
  };
  assert.throws(
    () => itemSkillSearchContext(entry, { items: [] }, new Map(), { enchants: {} }),
    /Illegal correction incumbent/,
  );
  entry.build.faction = "alliance";
  assert.throws(
    () => itemSkillSearchContext(entry, { items: [] }, new Map(), { enchants: {} }),
    /race and faction disagree/,
  );
});

test("correction candidates deduplicate full gear while retaining distinct talents and rotations", () => {
  const initial = { gear: gear(100), label: "incumbent" };
  const candidates = uniqueItemSkillCandidates([
    initial,
    { ...initial, label: "duplicate" },
    { ...initial, talents: "new" },
    { ...initial, rotation: { priorityList: [] } },
  ]);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].label, "incumbent");
  assert.equal(new Set(candidates.map((row) => row.id)).size, 3);
  assert.throws(() => uniqueItemSkillCandidates([{ gear: { items: [] } }]), /Incomplete/);
  assert.equal(initial.id, undefined);
});

test("fresh correction confirmation retains the incumbent on uncertain or contradictory ranges", () => {
  assert.equal(itemSkillConfirmationVerdict(metrics(100), metrics(110)).selected, "candidate");
  assert.equal(itemSkillConfirmationVerdict(metrics(100), metrics(99)).selected, "incumbent");
  assert.equal(
    itemSkillConfirmationVerdict(metrics(100, 50), metrics(100.001, 50)).selected,
    "incumbent",
  );
  const inconsistent = metrics(110);
  inconsistent[1].dps = 99;
  assert.equal(itemSkillConfirmationVerdict(metrics(100), inconsistent).selected, "incumbent");
  assert.equal(itemSkillSearchPolicy.maximumSweeps, 2);
  assert.equal(itemSkillSearchPolicy.retainedMargin, 0.02);
});

test("screening precision and invalid measurements cannot be promoted as correction confirmation", () => {
  for (const change of [{ dps: NaN }, { dps: 0 }, { stdev: -1 }, { iterations: 1000 }]) {
    const invalid = metrics(110);
    Object.assign(invalid[0], change);
    assert.throws(() => itemSkillConfirmationVerdict(metrics(100), invalid));
  }
  assert.throws(() => itemSkillConfirmationVerdict(metrics(100).slice(0, 1), metrics(110)));
});

test("a staged native engine must match its expected hash before any process starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kfc-staged-native-test-"));
  try {
    const binary = join(directory, "not-an-executable");
    await writeFile(binary, "Synthetic unit-test bytes, not a real engine.");
    await assert.rejects(
      openNativeRunners(binary, directory, "a".repeat(64), 1),
      /Staged native engine changed/,
    );
    await assert.rejects(
      openNativeRunners(binary, directory, "invalid", 1),
      /Invalid native engine checksum/,
    );
    await assert.rejects(openNativeRunners(binary, directory, "a".repeat(64), 7));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
