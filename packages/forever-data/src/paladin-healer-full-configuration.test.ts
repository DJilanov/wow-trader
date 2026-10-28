import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import { parsePaladinHealerFramePayload } from "./paladin-healer-frame.js";
import { parsePaladinHealerFullPresentation } from "./paladin-healer-presentation.js";
import {
  configurationForPaladinHealerFrame,
  paladinHealerFullConfigurationProblem,
} from "./paladin-healer-workspace.js";

function fixture(name: string): Buffer {
  return gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
}
const catalogBody = fixture("paladin-healer-catalog.v2.json.gz");
const catalog = parsePaladinHealerFullCatalog(JSON.parse(catalogBody.toString("utf8")));
const presentation = parsePaladinHealerFullPresentation(
  catalog,
  JSON.parse(fixture("paladin-healer-presentation.v2.json.gz").toString("utf8")),
  createHash("sha256").update(catalogBody).digest("hex"),
);
const envelopes = [
  "paladin-healer-baseline-frames.v2.json.gz",
  "paladin-healer-frames.v2.json.gz",
].map((name) =>
  z
    .object({ assets: z.array(z.object({ payload: z.unknown() })) })
    .parse(JSON.parse(fixture(name).toString("utf8"))),
);
const frames = envelopes.flatMap((envelope) =>
  envelope.assets.map((entry) => parsePaladinHealerFramePayload(entry.payload)),
);
const release = "a".repeat(24);
const frame = frames[0]!;
const items = new Map(presentation.items.map((item) => [item.id, item]));

describe("full Paladin frame configuration admission", () => {
  it("accepts every real baseline and coupled configuration against the full item, talent and profession data", () => {
    let count = 0;
    for (const payload of frames)
      for (const source of payload.configurations) {
        const config = configurationForPaladinHealerFrame(payload, release, source.scenarioId);
        const problem = paladinHealerFullConfigurationProblem(
          catalog,
          presentation,
          payload,
          config,
          release,
        );
        if (problem) throw new Error(payload.frame.id + "/" + source.scenarioId + ": " + problem);
        count++;
      }
    expect(count).toBe(560);
  }, 120_000);

  it("accepts personal choices from the same legal profile without changing the source frame", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    const profile = catalog.profiles.find((entry): boolean => entry.id === frame.frame.profileId)!;
    const head = profile.slots[0]!.find((id): boolean => id !== config.gear[0]!.id)!;
    config.gear[0] = { id: head };
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, config, release),
    ).toBeNull();
  });

  it("rejects another model, profile, race or immutable encounter context", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    expect(
      paladinHealerFullConfigurationProblem(
        { ...catalog, modelIdentity: "0".repeat(64) },
        presentation,
        frame,
        config,
        release,
      ),
    ).not.toBeNull();
    expect(
      paladinHealerFullConfigurationProblem(
        catalog,
        { ...presentation, modelIdentity: "0".repeat(64) },
        frame,
        config,
        release,
      ),
    ).not.toBeNull();
    expect(
      paladinHealerFullConfigurationProblem(
        catalog,
        {
          ...presentation,
          profiles: presentation.profiles.filter(
            (entry): boolean => entry.id !== frame.frame.profileId,
          ),
        },
        frame,
        config,
        release,
      ),
    ).not.toBeNull();
    const changed = structuredClone(config);
    changed.context.raceId = 8;
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, changed, release),
    ).not.toBeNull();
    changed.context.raceId = config.context.raceId;
    changed.workload.damage[0]!.amount += 1;
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, changed, release),
    ).not.toBeNull();
  });

  it("rejects a profession-only item the current profile cannot equip", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    expect(frame.frame.profileId).toBe("1:4,11");
    config.gear[4] = { id: 227803 };
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, config, release),
    ).toContain("selected profession profile");
  });

  it("rejects unsupported enchants, unique duplicates and incompatible hand choices", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    const enchanted = structuredClone(config);
    enchanted.gear[0]!.enchant = 999999;
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, enchanted, release),
    ).not.toBeNull();
    const profile = catalog.profiles.find((entry): boolean => entry.id === frame.frame.profileId)!;
    const ring = profile.slots[10]!.find((id): boolean => Boolean(items.get(id)?.unique));
    if (!ring) throw new Error("Missing actual unique ring candidate");
    const duplicate = structuredClone(config);
    duplicate.gear[10] = { id: ring };
    duplicate.gear[11] = { id: ring };
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, duplicate, release),
    ).not.toBeNull();
    const weapon = profile.slots[14]!.find((id): boolean => Boolean(items.get(id)?.twoHanded));
    if (!weapon) throw new Error("Missing actual two-handed candidate");
    const hands = structuredClone(config);
    hands.gear[14] = { id: weapon };
    expect(hands.gear[15]!.id).not.toBe(0);
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, hands, release),
    ).not.toBeNull();
  });

  it("rejects incomplete talents, unsupported consumes, unavailable spells and resource uses", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    const talents = structuredClone(config);
    talents.fields = {};
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, talents, release),
    ).not.toBeNull();
    const consumes = structuredClone(config);
    consumes.consumes.manaRegenElixir = 1;
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, consumes, release),
    ).toContain("pre-raid consumable");
    const spell = structuredClone(config);
    spell.workload.priorities[0]!.spellId = 999999;
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, spell, release),
    ).toContain("not learned");
    const resource = structuredClone(config);
    resource.workload.cooldowns.push({ spellId: 999999 });
    expect(
      paladinHealerFullConfigurationProblem(catalog, presentation, frame, resource, release),
    ).toContain("supported resource");
  });
});
