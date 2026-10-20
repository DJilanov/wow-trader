import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importSavedHtml, taskFromSavedHtml } from "./manual-capture.js";
import { readStagedReference } from "./store.js";
import { readStagedQuestXp } from "./quest-xp-store.js";
import type { ReferenceTask } from "./contracts.js";

const quest: ReferenceTask = { game: "forever", kind: "quest", id: 4811 };
const capturedAt = "2026-10-17T12:00:00.000Z";

describe("manual saved-page import", () => {
  let root: string;
  let input: string;
  let staging: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "manual-capture-"));
    input = join(root, "pages");
    staging = join(root, "staging");
    await mkdir(input, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("infers the reference identity from the canonical URL", async () => {
    const html = await readFile(new URL("./fixtures/quest-4811-xp.html", import.meta.url), "utf8");
    expect(taskFromSavedHtml(html)).toEqual({
      task: quest,
      canonical: "https://www.wowhead.com/forever/quest=4811/the-red-crystal",
    });
  });

  it("imports a saved quest page and its XP without making a request", async () => {
    const html = await readFile(new URL("./fixtures/quest-4811-xp.html", import.meta.url), "utf8");
    const path = join(input, "the-red-crystal.html");
    await writeFile(path, html);

    const result = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
    });

    expect(result.conflicts).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({ key: "forever-quest-4811", kind: "quest" });

    const record = await readStagedReference(staging, quest);
    expect(record).toMatchObject({
      name: "The Red Crystal",
      permissionRef: "manual-capture-test",
      capturedAt,
      sourceUrl: "https://www.wowhead.com/forever/quest=4811/the-red-crystal",
    });
    const xp = await readStagedQuestXp(staging, quest);
    expect(xp).toMatchObject({ fullXp: 490, questLevel: 14, minimumLevel: 12 });
  });

  it("imports a saved profession listing into separate listing evidence", async () => {
    const html = `
      <link rel="canonical" href="https://www.wowhead.com/forever/spells/professions/alchemy">
      <h1>Alchemy</h1>
      <table>
        <thead><tr><th>Name</th><th>Reagents</th><th>Skill</th><th>Source</th></tr></thead>
        <tbody><tr>
          <td><a href="/forever/spell=2329/elixir">Elixir</a></td>
          <td><a href="/forever/item=2447/peacebloom">Peacebloom</a></td>
          <td>1</td>
          <td>Trainer <a href="/forever/npc=2326/thamner-pol">Thamner Pol</a></td>
        </tr></tbody>
      </table>`;
    const path = join(input, "alchemy-listing.html");
    await writeFile(path, html);

    const result = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
    });

    expect(result.rejected).toEqual([]);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      key: "forever-spell-list-alchemy",
      kind: "spell-list",
    });
    const record = JSON.parse(
      await readFile(join(staging, "listings", "forever-spell-list-alchemy.json"), "utf8"),
    );
    expect(record.entries).toEqual([
      {
        id: 2329,
        name: "Elixir",
        sourceTypes: ["trainer"],
        relations: [{ relation: "taught-by-npc", kind: "npc", id: 2326, name: "Thamner Pol" }],
        teaches: [],
        unresolved: [],
      },
    ]);
  });

  it("skips an unchanged page and reports a conflicting page instead of overwriting it", async () => {
    const html = await readFile(new URL("./fixtures/quest-4811-xp.html", import.meta.url), "utf8");
    const path = join(input, "the-red-crystal.html");
    await writeFile(path, html);
    const first = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
    });
    expect(first.imported).toHaveLength(1);
    const original = await readStagedReference(staging, quest);

    const second = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
    });
    expect(second.imported).toEqual([]);
    expect(second.skipped).toHaveLength(1);

    await writeFile(path, `${html}\n<!-- reviewed page changed -->\n`);
    const conflict = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
    });
    expect(conflict.imported).toEqual([]);
    expect(conflict.conflicts).toHaveLength(1);
    expect(conflict.conflicts[0]?.existingSha256).toBe(original?.sourceSha256);
    expect(await readStagedReference(staging, quest)).toEqual(original);

    const forced = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
      force: true,
    });
    expect(forced.imported).toHaveLength(1);
    const replaced = await readStagedReference(staging, quest);
    expect(replaced?.sourceSha256).not.toBe(original?.sourceSha256);
  });

  it("rejects a saved page without a canonical entity URL", async () => {
    await writeFile(join(input, "challenge.html"), "<html><body>Access denied</body></html>");
    const result = await importSavedHtml({
      input,
      staging,
      permissionRef: "manual-capture-test",
      capturedAt,
    });
    expect(result.imported).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("Reference canonical missing");
  });
});
