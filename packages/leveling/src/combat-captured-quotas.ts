import { z } from "zod";
import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";

const id = z.number().int().positive().max(10_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

// Keep only public reference fields from a larger staged page record.
export const capturedKillQuestSchema = z
  .object({
    game: z.literal("forever"),
    kind: z.literal("quest"),
    id,
    name: z.string().min(1).max(300),
    sourceUrl: z.url().max(1500),
    sourceSha256: hash,
    capturedAt: z.iso.datetime(),
    objectives: z.array(z.string().max(12000)).max(100),
  })
  .refine((record) => {
    try {
      const url = new URL(record.sourceUrl);
      return (
        url.protocol === "https:" &&
        url.hostname === "www.wowhead.com" &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^\/forever\/quest=(\d+)(?:\/[^/]+)?\/?$/.exec(url.pathname)?.[1] === String(record.id)
      );
    } catch {
      return false;
    }
  }, "Captured quest URL, edition and identity must agree.");
export type CapturedKillQuest = z.infer<typeof capturedKillQuestSchema>;

export const capturedKillInputSchema = z
  .object({
    schema: z.literal("local-quest-kill-capture-inputs.v1"),
    checkedAt: z.iso.datetime(),
    catalogSha256: hash,
    records: z.array(capturedKillQuestSchema).max(30000),
    missing: z.array(id).max(30000),
  })
  .strict();

export interface CapturedKillQuotaResult {
  readonly quotas: NonNullable<CombatQuestReference["killQuotas"]>;
  readonly held: readonly { readonly objectiveIndex: number; readonly reason: string }[];
}

const normalized = (text: string): string =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Explicit death counters only. Defeat, capture, dialogue and item quantities do not prove kills. */
export function capturedCreatureKillQuotas(
  quest: QuestCatalogEntry,
  capture: CapturedKillQuest,
  npcs: ReadonlyMap<number, Pick<CombatNpc, "name">>,
): CapturedKillQuotaResult {
  if (capture.id !== quest.questId) throw new Error("Captured kill quest identity differs.");
  if (quest.category !== "shared-kills") return { quotas: [], held: [] };
  if (normalized(capture.name) !== normalized(quest.title))
    return {
      quotas: [],
      held: quest.objectives.map((objective) => ({
        objectiveIndex: objective.index,
        reason: "Captured quest title differs from the current provider.",
      })),
    };
  const targets = new Map<string, QuestCatalogEntry["objectives"]>();
  for (const objective of quest.objectives) {
    const name = npcs.get(objective.npcId)?.name;
    if (!name) continue;
    const key = normalized(name);
    targets.set(key, [...(targets.get(key) ?? []), objective]);
  }
  if (!targets.size) return { quotas: [], held: [] };
  const alternatives = [...targets.keys()]
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(
    `(${alternatives})\\s+(?:slain|killed|destroyed)\\s*\\(x?(\\d+)\\)(?=$|[\\s,;.!])`,
    "gi",
  );
  const quotas = new Map<string, CapturedKillQuotaResult["quotas"][number]>();
  const held = new Map<number, string>();
  const source = `Captured death counter: ${capture.sourceUrl}; sha256 ${capture.sourceSha256}; ${capture.capturedAt}`;
  for (const line of capture.objectives) {
    const text = normalized(line);
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(0, match.index);
      if (prefix.trim() && !/[.!?:)]\s*$/.test(prefix)) continue;
      const objectives = targets.get(match[1]!)!;
      const kills = Number(match[2]);
      if (objectives.length !== 1 || kills < 1 || kills > 1000) {
        for (const objective of objectives)
          held.set(
            objective.index,
            objectives.length !== 1
              ? "Captured creature name maps to multiple objectives."
              : "Captured death counter is outside its supported range.",
          );
        continue;
      }
      const objective = objectives[0]!;
      quotas.set(`${objective.index}:${kills}`, {
        objectiveIndex: objective.index,
        npcId: objective.npcId,
        kills,
        source,
      });
    }
  }
  return {
    quotas: [...quotas.values()],
    held: [...held].map(([objectiveIndex, reason]) => ({ objectiveIndex, reason })),
  };
}
