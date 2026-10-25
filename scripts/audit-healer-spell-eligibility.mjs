import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  assertPriestHealingPriorityEligibility,
  createPriestHealingSpellPolicy,
  eligiblePriestHealingRanks,
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "../infra/simulator/healer-spell-eligibility.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  pins = new Map();

async function pinned(path, expected) {
  const bytes = await readFile(path),
    checksum = sha(bytes);
  if (expected !== undefined) assert.equal(checksum, expected, path);
  if (pins.has(path)) assert.equal(pins.get(path), checksum, `Input changed: ${path}`);
  pins.set(path, checksum);
  return bytes;
}

async function main() {
  await pinned(fileURLToPath(import.meta.url));
  for (const name of [
    "healer-spell-eligibility.mjs",
    "priest-healing-model.mjs",
    "priest-healing-active-spells-model.mjs",
    "priest-healing-benchmark-model.mjs",
  ])
    await pinned(join(root, "infra/simulator", name));
  const flags = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    const flag = process.argv[index],
      value = process.argv[index + 1];
    assert(["--manifest", "--atlasloot", "--priest-evidence", "--output"].includes(flag));
    assert(value && !value.startsWith("--") && !flags.has(flag), `Invalid ${flag}`);
    flags.set(flag, resolve(value));
  }
  assert.equal(
    flags.size,
    4,
    "Usage: node scripts/audit-healer-spell-eligibility.mjs --manifest <manifest.json> --atlasloot <data.lua> --priest-evidence <spell-source.json[.gz]> --output <new-directory>",
  );
  const manifestPath = flags.get("--manifest"),
    manifestBytes = await pinned(manifestPath),
    manifest = JSON.parse(manifestBytes),
    evidencePath = flags.get("--priest-evidence"),
    evidenceBytes = await pinned(evidencePath),
    evidence = JSON.parse(
      evidencePath.endsWith(".gz")
        ? gunzipSync(evidenceBytes, { maxOutputLength: 32 * 1024 ** 2 })
        : evidenceBytes,
    ),
    atlasBytes = await pinned(flags.get("--atlasloot")),
    atlasSource = atlasBytes.toString("utf8"),
    reference = extractClassicRaidSpellBooks(atlasSource);
  assert.equal(manifest.schema, "forever-mechanics-snapshot.v1");
  const source = {
    build: manifest.build,
    manifest: { path: relative(root, manifestPath), byteSha256: sha(manifestBytes) },
    hotfixSha256: manifest.hotfixSha256,
    definitionsRevision: manifest.definitionsRevision,
  };
  const tables = new Map(),
    tablePins = {};
  for (const name of [
    "ItemSparse",
    "ItemEffect",
    "ItemXItemEffect",
    "SpellEffect",
    "SpellName",
    "SpellLevels",
    "SkillLineAbility",
  ]) {
    const ref = manifest.tables[`${name}.effective`];
    assert(ref && /^[a-f0-9]{64}$/.test(ref.sha256), `Missing effective ${name}`);
    const path = resolve(dirname(manifestPath), ref.path),
      child = relative(dirname(manifestPath), path);
    assert(child && !isAbsolute(child) && child !== ".." && !child.startsWith(".." + sep));
    const raw = gunzipSync(await pinned(path, ref.sha256), { maxOutputLength: 256 * 1024 ** 2 });
    const rows = raw
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(rows.length, ref.recordCount, `${name} row count`);
    tables.set(name, rows);
    tablePins[name] = { ...ref };
  }
  const links = linkClientRaidSpellBooks({ reference, tables, source });
  assert.equal(
    links.unresolved,
    0,
    JSON.stringify(links.books.filter((row) => row.status === "unresolved")),
  );
  const policy = createPriestHealingSpellPolicy(evidence, links),
    options = {
      level: 60,
      talents: { bindingHeal: true, penance: true, prayerOfMending: true, holyNova: true },
      allowConditionalCandidates: true,
    },
    retained = eligiblePriestHealingRanks(policy, options);
  // Exercise the study boundary with every retained rank, not just its highest rank.
  assertPriestHealingPriorityEligibility(
    policy,
    {
      schema: "kfc-healing-workload.v1",
      priorities: retained.map((row) => ({ spellId: row.spellId })),
    },
    options,
  );
  for (const row of policy.ranks.filter((rank) => rank.bookItemId !== null))
    assert.throws(
      () =>
        assertPriestHealingPriorityEligibility(
          policy,
          {
            schema: "kfc-healing-workload.v1",
            priorities: [{ spellId: row.spellId }],
          },
          options,
        ),
      /outside the declared/,
    );

  const bookIds = new Set(reference.books.map((row) => row.itemId)),
    itemLinks = tables.get("ItemXItemEffect").filter((row) => bookIds.has(row.ItemID)),
    effectIds = new Set(itemLinks.map((row) => row.ItemEffectID)),
    itemEffects = tables.get("ItemEffect").filter((row) => effectIds.has(row.id)),
    learningSpellIds = new Set(
      itemEffects.filter((row) => row.TriggerType === 6).map((row) => row.SpellID),
    ),
    readerSpellIds = new Set(
      itemEffects.filter((row) => row.TriggerType === 0).map((row) => row.SpellID),
    ),
    allSpellIds = new Set([...learningSpellIds, ...readerSpellIds]),
    aqStart = atlasSource.indexOf('data["TheRuinsofAhnQiraj"] = {'),
    aqEnd = atlasSource.indexOf('data["TheTempleofAhnQiraj"] = {', aqStart);
  assert(aqStart >= 0 && aqEnd > aqStart);
  const fixture = {
    schema: "kfc-healer-spell-eligibility-source.v1",
    source,
    tablePins,
    atlas: {
      byteSha256: sha(atlasBytes),
      scope: "exact-installed-AQ20-section",
      source: atlasSource.slice(aqStart, aqEnd),
    },
    tables: {
      ItemSparse: tables.get("ItemSparse").filter((row) => bookIds.has(row.id)),
      ItemXItemEffect: itemLinks,
      ItemEffect: itemEffects,
      SpellEffect: tables.get("SpellEffect").filter((row) => readerSpellIds.has(row.SpellID)),
      SpellName: tables.get("SpellName").filter((row) => allSpellIds.has(row.id)),
      SpellLevels: tables.get("SpellLevels").filter((row) => learningSpellIds.has(row.SpellID)),
      SkillLineAbility: tables
        .get("SkillLineAbility")
        .filter((row) => learningSpellIds.has(row.Spell)),
    },
    selectedRowsAreSourceSubsets: true,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
  assert.deepEqual(
    linkClientRaidSpellBooks({
      reference,
      tables: new Map(Object.entries(fixture.tables)),
      source,
    }),
    links,
  );
  for (const [path, checksum] of pins) await pinned(path, checksum);
  const output = flags.get("--output");
  await mkdir(output); // An existing archive is never overwritten.
  const fixtureBytes = gzipSync(JSON.stringify(fixture) + "\n", { level: 9 }),
    policyBytes = Buffer.from(JSON.stringify(policy, null, 2) + "\n");
  await writeFile(join(output, "source.json.gz"), fixtureBytes, { flag: "wx", mode: 0o600 });
  await writeFile(join(output, "priest-policy.json"), policyBytes, { flag: "wx", mode: 0o600 });
  const report = {
    schema: "kfc-healer-spell-eligibility-audit.v1",
    source,
    sourcePins: [...pins].map(([path, byteSha256]) => ({ path: relative(root, path), byteSha256 })),
    links,
    priest: {
      candidateRanks: policy.ranks.length,
      excludedHistoricalRaidBookRanks: policy.ranks.filter((row) => row.bookItemId !== null),
      retainedConditionalCandidates: retained.length,
      defaultVerifiedCandidates: eligiblePriestHealingRanks(policy, { level: 60, talents: {} })
        .length,
      everyRetainedRankPassesBoundary: true,
      everyRaidBookRankRejected: true,
      liveTrainingVerified: false,
    },
    files: [
      { path: "source.json.gz", byteSha256: sha(fixtureBytes) },
      { path: "priest-policy.json", byteSha256: sha(policyBytes) },
    ],
    scope: "AQ20-reference-only; not a complete spell-acquisition or buff audit",
    classClockStarted: false,
    nativeJobs: 0,
    browserJobs: 0,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
  const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(output, "report.json"), reportBytes, { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({
      report: relative(root, join(output, "report.json")),
      byteSha256: sha(reportBytes),
      mappedBooks: links.mapped,
      retainedPriestRanks: retained.length,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
