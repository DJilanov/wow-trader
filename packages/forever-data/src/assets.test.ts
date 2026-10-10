import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { syncForeverAssets } from "./assets.js";
import type { ForeverExport } from "./schemas.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("Forever asset synchronization", () => {
  it("includes per-class beta spellbook icons and structured Legacy perks", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "forever-assets-beta-"));
    temporaryDirectories.push(outputRoot);
    const data = structuredClone(fixture);
    data.spellbooks.Warrior = {
      race: "",
      level: 60,
      seen: "",
      missing: [],
      general: [["Attack", ""]],
      tabs: [],
      notes: [],
      source: "beta",
      build: "1.60.1.70291",
      icons: { Attack: "inv_sword_04" },
    };
    data.legacy.trees = [
      {
        name: "Adventure",
        icon: "class_warrior",
        perks: [
          {
            name: "Veteran",
            max: 1,
            row: 1,
            col: 1,
            icon: "ability_parry",
            ranks: ["One"],
            gate: 0,
          },
        ],
      },
    ];
    const urls: string[] = [];
    const fetcher: typeof fetch = async (url) => {
      urls.push(String(url));
      return new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { "content-type": "image/jpeg" },
      });
    };
    expect(
      await syncForeverAssets(data, { spellbookIcons: {} }, outputRoot, checksum, fetcher),
    ).toMatchObject({ total: 4, downloaded: 4, missing: [] });
    expect(urls).toContain("https://talentsforever.com/assets/icons/inv_sword_04.jpg");
    expect(urls).toContain("https://talentsforever.com/assets/icons/ability_parry.jpg");
  });

  it("redownloads a file that no longer matches the trusted manifest", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "forever-assets-"));
    temporaryDirectories.push(outputRoot);
    let requests = 0;
    const fetcher: typeof fetch = async () => {
      requests += 1;
      return new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { "content-type": "image/jpeg" },
      });
    };

    const first = await syncForeverAssets(
      fixture,
      { spellbookIcons: {} },
      outputRoot,
      checksum,
      fetcher,
    );
    expect(first).toMatchObject({ total: 2, downloaded: 2, reused: 0, missing: [] });
    expect(requests).toBe(2);

    await writeFile(join(outputRoot, "icons/class_warrior.jpg"), new Uint8Array([1, 2, 3]));
    const second = await syncForeverAssets(
      fixture,
      { spellbookIcons: {} },
      outputRoot,
      checksum,
      fetcher,
    );
    expect(second).toMatchObject({ total: 2, downloaded: 1, reused: 1, missing: [] });
    expect(requests).toBe(3);
    expect(await readFile(join(outputRoot, "icons/class_warrior.jpg"))).toEqual(
      Buffer.from([255, 216, 255, 217]),
    );
  });
});

const checksum = "a".repeat(64);

const fixture: ForeverExport = {
  _readme: "fixture",
  license: "CC-BY-4.0",
  attribution: "fixture",
  generated: "2026-09-16",
  talents: {
    Warrior: {
      icon: "class_warrior",
      source: "fixture",
      trees: [
        {
          name: "Arms",
          bg: 1,
          icon: "class_warrior",
          talents: [],
          removed: [],
        },
      ],
    },
  },
  spellbooks: {},
  spell_desc: {},
  racials: {},
  class_racials: {},
  class_abilities: {},
  legacy: { note: "fixture", trees: [] },
  changelog: [],
};
