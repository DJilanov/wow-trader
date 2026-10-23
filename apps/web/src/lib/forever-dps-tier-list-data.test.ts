import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import snapshotData from "./data/forever-dps-tier-list.json";
import soloData from "./data/forever-dps-tier-list.solo.json";
import raidData from "./data/forever-dps-tier-list.raid.json";
import { dpsTierSnapshotSchema, type DpsTierSnapshot } from "./forever-dps-tier-list";
import { readDpsTierSnapshot, readDpsTierScenarioSnapshot } from "./forever-dps-tier-list-data";

const paths: string[] = [];
afterEach(async (): Promise<void> => {
  vi.restoreAllMocks();
  await Promise.all(
    paths.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});
const hash = (value: unknown): string =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
interface Fixture {
  readonly directory: string;
  readonly snapshot: DpsTierSnapshot;
  readonly pointer: { schema: string; profiles: Record<string, { path: string; sha256: string }> };
}
function assertSnapshot(value: unknown): asserts value is DpsTierSnapshot {
  dpsTierSnapshotSchema.parse(value);
}
async function fixture(source: unknown = snapshotData): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-tier-list-"));
  paths.push(directory);
  await mkdir(join(directory, "published-reviews"));
  const snapshot: unknown = structuredClone(source);
  assertSnapshot(snapshot);
  const pointer: Fixture["pointer"] = {
    schema: "kfc-published-simulator-reviews.v1",
    profiles: {},
  };
  for (const profile of new Set(snapshot.entries.map((entry): string => entry.profile))) {
    const entries = snapshot.entries.filter((entry): boolean => entry.profile === profile);
    const builds = entries.map((entry) => ({
      id: entry.id,
      href: `/unit/${entry.id}`,
      requiresProvisionalEnchantOptIn: false,
    }));
    const publication = {
      schema: "unit-publication",
      profile,
      presentationRelease: entries[0]!.release,
      builds,
    };
    const sha256 = hash(publication),
      path = `published-reviews/${profile}-${sha256.slice(0, 16)}.json`;
    pointer.profiles[profile] = { path, sha256 };
    await writeFile(join(directory, path), JSON.stringify(publication));
    for (const entry of entries) {
      entry.publicationSha256 = sha256;
      entry.originalHrefSha256 = hash(`/unit/${entry.id}`);
    }
  }
  await writeFile(join(directory, "published-reviews.json"), JSON.stringify(pointer));
  return { directory, snapshot, pointer };
}

describe("tier list publication binding", () => {
  it.each(["solo", "raid"] as const)(
    "authenticates the current %s policy and its published build set",
    async (scenario) => {
      const value = await fixture(scenario === "solo" ? soloData : raidData);
      await expect(
        readDpsTierScenarioSnapshot(scenario, value.directory, value.snapshot),
      ).resolves.toEqual(value.snapshot);
      await expect(
        readDpsTierScenarioSnapshot(
          scenario === "solo" ? "raid" : "solo",
          value.directory,
          value.snapshot,
        ),
      ).resolves.toBeNull();
    },
  );
  it("rejects a re-sealed change to the registered support or boss policy", async () => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    for (const scenario of ["solo", "raid"] as const) {
      const value = await fixture(scenario === "solo" ? soloData : raidData);
      value.snapshot.policy.encounter.duration = 30;
      value.snapshot.policySha256 = hash(value.snapshot.policy);
      for (const entry of value.snapshot.entries) entry.policySha256 = value.snapshot.policySha256;
      await expect(readDpsTierSnapshot(value.directory, value.snapshot)).resolves.not.toBeNull();
      await expect(
        readDpsTierScenarioSnapshot(scenario, value.directory, value.snapshot),
      ).resolves.toBeNull();
    }
  });
  it("accepts a matching published build set without running simulations on page requests", async () => {
    const value = await fixture();
    await expect(readDpsTierSnapshot(value.directory, value.snapshot)).resolves.toEqual(
      value.snapshot,
    );
  });
  it("fails closed on missing evidence, a changed score policy, build link or release", async () => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const value = await fixture();
    await expect(
      readDpsTierSnapshot(value.directory, { ...value.snapshot, policySha256: "0".repeat(64) }),
    ).resolves.toBeNull();
    for (const patch of [
      { originalHrefSha256: "0".repeat(64) },
      { publicationSha256: "0".repeat(64) },
      {
        release: "0".repeat(24),
        benchmarkHref: `/forever-sim/${"0".repeat(24)}/${value.snapshot.entries[0]!.profile}/#unit`,
      },
    ]) {
      const changed = structuredClone(value.snapshot);
      Object.assign(changed.entries[0]!, patch);
      await expect(readDpsTierSnapshot(value.directory, changed)).resolves.toBeNull();
    }
    await writeFile(join(value.directory, "published-reviews.json"), "{}");
    await expect(readDpsTierSnapshot(value.directory, value.snapshot)).resolves.toBeNull();
  });
  it("requires a new benchmark when a class is added to the published library", async () => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const value = await fixture();
    value.pointer.profiles.new_class = {
      path: "published-reviews/new_class-0000000000000000.json",
      sha256: "0".repeat(64),
    };
    await writeFile(join(value.directory, "published-reviews.json"), JSON.stringify(value.pointer));
    await expect(readDpsTierSnapshot(value.directory, value.snapshot)).resolves.toBeNull();
  });
});
