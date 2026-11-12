import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { campaignActionZones } from "./campaign-geography.js";

const visitId = "early-scarlet-library";
const returnLegId = "early-scarlet-library-return";
const books = [1050, 96800] as const;

/** Finish Library books and Loksey after the STV circuit, before Drowned City preparation. */
export function stageEarlyScarletLibrary(
  plan: CampaignPlan,
  catalog: QuestCatalog,
  combat: CombatDataset,
): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.targetBuild !== 70205 || catalog.targetBuild !== plan.targetBuild ||
    combat.targetBuild !== plan.targetBuild || plan.legs.some((leg) => leg.id === visitId)) return plan;
  const wanted = [...books, 1052, 1053];
  if (wanted.some((id) => {
    const quest = catalog.quests.find((entry) => entry.questId === id);
    return !quest || quest.requiredClasses !== 0 || quest.minimumLevel === null;
  })) return plan;
  const doan = combat.npcs.find((npc) => npc.id === 6487), loksey = combat.npcs.find((npc) => npc.id === 3974);
  const pastDue = combat.quests.find((quest) => quest.questId === 96800);
  if (doan?.maximumLevel !== 37 || loksey?.maximumLevel !== 34 ||
    !pastDue?.itemObjectives?.some((item) => item.itemId === 273169 && item.quantity === 1 && item.npcIds.includes(6487))) return plan;
  const parentPickup = plan.actions.find((action) => action.questChanges.some((change) => change.questId === 1052 && change.state === "accepted"));
  const departure = plan.actions.find((action) => action.kind === "xp-check" && action.targetStopId === "drowned-city");
  const parentIndex = plan.legs.findIndex((leg) => leg.id === departure?.legId);
  const parent = plan.legs[parentIndex];
  const laterIndex = plan.legs.findIndex((leg) => leg.stopId === "scarlet-monastery" && leg.kind === "dungeon");
  if (!parentPickup || !departure || !parent || !["preparation", "xp-bridge"].includes(parent.kind) || laterIndex <= parentIndex) return plan;
  const indices = plan.actions.flatMap((action, index) => action.legId === parent.id ? [index] : []);
  if (!indices.length || indices.length !== indices.at(-1)! - indices[0]! + 1) return plan;
  const at = plan.actions.indexOf(departure), previous = plan.actions[at - 1]!;
  if (indices.at(-1) !== at || plan.actions.indexOf(parentPickup) >= at || !previous) return plan;
  const origin = previous.location?.zone ?? campaignActionZones(previous)[0];
  const destination = departure.location?.zone ?? campaignActionZones(departure)[0];
  if (!origin || !destination) return plan;
  const one = (questId: number, state: CampaignAction["questChanges"][number]["state"]): CampaignAction | null => {
    const matches = plan.actions.filter((action) => action.questChanges.some((change) => change.questId === questId && change.state === state));
    return matches.length === 1 && matches[0]!.questChanges.length === 1 && !matches[0]!.leaderOnly &&
      !matches[0]!.raidOnly && plan.actions.indexOf(matches[0]!) >= at ? matches[0]! : null;
  };
  const bookPhases = books.map((id) => [one(id, "accepted"), one(id, "objectives-complete"), one(id, "rewarded")] as const);
  const letter = one(1052, "rewarded"), pickup = one(1053, "accepted");
  const work = plan.actions.find((action) => action.questChanges.some((change) => change.questId === 1053 && change.state === "objectives-complete"));
  if (bookPhases.some((phases) => phases.some((action) => action === null)) || !letter || !pickup || !work ||
    !work.wholeQuestObjectives || work.source || work.questChanges.length !== 4 ||
    ![1, 2, 3, 4].every((index) => work.questChanges.some((change) => change.questId === 1053 && change.objectiveIndex === index && change.state === "objectives-complete"))) return plan;
  const selected = bookPhases.map((phases) => phases.map((action) => action!));
  const legs = [
    [origin, "1455"], ["1455", "1424"], ["1424", "1416"], ["1416", "1420"],
    ["1420", "1416"], ["1416", "1455"], ["1455", destination],
  ] as const;
  const paths = legs.map(([from, to]) => campaignGroundJourney(from, to));
  if (paths.some((path) => path === null)) return plan;
  const journey = (index: number, zone: string, title: string): CampaignAction => ({
    id: `${visitId}-travel-${index}`, legId: visitId, title, instructions: paths[index]!.map((link) => link.instruction),
    kind: "instructions", questChanges: [], positions: [], source: null, leaderOnly: false, raidOnly: false,
    targetLevel: null, targetStopId: null, libraryBackbone: true, xpOptional: false, location: { zone, visitOverride: true },
  });
  const moved = (action: CampaignAction, inside = false): CampaignAction => ({
    ...action, legId: visitId, libraryBackbone: true, xpOptional: false,
    ...(inside ? { location: { zone: "1420", insideDungeon: "sm-library" } } : {}),
  });
  const minimumLevel = Math.max(33, ...wanted.map((id) => catalog.quests.find((quest) => quest.questId === id)!.minimumLevel ?? 60));
  const entry: CampaignAction = {
    id: `${visitId}-entry`, legId: visitId, title: `Enter the Library at level ${minimumLevel}`,
    instructions: ["Clear the Library together. Each player loots both books before leaving; keep In the Name of the Light for the later Armory and Cathedral visit."],
    kind: "checkpoint", questChanges: [], positions: [], source: null, leaderOnly: false, raidOnly: false,
    targetLevel: minimumLevel, targetStopId: null, requiredQuestIds: [1052],
    location: { zone: "1420", insideDungeon: "sm-library" }, libraryBackbone: true, xpOptional: false,
  };
  const { wholeQuestObjectives, ...partial } = work;
  if (!wholeQuestObjectives) return plan;
  const lokseyWork: CampaignAction = { ...moved(partial, true), id: `${visitId}-loksey`, combatObjectiveScope: "listed",
    title: "Defeat Houndmaster Loksey", instructions: ["Defeat Houndmaster Loksey for In the Name of the Light. Keep the quest; its other three bosses are in Armory and Cathedral."],
    questChanges: work.questChanges.filter((change) => change.objectiveIndex === 4),
  };
  const trip = [journey(0, "1455", "Collect Mythology of the Titans in Ironforge"), moved(selected[0]![0]!),
    journey(1, "1424", "Deliver Brother Anton's letter in Southshore"), moved(letter), moved(pickup),
    journey(2, "1416", "Collect Past Due from Magus Olvek near Dalaran"), moved(selected[1]![0]!),
    journey(3, "1420", "Travel to Scarlet Monastery: Library"), entry, lokseyWork,
    moved(selected[0]![1]!, true), moved(selected[1]![1]!, true),
    journey(4, "1416", "Return Past Due to Magus Olvek"), moved(selected[1]![2]!),
    journey(5, "1455", "Return Mythology of the Titans in Ironforge"), moved(selected[0]![2]!),
    { ...journey(6, destination, "Return to the Stranglethorn expedition for Drowned City preparation"), positions: departure.positions }];
  const resumedDeparture: CampaignAction = { ...departure, legId: returnLegId, libraryBackbone: true, xpOptional: false };
  const removed = new Set([...selected.flat(), letter, pickup].map((action) => action.id));
  const actions = plan.actions.flatMap((action, index): readonly CampaignAction[] => {
    const insert = index === at ? [...trip, resumedDeparture] : [];
    if (action === departure) return insert;
    if (removed.has(action.id)) return insert;
    if (action === work) return [...insert, { ...partial, combatObjectiveScope: "listed", title: "Finish In the Name of the Light in Armory and Cathedral",
      instructions: ["Defeat Herod, Scarlet Commander Mograine and High Inquisitor Whitemane. Loksey was completed during the earlier Library visit."],
      questChanges: work.questChanges.filter((change) => change.objectiveIndex !== 4) }];
    if (action.id === "dungeon-scarlet-monastery-brief") return [...insert, { ...action,
      title: "Scarlet Monastery: Armory and Cathedral", instructions: ["Complete the remaining three bosses for In the Name of the Light. Both Library books and Loksey were completed on the earlier visit; no Library return is required."] }];
    if (action.id === "dungeon-scarlet-monastery-entry") return [...insert, { ...action,
      title: "Party readiness: Armory and Cathedral", instructions: ["Meet the listed entry level and keep In the Name of the Light active. Finish Herod, Mograine and Whitemane together."] }];
    if (action.id === "dungeon-scarlet-monastery-deliveries") return [...insert, { ...action,
      instructions: ["Return In the Name of the Light to Raleigh the Devout in Southshore. Both book deliveries are already complete.",
        "Continue with Bring the Light and the Razorfen Downs preparation."], location: { zone: "1424" } }];
    return [...insert, action];
  });
  const early: CampaignLeg = { id: visitId, title: "Scarlet Monastery: Library books and Loksey", kind: "dungeon",
    from: minimumLevel, to: minimumLevel + 1, stopId: null, dungeonVisitId: "sm-library", requiredVisit: true,
    questIds: [...wanted], unresolvedQuestIds: [], actionIds: trip.map((action) => action.id) };
  const returned: CampaignLeg = { id: returnLegId, title: "Stranglethorn preparation for the Drowned City", kind: "preparation",
    from: minimumLevel, to: departure.targetLevel ?? minimumLevel + 1, stopId: null, requiredVisit: true,
    questIds: [], unresolvedQuestIds: [], actionIds: [resumedDeparture.id] };
  const updatedLegs = plan.legs.flatMap((leg, index) => index === parentIndex ? [leg, early, returned] : [leg]).map((leg) => {
    const entries = actions.filter((action) => action.legId === leg.id), ids = entries.map((action) => action.id);
    if (leg.id !== plan.legs[laterIndex]!.id && ids.length === leg.actionIds.length && ids.every((id, index) => id === leg.actionIds[index])) return leg;
    const present = new Set(entries.flatMap((action) => action.questChanges.map((change) => change.questId)));
    return { ...leg, ...(leg.id === plan.legs[laterIndex]!.id ? { title: "Scarlet Monastery: Armory and Cathedral" } : {}),
      actionIds: ids, questIds: [...new Set([...leg.questIds.filter((id) => !wanted.includes(id) || present.has(id)), ...present])] };
  });
  return { ...plan, actions, legs: updatedLegs };
}
