import { z } from "zod";
import { parseClientQuestSnapshots } from "./quest-client-cache.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { questCreatureKillCount } from "./combat-quest-counter.js";

const clientQuestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  level: z.number().int().min(1).max(60),
  minLevel: z.number().int().min(1).max(60),
  objectivesText: z.string().min(1).max(12000),
  sources: z.number().int().positive(),
  objectives: z
    .array(
      z.object({
        id: z.number().int().positive(),
        type: z.literal("monster"),
        typeId: z.literal(0),
        objectId: z.number().int().positive(),
        amount: z.number().int().min(1).max(1000),
        storageIndex: z.number().int().min(0).max(99),
      }),
    )
    .min(1)
    .max(100),
});

interface ClientCounterSource {
  readonly url: string;
  readonly sha256: string;
  readonly clientBuild: string;
  readonly collectedOn: { readonly first: string; readonly last: string };
}

export interface ClientKillCounterResolution {
  readonly questId: number;
  readonly targetBuild: number;
  readonly sources: readonly ClientCounterSource[];
  readonly counters: readonly {
    readonly objectiveIndex: number;
    readonly npcId: number;
    readonly kills: number;
    readonly clientObjectiveId: number;
    readonly storageIndex: number;
  }[];
  readonly previous: { readonly combat: CombatQuestReference; readonly catalog: QuestCatalogEntry };
  readonly attribution: string;
}

const normalized = (text: string): string =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Reconcile selected, already-qualified kill objectives; preserve superseded evidence separately. */
export function reconcileClientKillCounters(input: {
  readonly combat: CombatDataset;
  readonly catalog: QuestCatalog;
  readonly snapshots: readonly unknown[];
  readonly questIds: readonly number[];
}): {
  readonly combat: CombatDataset;
  readonly catalog: QuestCatalog;
  readonly resolutions: readonly ClientKillCounterResolution[];
} {
  const { combat, catalog } = input;
  if (
    combat.targetBuild !== catalog.targetBuild ||
    combat.provider.revision !== catalog.providerRevision ||
    combat.provider.questSha256 !== catalog.questSha256 ||
    combat.provider.npcSha256 !== catalog.npcSha256
  )
    throw new Error(
      "Client counters require matching combat/catalog provider identities and builds.",
    );
  if (
    !input.questIds.length ||
    new Set(input.questIds).size !== input.questIds.length ||
    input.questIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new Error("Client counter selection must contain unique explicit quest IDs.");
  const snapshots = parseClientQuestSnapshots(input.snapshots, combat.targetBuild);
  const builds = snapshots.map((snapshot) => Number(snapshot.document.meta.clientBuild.split(".").at(-1)));
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  const definitions = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const resolutions: ClientKillCounterResolution[] = [];
  for (const questId of input.questIds) {
    const reference = references.get(questId),
      definition = definitions.get(questId);
    if (
      !reference ||
      !definition ||
      !reference.onlyCreatureObjectives ||
      reference.onlyInteractionObjectives ||
      reference.requiredClasses !== 0 ||
      definition.requiredClasses !== 0 ||
      reference.itemCreatureIds.length ||
      reference.itemObjectives?.length ||
      reference.startItem ||
      definition.category !== "shared-kills" ||
      !definition.objectives.length
    )
      throw new Error(`Quest ${questId} is not an existing ordinary creature-kill objective set.`);
    const clients = snapshots.map((snapshot) =>
      clientQuestSchema.parse(snapshot.document.quests[String(questId)]),
    );
    const first = clients[0]!;
    const counters = first.objectives.map((objective, index) => ({
      objectiveIndex: index + 1,
      npcId: objective.objectId,
      kills: objective.amount,
      clientObjectiveId: objective.id,
      storageIndex: objective.storageIndex,
    }));
    if (
      clients.some(
        (quest) =>
          normalized(quest.title) !== normalized(definition.title) ||
          quest.minLevel !== definition.minimumLevel ||
          quest.level !== definition.questLevel ||
          !/\b(?:slay|kill)\b/i.test(quest.objectivesText) ||
          JSON.stringify(quest.objectives) !== JSON.stringify(first.objectives),
      ) ||
      new Set(counters.map((counter) => counter.npcId)).size !== counters.length ||
      new Set(counters.map((counter) => counter.clientObjectiveId)).size !== counters.length ||
      counters.some((counter, index) => counter.storageIndex !== index) ||
      JSON.stringify(reference.creatureIds) !==
        JSON.stringify(counters.map((counter) => counter.npcId)) ||
      definition.objectives.length !== counters.length
    )
      throw new Error(
        `Quest ${questId} has incompatible client identity, objective order, access or counters.`,
      );
    const targets = counters.map((counter) => combat.npcs.find((npc) => npc.id === counter.npcId));
    const targetNames = targets.flatMap((npc) => npc?.name ?? []);
    for (const [index, counter] of counters.entries()) {
      const objective = definition.objectives[index]!;
      const quota = reference.killQuotas?.find(
        (row) => row.objectiveIndex === counter.objectiveIndex,
      );
      const held = reference.killQuotaConflicts?.includes(counter.objectiveIndex);
      if (
        !targets[index] ||
        clients.some(
          (quest) =>
            questCreatureKillCount(targets[index]!, [quest.objectivesText], targetNames) !==
            counter.kills,
        ) ||
        objective.index !== counter.objectiveIndex ||
        objective.npcId !== counter.npcId ||
        (objective.count !== null && objective.count !== counter.kills && !held) ||
        (quota && (quota.npcId !== counter.npcId || (quota.kills !== counter.kills && !held)))
      )
        throw new Error(`Quest ${questId} has an unmatched or unheld conflicting objective.`);
    }
    if (
      reference.killQuotas?.some(
        (row) => !counters.some((counter) => counter.objectiveIndex === row.objectiveIndex),
      ) ||
      reference.killQuotaConflicts?.some(
        (index) => !counters.some((counter) => counter.objectiveIndex === index),
      )
    )
      throw new Error(`Quest ${questId} has an additional unresolved objective.`);
    const sources = snapshots.map((snapshot) => ({
      url: snapshot.sourceUrl,
      sha256: snapshot.sourceSha256,
      clientBuild: snapshot.document.meta.clientBuild,
      collectedOn: snapshot.document.meta.collectedOn,
    }));
    const source = `Server-described client kill counters and matching objective text; matching build ${combat.targetBuild}, later corroboration; ${sources.map((row) => `${row.url}#sha256=${row.sha256}`).join("; ")}; CC BY 4.0, Efficient Games https://efficient.games. Prior conflicting prose is retained in resolution provenance; no current-server payout claim.`;
    references.set(questId, {
      ...reference,
      objectiveText: [clients[builds.indexOf(combat.targetBuild)]!.objectivesText],
      killQuotaConflicts: [],
      killQuotas: counters.map((counter) => ({
        objectiveIndex: counter.objectiveIndex,
        npcId: counter.npcId,
        kills: counter.kills,
        source,
      })),
    });
    definitions.set(questId, {
      ...definition,
      objectives: definition.objectives.map((objective, index) => ({
        ...objective,
        count: counters[index]!.kills,
      })),
      unsupportedRequirements: definition.unsupportedRequirements.filter(
        (requirement) => requirement !== "kill-quota-conflict",
      ),
    });
    resolutions.push({
      questId,
      targetBuild: combat.targetBuild,
      sources,
      counters,
      previous: { combat: reference, catalog: definition },
      attribution: "Data from Efficient Games (https://efficient.games), licensed under CC BY 4.0.",
    });
  }
  const note = `Client kill counters reconciled for quests ${input.questIds.join(",")}; ${snapshots.map((row) => `${row.document.meta.clientBuild} sha256 ${row.sourceSha256}`).join("; ")}. Data from Efficient Games (https://efficient.games), CC BY 4.0. Existing access, reward, drop and prerequisite facts are unchanged.`;
  return {
    combat: {
      ...combat,
      quests: combat.quests.map((quest) => references.get(quest.questId)!),
      provider: {
        ...combat.provider,
        limitations: combat.provider.limitations.includes(note)
          ? combat.provider.limitations
          : [...combat.provider.limitations, note],
      },
    },
    catalog: {
      ...catalog,
      quests: catalog.quests.map((quest) => definitions.get(quest.questId)!),
      authorizationNote: catalog.authorizationNote.includes(note)
        ? catalog.authorizationNote
        : `${catalog.authorizationNote}\n${note}`.trim(),
    },
    resolutions,
  };
}
