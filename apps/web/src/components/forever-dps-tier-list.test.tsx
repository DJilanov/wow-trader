import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ForeverDpsTierList } from "./forever-dps-tier-list";
import soloData from "../lib/data/forever-dps-tier-list.solo.json";
import raidData from "../lib/data/forever-dps-tier-list.raid.json";
import { dpsTierArtwork } from "../lib/forever-dps-tier-artwork";
import { dpsTierSnapshotSchema, rankDpsTierEntries } from "../lib/forever-dps-tier-list";

describe("server-rendered tier-list board", () => {
  it.each(["solo", "raid"] as const)(
    "renders the %s icon board and readable rankings before hydration",
    (scenario) => {
      const entries = rankDpsTierEntries(
        dpsTierSnapshotSchema.parse(scenario === "solo" ? soloData : raidData),
      );
      const html = renderToStaticMarkup(createElement(ForeverDpsTierList, { entries, scenario }));
      expect(html).toContain("21 measured builds");
      expect(html).toContain("Find a spec or class");
      expect(html).toContain("All classes");
      expect(html).toContain('aria-label="DPS tier board"');
      expect(html.match(/data-tier-build=/g)).toHaveLength(21);
      expect(html.match(/<tr>/g)).toHaveLength(22);
      expect(html).toContain("Detailed DPS rankings");
      expect(html).toContain("Approximate 95% sampling margin");
      expect(html).toContain("Original reviewed build");
      expect(html).toContain(`Simulate ${scenario === "solo" ? "Solo" : "Raid"} setup`);
      expect(html).toContain("/tools/forever-sim/");
      expect(html).not.toContain("helper.kfcguild.online");
      for (const entry of entries) {
        expect(html).toContain(entry.simulatorHref.replaceAll("&", "&amp;"));
        const tile = html.match(
          new RegExp(`<button[^>]*data-tier-build="${entry.id}"[\\s\\S]*?</button>`),
        )?.[0];
        expect(tile).toBeDefined();
        expect(tile).toContain(withTools(dpsTierArtwork(entry).specIcon));
        expect(tile).toContain(withTools(dpsTierArtwork(entry).classIcon));
        expect(tile).toContain(`<strong>${entry.dps.toFixed(1)}</strong>`);
        const tier = html.match(
          new RegExp(`<section[^>]*data-tier="${entry.tier}"[\\s\\S]*?</section>`),
        )?.[0];
        expect(tier).toContain(`data-tier-build="${entry.id}"`);
      }
    },
  );
  it("makes the selected scenario's exact import the primary action", () => {
    const entries = rankDpsTierEntries(dpsTierSnapshotSchema.parse(soloData));
    const html = renderToStaticMarkup(
      createElement(ForeverDpsTierList, { entries, scenario: "solo" }),
    );
    expect(html).toContain("Simulate Solo setup");
    expect(html.indexOf("Simulate Solo setup")).toBeLessThan(
      html.indexOf("Original reviewed build"),
    );
    expect(html).toContain("Save your current simulator character");
  });

  it("ships the original local artwork used by every published tile", async () => {
    const manifest = z
      .object({
        assets: z.array(
          z.object({
            key: z.string().regex(/^[a-z0-9_]+$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        ),
      })
      .parse(
        JSON.parse(
          await readFile(
            new URL("../../public/wow-assets/simulation-icons/manifest.json", import.meta.url),
            "utf8",
          ),
        ),
      );
    for (const asset of manifest.assets) {
      const bytes = await readFile(
        new URL(`../../public/wow-assets/simulation-icons/${asset.key}.jpg`, import.meta.url),
      );
      expect(bytes.length).toBeLessThan(100000);
      expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
    const files = new Set(
      manifest.assets.map((asset) => `/wow-assets/simulation-icons/${asset.key}.jpg`),
    );
    for (const entry of rankDpsTierEntries(dpsTierSnapshotSchema.parse(soloData))) {
      expect(files.has(dpsTierArtwork(entry).specIcon)).toBe(true);
      expect(files.has(dpsTierArtwork(entry).classIcon)).toBe(true);
    }
  });
});

function withTools(path: string): string {
  return `/tools${path}`;
}
