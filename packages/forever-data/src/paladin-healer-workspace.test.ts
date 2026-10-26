import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  paladinHealerLibraryIndexSchema,
  parsePaladinHealerGroupPayload,
} from "./paladin-healer-library-payloads.js";
import {
  configurationForPaladinHealerBuild,
  paladinHealerConfigurationSchema,
  paladinHealerConfigurationSourceProblem,
} from "./paladin-healer-workspace.js";
import {
  paladinHealerPresentationSchema,
  paladinHealerReleaseSchema,
} from "./paladin-healer-release.js";

const fixture = z
  .object({
    assets: z.array(z.object({ ref: z.object({ file: z.string() }), payload: z.unknown() })),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("./fixtures/paladin-healer-library-payloads.v1.json.gz", import.meta.url),
        ),
      ).toString("utf8"),
    ),
  );
const index = paladinHealerLibraryIndexSchema.parse(
  fixture.assets.find((entry) => entry.ref.file === "library-index.json")?.payload,
);
const groups = fixture.assets
  .filter((entry) => entry.ref.file.startsWith("group-"))
  .map((entry) => parsePaladinHealerGroupPayload(index, entry.payload));
const release = "a".repeat(24);
const group = groups[0]!;
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

describe("Paladin version-three workspace source bindings", () => {
  it("reconstructs every complete measured configuration without changing workload identity", () => {
    let count = 0;
    for (const payload of groups)
      for (const source of payload.configurations) {
        const config = configurationForPaladinHealerBuild(
          index,
          payload,
          release,
          source.scenarioId,
        );
        expect(paladinHealerConfigurationSourceProblem(index, payload, config, release)).toBeNull();
        expect(config.sourceRequestBase64).toBe(source.job.requestBase64);
        expect(config.sourceOptionId).toBe(source.optionId);
        expect(config.gear).toEqual(source.option.gear.items);
        expect(config.fields).toEqual(source.option.state.fields);
        expect(config.consumes.manaRegenElixir).toBe(source.option.manaRegenElixir);
        expect(config.consumes.alcohol).toBe(source.option.alcohol);
        expect(hash(JSON.stringify(config.workload))).toBe(source.workloadId);
        expect(paladinHealerConfigurationSchema.parse(config)).toBe(config);
        count++;
      }
    expect(count).toBe(504);
  }, 60_000);

  it("returns editable copies and leaves archived source bytes unchanged", () => {
    const before = JSON.stringify(group);
    const config = configurationForPaladinHealerBuild(index, group, release);
    config.gear[0]!.id = 1;
    config.fields.divineFavor = 0;
    config.workload.priorities[0]!.minimumMissingHealth = 123;
    config.workload.cooldowns.length = 0;
    expect(JSON.stringify(group)).toBe(before);
  });

  it("binds saved builds to release, model, race, scenario and original request", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    for (const changes of [
      { release: "b".repeat(24) },
      { modelIdentity: "0".repeat(64) },
      { race: 100 },
      { scenarioId: "missing-scenario" },
      { sourceRequestBase64: "YQ==" },
      { sourceOptionId: "0".repeat(64) },
      { sourceConfigurationId: "0".repeat(64) },
    ])
      expect(
        paladinHealerConfigurationSourceProblem(index, group, { ...config, ...changes }, release),
      ).not.toBeNull();
  });

  it("rejects changed damage, positioning or duration while allowing personal casting controls", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    const priorities = structuredClone(config);
    priorities.workload.priorities[0]!.minimumMissingHealth += 100;
    expect(paladinHealerConfigurationSourceProblem(index, group, priorities, release)).toBeNull();
    for (const kind of ["damage", "targets", "name"] as const) {
      const changed = structuredClone(config);
      if (kind === "name") changed.workload.name = changed.workload.name.replace("180s", "300s");
      else if (kind === "targets") changed.workload.targets[1]!.x += 10;
      else changed.workload.damage[0]!.amount += 1;
      expect(
        paladinHealerConfigurationSourceProblem(index, group, changed, release),
      ).not.toBeNull();
    }
  });

  it("rejects another configuration version, unknown state and malformed iteration counts", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    for (const changed of [
      { ...config, version: 2 },
      { ...config, unknown: true },
      { ...config, iterations: 0 },
      { ...config, iterations: 10_001 },
    ])
      expect(paladinHealerConfigurationSchema.safeParse(changed).success).toBe(false);
    expect(() => configurationForPaladinHealerBuild(index, group, release, "unknown")).toThrow();
  });
});

describe("Paladin presentation and release contracts", () => {
  const raw = gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healer-presentation.v1.json.gz", import.meta.url)),
  );
  const presentation = paladinHealerPresentationSchema.parse(JSON.parse(raw.toString("utf8")));
  const identity = { bytes: 1, sha256: "b".repeat(64) };
  const manifest = {
    schema: "kfc-paladin-healer-browser-release.v1",
    profile: "healing-paladin",
    release,
    modelIdentity: index.modelIdentity,
    sourceArchiveSha256: index.candidateSha256,
    preparedAt: "2026-10-26T01:00:00Z",
    files: Object.fromEntries(
      [
        "library-index.json",
        "catalog.json",
        "presentation.json",
        "healing.wasm",
        "healing-worker.js",
        "request-codec.js",
        "wasm_exec.js",
      ].map((name) => [name, identity]),
    ),
  };

  it("validates the actual source-derived presentation without omitting talents or item coverage", () => {
    expect(hash(raw)).toBe("caa64f0eafaf3c8bfc45a20bf30c5311e0ae41d3de3389c7d54159a78e054bef");
    expect(presentation.items).toHaveLength(2243);
    expect(presentation.enchants).toHaveLength(101);
    expect(presentation.spells).toHaveLength(21);
    expect(presentation.talents.flatMap((tree) => tree.talents)).toHaveLength(50);
    expect(presentation.scenarios).toHaveLength(28);
  });

  it("rejects duplicate item identities and broken enchant references", () => {
    const duplicate = structuredClone(presentation);
    duplicate.items[1] = duplicate.items[0]!;
    expect(paladinHealerPresentationSchema.safeParse(duplicate).success).toBe(false);
    const missing = structuredClone(presentation);
    missing.items[0]!.enchantIds.push(999_999);
    expect(paladinHealerPresentationSchema.safeParse(missing).success).toBe(false);
  });

  it("requires every engine asset and rejects escaped paths and oversized JSON", () => {
    expect(paladinHealerReleaseSchema.safeParse(manifest).success).toBe(true);
    const absent = structuredClone(manifest);
    delete absent.files["healing.wasm"];
    expect(paladinHealerReleaseSchema.safeParse(absent).success).toBe(false);
    expect(
      paladinHealerReleaseSchema.safeParse({
        ...manifest,
        files: { ...manifest.files, "../evil.json": identity },
      }).success,
    ).toBe(false);
    expect(
      paladinHealerReleaseSchema.safeParse({
        ...manifest,
        files: { ...manifest.files, "catalog.json": { ...identity, bytes: 8_000_001 } },
      }).success,
    ).toBe(false);
    expect(
      paladinHealerReleaseSchema.safeParse({
        ...manifest,
        encodings: { "unknown.js": { br: identity } },
      }).success,
    ).toBe(false);
  });
});
