import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForeverRaidComposition } from "./forever-raid-composition";
import {
  COMPOSITION_REVISION,
  type CompositionCatalog,
  type CompositionClass,
  type CompositionProfile,
  type CompositionRole,
} from "../lib/forever-raid-composition";

vi.mock("next/image", () => ({
  default: (props: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }): React.JSX.Element =>
    createElement("img", {
      src: props.src,
      alt: props.alt,
      width: props.width,
      height: props.height,
    }),
}));
const rows: readonly [string, CompositionClass, CompositionRole][] = [
  ["tank-warrior", "warrior", "tank"],
  ["tank-druid", "druid", "tank"],
  ["tank-paladin", "paladin", "tank"],
  ["heal-priest", "priest", "healer"],
  ["heal-paladin", "paladin", "healer"],
  ["heal-shaman", "shaman", "healer"],
  ["heal-druid", "druid", "healer"],
  ["paladin-retribution-static", "paladin", "damage"],
  ["fury-standard", "warrior", "damage"],
  ["hunter-marksmanship-static", "hunter", "damage"],
  ["hunter-beast-mastery-static", "hunter", "damage"],
  ["warlock-demonology-static", "warlock", "damage"],
  ["warlock-affliction-static", "warlock", "damage"],
  ["mage-arcane-static", "mage", "damage"],
  ["mage-fire-static", "mage", "damage"],
  ["feral-cat-static", "druid", "damage"],
  ["priest-shadow-static", "priest", "damage"],
  ["shaman-enhancement-static", "shaman", "damage"],
  ["rogue-combat-static", "rogue", "damage"],
];
const profiles: CompositionProfile[] = rows.map(([id, classSlug, role]) => ({
  id,
  name: id,
  classSlug,
  role,
  damageType: role === "tank" || classSlug === "warrior" ? "melee" : "caster",
  icon: `/wow-assets/classes/${classSlug}.jpg`,
  capabilities: [],
  reference: null,
}));
const catalog: CompositionCatalog = {
  revision: COMPOSITION_REVISION,
  profiles,
  measuredAt: null,
  evidence: "unavailable",
};

describe("composition screen before hydration", () => {
  it("renders all three sizes, nine class cards and four real parties with useful controls", () => {
    const html = renderToStaticMarkup(createElement(ForeverRaidComposition, { catalog }));
    expect(html).toContain("Raid size");
    expect(html).toContain("40");
    expect(html.match(/classHeader/g)).toHaveLength(9);
    expect(html.match(/aria-label="Group \d"/g)).toHaveLength(4);
    expect(html.match(/aria-label="Build for group/g)).toHaveLength(20);
    expect(html).toContain("Lock group 1 seat 1");
    expect(html).toContain("Move group 1 seat 1");
    expect(html).toContain("Share composition");
    expect(html).toContain("Protection for trash. Retribution for bosses.");
    expect(html.match(/Protection on trash for group/g)).toHaveLength(2);
    expect(html).toContain("3 tanks on trash");
    expect(html).toContain("2 on bosses");
    expect(html).toContain("Main tank TPS");
    expect(html).not.toContain("Highest selected tank TPS");
    expect(html).toContain("simulation references unavailable");
    expect(html).toContain("Unmeasured DPS");
    expect(html).toContain("Unmeasured TPS");
    expect(html).toContain("Unmeasured HPS");
    expect(html).toContain("does not send Discord messages");
    expect(html).not.toContain("raid DPS:");
  });
  it("keeps source age, healer limits and the single-crit assumption visible", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverRaidComposition, {
        catalog: {
          ...catalog,
          evidence: "historical-reference",
          measuredAt: "2026-10-28T10:00:00Z",
        },
      }),
    );
    expect(html).toContain("measured 2026-10-28");
    expect(html).toContain("stacking verification");
    expect(html).toContain("Healer counts are editable planning inputs");
    expect(html).toContain("required Warrior maintains Sunder");
    expect(html).not.toContain("6% crit");
  });
  it("shows each build's simulated role throughput in class cards, seats and build options", () => {
    const measured = new Map<string, NonNullable<CompositionProfile["reference"]>>([
      [
        "fury-standard",
        {
          value: 862.671,
          unit: "DPS",
          threatPerSecond: 750.899,
          measuredAt: "2026-10-28T10:00:00Z",
          href: "/forever/simulator/warrior",
        },
      ],
      [
        "tank-warrior",
        {
          value: 337.096,
          unit: "DPS",
          threatPerSecond: 831.007,
          measuredAt: "2026-10-28T10:00:00Z",
          href: "/forever/simulator/tank-warrior",
        },
      ],
      [
        "heal-priest",
        {
          value: 662.345,
          unit: "useful HPS",
          measuredAt: "2026-10-28T10:00:00Z",
          href: "/forever/simulator/healing-priest",
        },
      ],
    ]);
    const html = renderToStaticMarkup(
      createElement(ForeverRaidComposition, {
        catalog: {
          ...catalog,
          profiles: profiles.map((profile): CompositionProfile => ({
            ...profile,
            reference: measured.get(profile.id) ?? null,
          })),
        },
      }),
    );
    const classRows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
    const seatHeaders = html.match(/<div class="[^"]*seatTop[^"]*">[\s\S]*?<\/div>/g) ?? [];
    for (const [id, className, label] of [
      ["fury-standard", "Warrior", "862.7 DPS"],
      ["tank-warrior", "Warrior", "831 TPS"],
      ["heal-priest", "Priest", "662.3 HPS"],
    ] as const) {
      expect(classRows.find((row) => row.includes(`>${id}</span>`))).toContain(label);
      expect(html).toContain(`<option value="${id}">${id} · ${className.toLowerCase()} · ${label}`);
      expect(
        seatHeaders.some((header) => header.includes(className) && header.includes(label)),
      ).toBe(true);
    }
    expect(html).toContain("useful healer HPS describe one player");
  });
  it("does not substitute tank damage when a TPS measurement is missing", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverRaidComposition, {
        catalog: {
          ...catalog,
          profiles: profiles.map((profile): CompositionProfile => ({
            ...profile,
            reference:
              profile.id === "tank-warrior"
                ? {
                    value: 337.096,
                    unit: "DPS",
                    measuredAt: "2026-10-28T10:00:00Z",
                    href: "/forever/simulator/tank-warrior",
                  }
                : null,
          })),
        },
      }),
    );
    const row = html
      .match(/<li\b[^>]*>[\s\S]*?<\/li>/g)
      ?.find((item) => item.includes(">tank-warrior</span>"));
    expect(row).toContain("Unmeasured TPS");
    expect(row).not.toContain("337.1 TPS");
    expect(row).not.toContain("0 TPS");
  });
});
