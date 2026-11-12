import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type { EarlyPreparationCouriers } from "./campaign-early-preparation-source.js";
import { campaignActionZones, campaignZoneId } from "./campaign-geography.js";
import type { EarlyNorthernCourier } from "./campaign-northern-courier.js";
import { campaignGroundJourney } from "./campaign-transport.js";

function ownQuestActions(plan: CampaignPlan, ids: readonly number[]): readonly CampaignAction[] {
  return plan.actions.filter(
    (action) =>
      action.questChanges.length > 0 &&
      action.questChanges.every((change) => ids.includes(change.questId)),
  );
}

function earlyRegion(action: CampaignAction): "western" | "eastern" | null {
  const zones = [
    ...new Set([
      ...campaignActionZones(action),
      ...(action.location ? [campaignZoneId(action.location.zone)] : []),
    ]),
  ];
  if (!zones.length || zones.some((zone) => zone === null)) return null;
  const connected = (origin: string): boolean =>
    zones.every((zone) => {
      const path = campaignGroundJourney(origin, zone!);
      return path !== null && path.every((leg) => leg.mode === "road" || leg.mode === "tram");
    });
  const western = connected("1439"),
    eastern = connected("1453");
  return western === eastern ? null : western ? "western" : "eastern";
}

/** Relocate existing work once, preserving action IDs, native sources and all later pickup gates. */
export function reorderEarlyPreparation(
  plan: CampaignPlan,
  couriers: EarlyPreparationCouriers,
  spiderCamp: CampaignAction,
  northernCourier?: EarlyNorthernCourier | null,
): CampaignPlan | null {
  const northernLeg = plan.legs.find((leg) => leg.id === "northern-approach");
  const wcLeg = plan.legs.find((leg) => leg.id === "wailing-caverns-catchup");
  const defiasLeg = plan.legs.find((leg) => leg.id === "defias-unlock");
  if (
    !northernLeg ||
    !wcLeg ||
    !defiasLeg ||
    wcLeg.optionalQuestId !== 959 ||
    wcLeg.dungeonVisitId !== "wailing-caverns" ||
    plan.legs.some((leg) => leg.id === "eastern-deadmines-preparation")
  )
    return null;
  const northern = plan.actions.filter((action) => action.legId === northernLeg.id);
  const firstEast = northern.findIndex((action) => earlyRegion(action) === "eastern");
  const tail = northern.slice(firstEast);
  const regions = new Map(tail.map((action) => [action.id, earlyRegion(action)]));
  const eastern = tail.filter((action) => regions.get(action.id) === "eastern");
  const western = [
    ...northern.slice(0, firstEast),
    ...tail.filter((action) => regions.get(action.id) === "western"),
  ];
  const courierIds = new Set(northernCourier?.actions.map((action) => action.id) ?? []);
  if (northernCourier) {
    const [pickup, reward] = northernCourier.actions;
    const indices = northernCourier.beforeActionIds.map((id) =>
      western.findIndex((action) => action.id === id),
    );
    if (
      courierIds.size !== 2 ||
      !plan.actions.includes(pickup) ||
      !plan.actions.includes(reward) ||
      indices.some((index) => index < 0) ||
      indices[0]! > indices[1]! ||
      northernCourier.actions.some(
        (action) =>
          action.legId === northernLeg.id ||
          action.questChanges.length !== 1 ||
          action.questChanges[0]!.questId !== 965,
      ) ||
      pickup.questChanges[0]!.state !== "accepted" ||
      reward.questChanges[0]!.state !== "rewarded"
    )
      return null;
    const placed = western.flatMap((action) => [
      ...northernCourier.actions
        .filter((_entry, index) => northernCourier.beforeActionIds[index] === action.id)
        .map((entry) => ({
          ...entry,
          legId: northernLeg.id,
          libraryBackbone: true,
          xpOptional: false,
        })),
      action,
    ]);
    western.splice(0, western.length, ...placed);
  }
  const questRegions = new Map<number, Set<string>>();
  for (const action of northern)
    for (const change of action.questChanges) {
      const region = earlyRegion(action);
      if (region)
        questRegions.set(
          change.questId,
          new Set([...(questRegions.get(change.questId) ?? []), region]),
        );
    }
  if (
    firstEast < 1 ||
    tail.some((action) => regions.get(action.id) === null) ||
    [...questRegions.values()].some((values) => values.size !== 1) ||
    !eastern.length ||
    !eastern.some((action) =>
      action.questChanges.some((change) => change.questId === 132 && change.state === "accepted"),
    ) ||
    !eastern.some((action) =>
      action.questChanges.some((change) => change.questId === 125 && change.state === "rewarded"),
    )
  )
    return null;
  const wc = plan.actions.filter((action) => action.legId === wcLeg.id);
  const gate = wc.find(
    (action) => action.kind === "xp-check" && action.targetStopId === "lordaeron",
  );
  const defias = plan.actions.filter((action) => action.legId === defiasLeg.id);
  const deadminesGate = defias.find(
    (action) => action.kind === "xp-check" && action.targetStopId === "deadmines",
  );
  const gnolls = ownQuestActions(plan, [244, 246]);
  const spiders = ownQuestActions(plan, [245]);
  const cityPickups = ownQuestActions(plan, [167, 2040]).filter(
    (action) =>
      action.legId === defiasLeg.id &&
      action.questChanges.every((change) => change.state === "accepted"),
  );
  const phases = (actions: readonly CampaignAction[]): string =>
    JSON.stringify(
      actions.flatMap((action) =>
        action.questChanges.map((change) => [change.questId, change.state, change.objectiveIndex]),
      ),
    );
  if (
    !gate ||
    !deadminesGate ||
    wc.at(-1)?.id !== gate.id ||
    gnolls.length !== 5 ||
    gnolls.some((action) => action.legId !== "redridge-kill-batch" || !action.source) ||
    phases(gnolls) !==
      JSON.stringify([
        [244, "accepted", null],
        [244, "rewarded", null],
        [246, "accepted", null],
        [246, "objectives-complete", 1],
        [246, "objectives-complete", 2],
        [246, "rewarded", null],
      ]) ||
    phases(spiders) !==
      JSON.stringify([
        [245, "accepted", null],
        [245, "objectives-complete", 1],
        [245, "rewarded", null],
      ]) ||
    spiders.some(
      (action) =>
        !action.source ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        !["preparation", "xp-bridge"].includes(
          plan.legs.find((leg) => leg.id === action.legId)?.kind ?? "",
        ),
    ) ||
    cityPickups.length !== 2 ||
    !plan.actions.some((action) => action.id === "dungeon-deadmines-entry")
  )
    return null;
  const lastWest = western.at(-1);
  const departure =
    lastWest?.location?.zone ?? (lastWest ? campaignActionZones(lastWest)[0] : undefined);
  const outward = departure ? campaignGroundJourney(departure, "1413") : null;
  const north = campaignGroundJourney("1413", "1439");
  const ship = campaignGroundJourney("1439", "1453");
  const redridge = campaignGroundJourney("1453", "1433");
  if (!outward || !north || !ship || !redridge) return null;
  const eastId = "eastern-deadmines-preparation",
    gnollId = "early-redridge-threat",
    spiderId = "early-duskwood-spiders";
  const wcTrip = wc
    .filter((action) => action !== gate)
    .map((action): CampaignAction => {
      if (action.id.endsWith("-approach"))
        return {
          ...action,
          instructions: [
            "Finish the three Wailing Caverns quests while the party is already on Kalimdor. Stay together for Naralex's final event; Mutanus is level 22.",
            "Deviate Hides is not required. Each player still needs their own Port and Glowing Shard.",
            ...outward.map((leg) => leg.instruction),
          ],
        };
      if (action.id.endsWith("-return"))
        return {
          ...action,
          title: "Continue to the eastern quest preparation",
          instructions: [...north, ...ship, ...redridge].map((leg) => leg.instruction),
          location: { zone: "1433", visitOverride: true },
        };
      return action;
    });
  const backbone = (action: CampaignAction, legId: string): CampaignAction => ({
    ...action,
    legId,
    libraryBackbone: true,
    xpOptional: false,
  });
  const defiasBody: CampaignAction[] = [];
  const cityIds = new Set(cityPickups.map((action) => action.id));
  const moved = new Set([...gnolls, ...spiders].map((action) => action.id));
  for (const action of defias) {
    if (action === deadminesGate || cityIds.has(action.id) || moved.has(action.id)) continue;
    if (action.id === "defias-unlock-brief")
      defiasBody.push({
        ...backbone(action, defiasLeg.id),
        instructions: [
          "Return Wiley's Note to Gryan Stoutmantle in Sentinel Hill, then take it on to Mathias Shaw in Stormwind. Deliver Lakeshire's report to General Marcus Jonathan at the city gate on that visit.",
          "Collect the two Stormwind Deadmines quests during this city visit. Return to Westfall for the Messenger and Traitor chain, then keep VanCleef's quest for the later dungeon run.",
        ],
        location: { zone: "1436", visitOverride: true },
      });
    else {
      if (
        action.questChanges.some(
          (change) => change.questId === 135 && change.state === "objectives-complete",
        )
      )
        defiasBody.push(backbone(couriers.reportReturn, defiasLeg.id));
      defiasBody.push(backbone(action, defiasLeg.id));
      if (
        action.questChanges.some((change) => change.questId === 135 && change.state === "rewarded")
      )
        defiasBody.push(...cityPickups.map((entry) => backbone(entry, defiasLeg.id)));
    }
  }
  if (!defiasBody.some((action) => action.id === couriers.reportReturn.id)) return null;
  const easternBody = eastern.flatMap((action): readonly CampaignAction[] => [
    { ...action, legId: eastId },
    ...(action.questChanges.some((change) => change.questId === 132 && change.state === "accepted")
      ? [backbone(couriers.lunchPickup, eastId)]
      : []),
    ...(action.questChanges.some((change) => change.questId === 125 && change.state === "rewarded")
      ? [backbone(couriers.reportPickup, eastId)]
      : []),
  ]);
  const gnollBody = gnolls.flatMap((action): readonly CampaignAction[] => [
    backbone(action, gnollId),
    ...(action.questChanges.some((change) => change.questId === 244 && change.state === "accepted")
      ? [backbone(couriers.lunchReturn, gnollId)]
      : []),
  ]);
  const spiderBody = spiders.flatMap((action): readonly CampaignAction[] => [
    ...(action.questChanges.some((change) => change.state === "objectives-complete")
      ? [spiderCamp]
      : []),
    {
      ...backbone(action, spiderId),
      instructions: action.instructions.map((line) =>
        line === "If Watcher Dodds has been killed due to Stiches, skip this step"
          ? "Wait for Watcher Dodds to return if Stitches has killed him, then accept the quest together."
          : line === "Don't go out of your way to do this quest, skip it if necessary"
            ? "Finish all 15 shared spider kills before returning to Watcher Dodds."
            : line,
      ),
    },
  ]);
  const actions: CampaignAction[] = [];
  for (const action of plan.actions) {
    if (
      action.legId === defiasLeg.id ||
      action.legId === wcLeg.id ||
      moved.has(action.id) ||
      courierIds.has(action.id)
    )
      continue;
    if (action.legId === northernLeg.id) {
      if (action === northern[0])
        actions.push(
          ...western,
          ...wcTrip,
          ...easternBody,
          ...gnollBody,
          ...spiderBody,
          ...defiasBody,
          { ...gate, legId: defiasLeg.id },
        );
      continue;
    }
    if (action.id === "dungeon-deadmines-entry")
      actions.push({ ...deadminesGate, legId: action.legId });
    const current = action;
    actions.push(
      action.id === "redridge-kill-batch-brief"
        ? {
            ...current,
            instructions: [
              "Return to Lakeshire for the Stockade pickup. The gnoll prerequisites were completed during the earlier Redridge visit.",
            ],
          }
        : current,
    );
  }
  const actionIds = (id: string): readonly string[] =>
    actions.filter((action) => action.legId === id).map((action) => action.id);
  const questIds = (id: string): readonly number[] => [
    ...new Set(
      actions
        .filter((action) => action.legId === id)
        .flatMap((action) => action.questChanges.map((change) => change.questId)),
    ),
  ];
  const leg = (id: string, title: string, from: number, to: number): CampaignLeg => ({
    id,
    title,
    from,
    to,
    kind: "preparation",
    stopId: null,
    actionIds: actionIds(id),
    questIds: questIds(id),
    unresolvedQuestIds: [],
  });
  const legs: CampaignLeg[] = [];
  for (const previous of plan.legs) {
    if ([wcLeg.id, defiasLeg.id].includes(previous.id)) continue;
    if (previous.id === northernLeg.id) {
      legs.push({
        ...previous,
        title: "Darkshore: finish the northern tasks",
        to: 17,
        actionIds: actionIds(previous.id),
        questIds: questIds(previous.id),
      });
      legs.push({ ...wcLeg, from: 17, to: 18, actionIds: actionIds(wcLeg.id) });
      legs.push(leg(eastId, "Finish the eastern quest preparation", 17, 18));
      legs.push(leg(gnollId, "Redridge: finish the shared gnoll route", 18, 19));
      legs.push(leg(spiderId, "Duskwood: spiders on the Westfall crossing", 18, 19));
      legs.push({
        ...defiasLeg,
        title: "Westfall: finish the Defias preparation",
        from: 18,
        to: 19,
        actionIds: actionIds(defiasLeg.id),
        questIds: questIds(defiasLeg.id),
      });
    } else
      legs.push({
        ...previous,
        ...(previous.id === "redridge-kill-batch" ? { title: "Lakeshire: Stockade pickup" } : {}),
        actionIds: actionIds(previous.id),
        questIds: questIds(previous.id),
      });
  }
  if (
    new Set(actions.map((action) => action.id)).size !== actions.length ||
    actions.length !== plan.actions.length + 5
  )
    return null;
  return { ...plan, actions, legs };
}
