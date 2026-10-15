import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  referenceClientConflicts,
  referenceIndexGaps,
  type ReferenceValidation,
} from "./client-validation.js";
import { referenceKey, type ReferenceRecord, type ReferenceTask } from "./contracts.js";
import { runReferencePublicationCycle } from "./publication.js";
import {
  publishCollectedReferences,
  readApprovedReference,
  readPublishedReference,
  readReferenceIndex,
} from "./store.js";

const roots: string[] = [];
afterEach(async (): Promise<void> => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const task: ReferenceTask = { game: "forever", kind: "item", id: 25 };
function fixture(overrides: Partial<ReferenceRecord> = {}): ReferenceRecord {
  return {
    ...task,
    schema: "wowhead-reference.v1",
    name: "Test Sword",
    sourceUrl: "https://www.wowhead.com/forever/item=25",
    capturedAt: new Date(Date.now() - 5000).toISOString(),
    permissionRef: "test",
    sourceSha256: "a".repeat(64),
    tooltipLines: ["Test Sword", "Item Level 2", "1 - 3 Damage"],
    numericFacts: { classId: 2, subclassId: 7, reqlevel: 1, dmgmin1: 1, dmgmax1: 3, speed: 2 },
    quickFacts: [],
    objectives: [],
    description: "",
    rewards: [],
    relations: [{ relation: "sold-by", kind: "npc", id: 1, name: "Vendor" }],
    ...overrides,
  };
}
async function setup(): Promise<{ staging: string; destination: string; statusPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "reference-publish-"));
  roots.push(root);
  return {
    staging: root,
    destination: join(root, "published"),
    statusPath: join(root, "status.json"),
  };
}
async function stage(root: string, record: ReferenceRecord): Promise<void> {
  await writeFile(join(root, `${referenceKey(record)}.json`), JSON.stringify(record));
}
async function valid(record: ReferenceRecord): Promise<ReferenceValidation> {
  return { conflicts: [], indexGaps: referenceIndexGaps(record) };
}

describe("continuous reference publication", () => {
  it("publishes complete and useful partial records separately; partial never passes approval", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    const partial = fixture({
      id: 26,
      sourceUrl: "https://www.wowhead.com/forever/item=26",
      relations: [],
    });
    await stage(p.staging, partial);
    const result = await publishCollectedReferences(
      p.staging,
      p.destination,
      [task, partial],
      valid,
    );
    expect(result).toMatchObject({ published: 2, complete: 1, partial: 1, held: [] });
    expect((await readApprovedReference(p.destination, task))?.name).toBe("Test Sword");
    expect((await readPublishedReference(p.destination, partial))?.relations).toEqual([]);
    await expect(readApprovedReference(p.destination, partial)).rejects.toThrow(/approved/);
    expect(
      (await publishCollectedReferences(p.staging, p.destination, [task, partial], valid))
        .published,
    ).toBe(0);
  });
  it("holds conflicts, malformed facts, stale records and unresolved tooltips without blocking good records", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    const ids = [26, 27, 28, 29].map((id) => ({ ...task, id }));
    await stage(
      p.staging,
      fixture({ id: 26, sourceUrl: "https://www.wowhead.com/forever/item=26" }),
    );
    await writeFile(join(p.staging, "forever-item-27.json"), "{}");
    await stage(
      p.staging,
      fixture({
        id: 28,
        sourceUrl: "https://www.wowhead.com/forever/item=28",
        capturedAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    await stage(
      p.staging,
      fixture({
        id: 29,
        sourceUrl: "https://www.wowhead.com/forever/item=29",
        tooltipLines: ["Test Sword", "$s1 Damage"],
      }),
    );
    const result = await publishCollectedReferences(
      p.staging,
      p.destination,
      [task, ...ids],
      async (record): Promise<ReferenceValidation> => ({
        conflicts: record.id === 26 ? ["client_name_conflict"] : [],
        indexGaps: referenceIndexGaps(record),
      }),
    );
    expect(result.published).toBe(1);
    expect(result.held).toHaveLength(4);
    expect((await readReferenceIndex(p.destination))?.records.map((row) => row.id)).toEqual([25]);
  });
  it("preserves the last complete reference when a fresh fetch loses fields", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    await publishCollectedReferences(p.staging, p.destination, [task], valid);
    await stage(p.staging, fixture({ relations: [], capturedAt: new Date().toISOString() }));
    const result = await publishCollectedReferences(p.staging, p.destination, [task], valid);
    expect(result.held[0]?.reasons).toEqual(["preserved_complete_record"]);
    expect((await readApprovedReference(p.destination, task))?.relations).toHaveLength(1);
  });
  it("does not replace the public manifest when validation fails midway", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    const second = fixture({ id: 26, sourceUrl: "https://www.wowhead.com/forever/item=26" });
    await stage(p.staging, second);
    await expect(
      publishCollectedReferences(
        p.staging,
        p.destination,
        [task, second],
        async (record): Promise<ReferenceValidation> => {
          if (record.id === 26) throw new Error("Client unavailable");
          return valid(record);
        },
      ),
    ).rejects.toThrow("Client unavailable");
    expect(await readReferenceIndex(p.destination)).toBeNull();
    expect(
      (await publishCollectedReferences(p.staging, p.destination, [task, second], valid)).published,
    ).toBe(2);
  });
  it("resumes bounded publication, skips unchanged files and rechecks a client revision", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    await stage(
      p.staging,
      fixture({ id: 26, sourceUrl: "https://www.wowhead.com/forever/item=26", relations: [] }),
    );
    const options = {
      ...p,
      revision: "build-one",
      limit: 1,
      validator:
        async (): Promise<(record: ReferenceRecord) => ReferenceValidation> =>
        (record): ReferenceValidation => ({ conflicts: [], indexGaps: referenceIndexGaps(record) }),
    };
    expect(await runReferencePublicationCycle(options)).toMatchObject({
      checked: 1,
      published: 1,
      complete: 1,
    });
    expect(await runReferencePublicationCycle(options)).toMatchObject({
      checked: 1,
      published: 1,
      partial: 1,
    });
    expect((await runReferencePublicationCycle(options)).checked).toBe(0);
    expect(
      (await runReferencePublicationCycle({ ...options, revision: "build-two" })).checked,
    ).toBe(1);
    const report = JSON.parse(await readFile(p.statusPath, "utf8")) as {
      checks: Record<string, { status: string }>;
    };
    expect(report.checks["forever-item-26"]?.status).toBe("partial");
  });
  it("keeps edition identities separate and rejects corrupted public files", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    const tbc = fixture({ game: "tbc", sourceUrl: "https://www.wowhead.com/tbc/item=25" });
    await stage(p.staging, tbc);
    await publishCollectedReferences(p.staging, p.destination, [task, tbc], valid);
    expect((await readReferenceIndex(p.destination))?.records).toHaveLength(2);
    const index = await readReferenceIndex(p.destination);
    await writeFile(join(p.destination, "records", `${index!.records[0]!.sha256}.json`), "{}");
    await expect(readPublishedReference(p.destination, task)).rejects.toThrow(/checksum/);
  });
  it("publishes new files ahead of overdue routine rechecks", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    const options = {
      ...p,
      revision: "build-one",
      limit: 1,
      validator:
        async (): Promise<(record: ReferenceRecord) => ReferenceValidation> =>
        (record): ReferenceValidation => ({ conflicts: [], indexGaps: referenceIndexGaps(record) }),
    };
    await runReferencePublicationCycle(options);
    const status = JSON.parse(await readFile(p.statusPath, "utf8")) as {
      checks: Record<string, { nextCheckAt: number }>;
    };
    status.checks["forever-item-25"]!.nextCheckAt = 0;
    await writeFile(p.statusPath, JSON.stringify(status));
    const next = fixture({ id: 99, sourceUrl: "https://www.wowhead.com/forever/item=99" });
    await stage(p.staging, next);
    expect((await runReferencePublicationCycle(options)).published).toBe(1);
    expect(await readPublishedReference(p.destination, next)).not.toBeNull();
  });
  it("rechecks the most overdue record first instead of repeatedly favoring alphabetical IDs", async () => {
    const p = await setup();
    await stage(p.staging, fixture());
    await stage(
      p.staging,
      fixture({ id: 26, sourceUrl: "https://www.wowhead.com/forever/item=26" }),
    );
    const options = {
      ...p,
      revision: "build-one",
      limit: 1,
      validator:
        async (): Promise<(record: ReferenceRecord) => ReferenceValidation> =>
        (record): ReferenceValidation => ({ conflicts: [], indexGaps: referenceIndexGaps(record) }),
    };
    await runReferencePublicationCycle(options);
    await runReferencePublicationCycle(options);
    const status = JSON.parse(await readFile(p.statusPath, "utf8")) as {
      checks: Record<string, { nextCheckAt: number }>;
    };
    const now = Date.now();
    status.checks["forever-item-25"]!.nextCheckAt = now - 1000;
    status.checks["forever-item-26"]!.nextCheckAt = now - 3_600_000;
    await writeFile(p.statusPath, JSON.stringify(status));
    expect((await runReferencePublicationCycle(options)).checked).toBe(1);
    const updated = JSON.parse(await readFile(p.statusPath, "utf8")) as typeof status;
    expect(updated.checks["forever-item-25"]!.nextCheckAt).toBe(now - 1000);
    expect(updated.checks["forever-item-26"]!.nextCheckAt).toBeGreaterThan(now);
  });
});

describe("current-client reference checks", () => {
  const item = {
    itemId: 25,
    name: "Test Sword",
    classId: 2,
    subclassId: 7,
    requiredLevel: 1,
    delayMs: 2000,
    stats: [{ statType: 4, value: 5 }],
    damages: [{ slot: 0, minimum: 1, maximum: 3 }],
  };
  it("blocks mismatched comparable stats and weapon facts", () => {
    expect(
      referenceClientConflicts(
        fixture({ numericFacts: { ...fixture().numericFacts, str: 4 } }),
        item,
      ),
    ).toContain("client_str_conflict");
    expect(
      referenceClientConflicts(
        fixture({ numericFacts: { ...fixture().numericFacts, dmgmax1: 5 } }),
        item,
      ),
    ).toContain("client_dmgmax1_conflict");
    expect(referenceClientConflicts(fixture(), { ...item, name: "Other" })).toContain(
      "client_name_conflict",
    );
  });
  it("allows display but holds indexing when a known client stat is missing", () => {
    expect(referenceClientConflicts(fixture(), item)).toEqual([]);
    expect(referenceIndexGaps(fixture(), item)).toContain("missing_client_detail_str");
    expect(
      referenceIndexGaps(fixture({ numericFacts: { ...fixture().numericFacts, str: 5 } }), item),
    ).toEqual([]);
  });
});
