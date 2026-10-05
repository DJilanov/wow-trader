import { createHash } from "node:crypto";
import reviewedReference from "../packages/leveling/src/dungeon-reference.json" with { type: "json" };

export const DUNGEON_REFERENCE_URL =
  "https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location";
const sections = [
  "Ragefire Chasm",
  "The Hall of Thanes",
  "Wailing Caverns",
  "The Deadmines",
  "Ruins of Lordaeron",
  "Shadowfang Keep",
  "Blackfathom Deeps",
  "The Stockades",
  "Excavation Site: Wetlands",
  "Gnomeregan",
  "Razorfen Kraul",
  "Scarlet Monastery",
  "Razorfen Downs",
  "Uldaman",
  "Zul'Farrak",
  "Maraudon",
  "Temple of Atal'Hakkar - Sunken Temple",
  "Blackrock Depths BRD",
  "Dire Maul",
  "Lower Blackrock Spire - LBRS",
  "Scholomance",
  "Stratholme",
  "Upper Blackrock Spire - UBRS",
];
const requiredWings = {
  "Scarlet Monastery": ["All Wings", "Graveyard", "Library"],
  "Dire Maul": [
    "Dire Maul East - Warpwood Quarter Dungeon Quests",
    "Dire Maul West Capital Gardens Dungeon Quests",
    "Dire Maul North - Gordoks Commons Dungeon Quests",
  ],
  Stratholme: ["Stratholme Live Side Quests", "Stratholme Undead Side Quests"],
};
const classes = {
  1: "warrior",
  2: "paladin",
  4: "hunter",
  8: "rogue",
  16: "priest",
  64: "shaman",
  128: "mage",
  256: "warlock",
  1024: "druid",
};
const strip = (value) =>
  value
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function parseDungeonReference(markup, identities, { requireComplete = true } = {}) {
  const associations = [],
    quests = new Map(),
    coverage = new Map(),
    headings = new Set();
  let dungeon = null,
    wing = null;
  for (const token of markup.matchAll(
    /\[h([23])[^\]]*\]([\s\S]*?)\[\/h\1\]|\[tr[^\]]*\]([\s\S]*?)\[\/tr\]/g,
  )) {
    if (token[1]) {
      const heading = strip(token[2]);
      if (token[1] === "2") {
        const match = heading.match(/^(.+?) Dungeon Quests(?:\s*\([\d\s]+\))?$/);
        if (!match) {
          if (/Dungeon Quests/i.test(heading))
            throw new Error(`Unrecognized dungeon heading: ${heading}`);
          dungeon = null;
        } else {
          dungeon = match[1];
          if (!sections.includes(dungeon))
            throw new Error(`Unreviewed dungeon section: ${dungeon}`);
          if (headings.has(dungeon)) throw new Error(`Duplicate dungeon section: ${dungeon}`);
          headings.add(dungeon);
          coverage.set(dungeon, 0);
        }
        wing = null;
      } else {
        wing = heading;
        if (dungeon && requiredWings[dungeon] && !requiredWings[dungeon].includes(wing))
          throw new Error(`Unreviewed wing: ${dungeon} / ${wing}`);
      }
      continue;
    }
    const cells = [...token[3].matchAll(/\[td[^\]]*\]([\s\S]*?)\[\/td\]/g)].map((m) => m[1]);
    const primary = cells[0]?.match(/\[quest(?:=|\s+id=)(\d+)/);
    if (!primary) continue;
    if (!dungeon) throw new Error(`Quest ${primary[1]} outside a reviewed dungeon section`);
    if (cells.length !== 6) throw new Error(`Quest ${primary[1]}: changed table columns`);
    const id = Number(primary[1]),
      identity = identities[id];
    if (!identity || typeof identity.name_enus !== "string" || !identity.name_enus)
      throw new Error(`Quest ${id} is absent from the source identities`);
    const minimumLevel = Number(strip(cells[1]));
    if (!Number.isInteger(minimumLevel) || minimumLevel < 1 || minimumLevel > 60)
      throw new Error(`Quest ${id}: pickup minimum needs review`);
    const faction = { 1: "alliance", 2: "horde", 3: "both" }[identity._side] ?? null;
    const iconFaction =
      /side_alliance/.test(cells[2]) && !/side_horde/.test(cells[2])
        ? "alliance"
        : /side_horde/.test(cells[2]) && !/side_alliance/.test(cells[2])
          ? "horde"
          : null;
    const conflict = Boolean(iconFaction && faction && iconFaction !== faction);
    const quest = {
      id,
      title: identity.name_enus,
      faction: conflict ? null : (faction ?? iconFaction),
      classSlug: identity.reqclass ? (classes[identity.reqclass] ?? null) : null,
      classRestrictionUnresolved:
        Boolean(identity.reqclass && !classes[identity.reqclass]) ||
        /Blacksmith|profession/i.test(strip(cells[5])),
      minimumLevel,
      restrictionNotes: conflict
        ? ["Table faction conflicts with identity metadata; verify eligibility."]
        : [],
    };
    const previous = quests.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(quest))
      throw new Error(`Quest ${id}: conflicting duplicate restrictions`);
    quests.set(id, quest);
    if (
      associations.some((row) => row.dungeon === dungeon && row.wing === wing && row.questId === id)
    )
      throw new Error(`Duplicate quest association: ${dungeon} / ${wing} / ${id}`);
    associations.push({ dungeon, wing, questId: id });
    coverage.set(dungeon, coverage.get(dungeon) + 1);
  }
  if (requireComplete) {
    for (const name of sections)
      if (!coverage.get(name)) throw new Error(`Missing quest section: ${name}`);
    for (const [name, wings] of Object.entries(requiredWings))
      for (const expected of wings)
        if (!associations.some((row) => row.dungeon === name && row.wing === expected))
          throw new Error(`Missing quest wing: ${name} / ${expected}`);
    for (const id of [4768, 4974, 6602, 4764, 5102, 6502])
      if (
        !associations.some(
          (row) => row.dungeon === "Upper Blackrock Spire - UBRS" && row.questId === id,
        )
      )
        throw new Error(`Missing reviewed UBRS quest ${id}`);
    for (const expected of reviewedReference.associations)
      if (
        !associations.some(
          (row) =>
            row.dungeon === expected.dungeon &&
            row.wing === expected.wing &&
            row.questId === expected.questId,
        )
      )
        throw new Error(
          `Reviewed quest row disappeared: ${expected.dungeon} / ${expected.wing} / ${expected.questId}`,
        );
  }
  return { associations, quests: [...quests.values()].sort((a, b) => a.id - b.id) };
}

export function extractDungeonReference(html, reviewedAt) {
  const data = html.match(/WH\.Gatherer\.addData\(5,\s*16,\s*(\{[\s\S]*?\})\);/);
  if (!data) throw new Error("Quest identity metadata is missing; source format needs review.");
  const identities = JSON.parse(data[1]);
  let markup;
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
    for (const candidate of script[1].matchAll(/"(?:\\.|[^"\\])*"/g)) {
      if (!candidate[0].includes("Ragefire") || candidate[0].length < 10_000) continue;
      let value;
      try {
        value = JSON.parse(candidate[0]);
      } catch {
        continue;
      }
      if (value.includes("[table") && value.includes("Dungeon Quests")) {
        if (markup && markup !== value) throw new Error("Ambiguous dungeon markup");
        markup = value;
      }
    }
  if (!markup) throw new Error("Dungeon table markup missing; source format needs review.");
  return {
    schemaVersion: 1,
    source: DUNGEON_REFERENCE_URL,
    reviewedAt,
    ...parseDungeonReference(markup, identities),
    sourceSha256: createHash("sha256").update(JSON.stringify({ markup, identities })).digest("hex"),
  };
}
