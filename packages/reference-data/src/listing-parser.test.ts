import { describe, expect, it } from "vitest";
import { parseWowheadListing } from "./listing-parser.js";
import type { ListingTask } from "./listing-contracts.js";

const capturedAt = "2026-10-18T12:00:00.000Z";
const spellListing: ListingTask = {
  game: "forever",
  kind: "spell-list",
  path: "/forever/spells/professions/alchemy?filter=20%3B1%3B0",
};
const itemListing: ListingTask = {
  game: "forever",
  kind: "item-list",
  path: "/forever/items/recipes/alchemy",
};

function parseSpell(html: string) {
  return parseWowheadListing(html, spellListing, {
    url: "https://www.wowhead.com/forever/spells/professions/alchemy?filter=20%3B1%3B0",
    capturedAt,
    permissionRef: "test",
  });
}

function parseItem(html: string) {
  return parseWowheadListing(html, itemListing, {
    url: "https://www.wowhead.com/forever/items/recipes/alchemy",
    capturedAt,
    permissionRef: "test",
  });
}

describe("profession listing parser", () => {
  it("extracts an exact trainer relation and ignores reagent links", () => {
    const record = parseSpell(`
      <link rel="canonical" href="https://www.wowhead.com/forever/spells/professions/alchemy">
      <h1>Alchemy</h1>
      <table>
        <thead><tr><th>Name</th><th>Reagents</th><th>Skill</th><th>Source</th></tr></thead>
        <tbody>
          <tr>
            <td><a href="/forever/spell=2329/elixir-of-lions-strength">Elixir of Lion's Strength</a></td>
            <td><a href="/forever/item=2447/peacebloom">Peacebloom</a></td>
            <td>1</td>
            <td>Trainer <a href="/forever/npc=2326/thamner-pol">Thamner Pol</a></td>
          </tr>
          <tr>
            <td><a href="/forever/spell=2330/elixir-of-lesser-agility">Elixir of Lesser Agility</a></td>
            <td><a href="/forever/item=2450/briarthorn">Briarthorn</a></td>
            <td>50</td>
            <td>Vendor <a href="/forever/npc=1234/merchant">Merchant</a></td>
          </tr>
        </tbody>
      </table>
    `);

    expect(record.entries).toHaveLength(2);
    const trainer = record.entries.find((entry) => entry.id === 2329);
    expect(trainer).toMatchObject({
      id: 2329,
      name: "Elixir of Lion's Strength",
      sourceTypes: ["trainer"],
      relations: [{ relation: "taught-by-npc", kind: "npc", id: 2326, name: "Thamner Pol" }],
      unresolved: [],
    });
    const vendor = record.entries.find((entry) => entry.id === 2330);
    expect(vendor).toMatchObject({
      id: 2330,
      sourceTypes: ["vendor"],
      relations: [],
      unresolved: ["source_label_without_exact_relation", "source_relation_requires_detail_page"],
    });
    // The Peacebloom/Briarthorn reagent links must not become spell relations.
    expect(trainer?.relations.some((relation) => relation.id === 2447)).toBe(false);
    expect(vendor?.relations.some((relation) => relation.id === 2450)).toBe(false);
  });

  it("extracts exact item acquisition links and the explicit teaches link", () => {
    const record = parseItem(`
      <link rel="canonical" href="https://www.wowhead.com/forever/items/recipes/alchemy">
      <h1>Alchemy Recipes</h1>
      <table>
        <thead><tr><th>Item</th><th>Source</th><th>Teaches</th></tr></thead>
        <tbody>
          <tr>
            <td><a href="/forever/item=16084/expert-first-aid">Expert First Aid</a></td>
            <td>Vendor <a href="/forever/npc=2326/thamner-pol">Thamner Pol</a></td>
            <td><a href="/forever/spell=3275/linen-bandage">Linen Bandage</a></td>
          </tr>
          <tr>
            <td><a href="/forever/item=16085/recipe">Recipe: Test</a></td>
            <td>Drop <a href="/forever/npc=999/mob">Mob</a></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `);

    const vendor = record.entries.find((entry) => entry.id === 16084);
    expect(vendor).toMatchObject({
      sourceTypes: ["vendor"],
      relations: [{ relation: "sold-by", kind: "npc", id: 2326, name: "Thamner Pol" }],
      teaches: [3275],
      unresolved: [],
    });
    const drop = record.entries.find((entry) => entry.id === 16085);
    expect(drop).toMatchObject({
      sourceTypes: ["drop"],
      relations: [{ relation: "dropped-by", kind: "npc", id: 999, name: "Mob" }],
      teaches: [],
      unresolved: [],
    });
  });

  it("reads exact Listview source objects without treating labels as evidence", () => {
    const record = parseSpell(`
      <link rel="canonical" href="https://www.wowhead.com/forever/spells/professions/alchemy">
      <h1>Alchemy</h1>
      <script>
        new Listview({template:"spell",id:"profession-spells",data:[
          {id:2329,name:"Elixir of Lion's Strength",source:"Trainer",
           sourcemore:[{id:2326,name:"Thamner Pol",type:"npc"}]},
          {id:2330,name:"Elixir of Lesser Agility",source:"Vendor"}
        ]});
      </script>
    `);

    const trainer = record.entries.find((entry) => entry.id === 2329);
    expect(trainer?.relations).toEqual([
      { relation: "taught-by-npc", kind: "npc", id: 2326, name: "Thamner Pol" },
    ]);
    const vendor = record.entries.find((entry) => entry.id === 2330);
    expect(vendor?.relations).toEqual([]);
    expect(vendor?.unresolved).toContain("source_label_without_exact_relation");
  });

  it("reads an item Listview teaches array as an exact teaching-item link", () => {
    const record = parseItem(`
      <link rel="canonical" href="https://www.wowhead.com/forever/items/recipes/alchemy">
      <h1>Alchemy Recipes</h1>
      <script>
        new Listview({template:"item",id:"recipes",data:[
          {id:900,name:"Recipe: Test",source:"Vendor",
           sourcemore:[{id:2,name:"Vendor",type:"npc"}],teaches:[102]}
        ]});
      </script>
    `);

    expect(record.entries[0]).toMatchObject({
      id: 900,
      relations: [{ relation: "sold-by", kind: "npc", id: 2, name: "Vendor" }],
      teaches: [102],
      unresolved: [],
    });
  });

  it("fails closed when the page has no recognizable entries", () => {
    const record = parseSpell(`
      <link rel="canonical" href="https://www.wowhead.com/forever/spells/professions/alchemy">
      <h1>Alchemy</h1>
      <p>No rows here.</p>
    `);
    expect(record.entries).toEqual([]);
    expect(record.warnings).toContain("no_listing_entries");
  });
});
