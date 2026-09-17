import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TBC_BIS_CLASSES } from "./bis-directory";

const professionSlugs = [
  "alchemy",
  "blacksmithing",
  "cooking",
  "enchanting",
  "engineering",
  "first-aid",
  "jewelcrafting",
  "leatherworking",
  "mining",
  "tailoring",
] as const;

describe("WoW visual assets", () => {
  it("ships every game and tool chooser image locally", () => {
    expect(assetExists("games/tbc-logo.png")).toBe(true);
    expect(assetExists("games/forever-logo.jpg")).toBe(true);
    expect(assetExists("tools/trader.jpg")).toBe(true);
    expect(assetExists("tools/encyclopedia.jpg")).toBe(true);
  });

  it("ships icons for every TBC profession and BiS class entry", () => {
    for (const slug of professionSlugs) expect(assetExists(`professions/${slug}.jpg`)).toBe(true);
    for (const gameClass of TBC_BIS_CLASSES) {
      expect(assetExists(`classes/${gameClass.className.toLowerCase()}.jpg`)).toBe(true);
    }
  });
});

function assetExists(relativePath: string): boolean {
  return existsSync(path.resolve(process.cwd(), "public", "wow-assets", relativePath));
}
