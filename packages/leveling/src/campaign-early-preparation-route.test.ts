import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import type { EarlyPreparationCouriers } from "./campaign-early-preparation-source.js";
import { reorderEarlyPreparation } from "./campaign-early-preparation-route.js";
import type { EarlyNorthernCourier } from "./campaign-northern-courier.js";

function action(
  id: string,
  legId: string,
  zone: string,
  changes: readonly CampaignQuestChange[] = [],
): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [id],
    questChanges: changes,
    positions: [],
    source: { chapterId: "captured", version: "test", stepId: id },
    kind: changes.length ? "quests" : "instructions",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    location: { zone },
  };
}
function change(
  questId: number,
  state: CampaignQuestChange["state"],
  objectiveIndex: number | null = null,
): CampaignQuestChange {
  return { questId, state, objectiveIndex, title: String(questId) };
}
function fixture(): {
  plan: CampaignPlan;
  couriers: EarlyPreparationCouriers;
  camp: CampaignAction;
} {
  const northern = "northern-approach",
    wc = "wailing-caverns-catchup",
    defias = "defias-unlock";
  const phases: CampaignAction[] = [
    action("north-finish", northern, "1439"),
    action("inn", northern, "1433", [change(65, "rewarded"), change(132, "accepted")]),
    action("town-hall", northern, "1433", [change(125, "rewarded")]),
    action(`${wc}-approach`, wc, "1413"),
    ...[959, 1487, 6981].flatMap((id) =>
      ["accepted", "objectives-complete", "rewarded"].map((state, index) =>
        action(`wc-${id}-${state}`, wc, "1413", [
          change(id, state as CampaignQuestChange["state"], index === 1 ? 1 : null),
        ]),
      ),
    ),
    action(`${wc}-return`, wc, "1439"),
    {
      ...action("northern-gate", wc, "1439"),
      kind: "xp-check",
      targetStopId: "lordaeron",
      targetLevel: 18,
    },
    {
      ...action("dungeon-lordaeron-entry", "dungeon-lordaeron", "1420"),
      kind: "checkpoint",
      targetStopId: "lordaeron",
    },
    action("defias-unlock-brief", defias, "1453"),
    action("city-167", defias, "1453", [change(167, "accepted")]),
    action("city-2040", defias, "1453", [change(2040, "accepted")]),
    action("note-132", defias, "1436", [change(132, "objectives-complete", 1)]),
    action("return-132", defias, "1436", [change(132, "rewarded"), change(135, "accepted")]),
    action("note-135", defias, "1453", [change(135, "objectives-complete", 1)]),
    action("shaw", defias, "1453", [change(135, "rewarded"), change(141, "accepted")]),
    action("return-shaw", defias, "1436", [change(141, "objectives-complete", 1)]),
    action("gryan", defias, "1436", [change(141, "rewarded"), change(142, "accepted")]),
    action("messenger", defias, "1436", [change(142, "objectives-complete", 1)]),
    action("return-message", defias, "1436", [change(142, "rewarded")]),
    action("escort-pickup", defias, "1436", [change(155, "accepted")]),
    action("escort", defias, "1436", [change(155, "objectives-complete", 1)]),
    action("escort-return", defias, "1436", [change(155, "rewarded")]),
    action("vancleef-pickup", defias, "1436", [change(166, "accepted")]),
    {
      ...action("deadmines-departure", defias, "1436"),
      kind: "xp-check",
      targetStopId: "deadmines",
      targetLevel: 20,
    },
    {
      ...action("dungeon-deadmines-entry", "dungeon-deadmines", "1436"),
      kind: "checkpoint",
      targetStopId: "deadmines",
    },
    action("redridge-kill-batch-brief", "redridge-kill-batch", "1433"),
    action("parker", "redridge-kill-batch", "1433", [change(244, "accepted")]),
    action("feldon", "redridge-kill-batch", "1433", [change(244, "rewarded")]),
    action("gnoll-pickup", "redridge-kill-batch", "1433", [change(246, "accepted")]),
    action("gnolls", "redridge-kill-batch", "1433", [
      change(246, "objectives-complete", 1),
      change(246, "objectives-complete", 2),
    ]),
    action("gnoll-return", "redridge-kill-batch", "1433", [change(246, "rewarded")]),
    {
      ...action("stockade-level22", "redridge-kill-batch", "1433"),
      kind: "xp-check",
      targetLevel: 22,
    },
    action("stockade-pickup", "redridge-kill-batch", "1433", [change(386, "accepted")]),
    {
      ...action("dodds", "duskwood-watch", "1431", [change(245, "accepted")]),
      instructions: ["If Watcher Dodds has been killed due to Stiches, skip this step"],
    },
    {
      ...action("spiders", "duskwood-watch", "1431", [change(245, "objectives-complete", 1)]),
      instructions: [
        "Kill Pygmy Venom Web Spiders",
        "Don't go out of your way to do this quest, skip it if necessary",
      ],
    },
    action("dodds-return", "duskwood-watch", "1431", [change(245, "rewarded")]),
    action("night-watch", "duskwood-watch", "1431", [change(56, "accepted")]),
  ];
  const plan: CampaignPlan = {
    release: "test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    actions: phases,
    legs: [...new Set(phases.map((entry) => entry.legId))].map((id) => ({
      id,
      title: id,
      from: 16,
      to: 20,
      kind: id === wc ? "xp-bridge" : "preparation",
      stopId: null,
      ...(id === wc ? { dungeonVisitId: "wailing-caverns", optionalQuestId: 959 } : {}),
      questIds: [
        ...new Set(
          phases.filter((a) => a.legId === id).flatMap((a) => a.questChanges.map((q) => q.questId)),
        ),
      ],
      actionIds: phases.filter((a) => a.legId === id).map((a) => a.id),
      unresolvedQuestIds: [],
    })),
  };
  const couriers: EarlyPreparationCouriers = {
    lunchPickup: action("lunch-pickup", "unused", "1433", [change(129, "accepted")]),
    lunchReturn: action("lunch-return", "unused", "1433", [change(129, "rewarded")]),
    reportPickup: action("report-pickup", "unused", "1433", [change(120, "accepted")]),
    reportReturn: action("report-return", "unused", "1453", [change(120, "rewarded")]),
  };
  const camp = {
    ...action("early-duskwood-spiders-camp", "early-duskwood-spiders", "1431"),
    source: null,
  };
  return { plan, couriers, camp };
}

describe("connected early preparation order", () => {
  it("preserves every original phase and source once, including all real pickup gates", () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = reorderEarlyPreparation(input.plan, input.couriers, input.camp)!;
    expect(result).not.toBeNull();
    expect(result.actions).toHaveLength(input.plan.actions.length + 5);
    expect(new Set(result.actions.map((a) => a.id)).size).toBe(result.actions.length);
    for (const prior of input.plan.actions) {
      const moved = result.actions.find((a) => a.id === prior.id)!;
      expect(moved.questChanges).toEqual(prior.questChanges);
      expect(moved.source).toEqual(prior.source);
      expect(moved.positions).toEqual(prior.positions);
    }
    expect(input).toEqual(before);
    const at = (id: string): number => result.actions.findIndex((a) => a.id === id);
    expect(at("north-finish")).toBeLessThan(at("wailing-caverns-catchup-approach"));
    expect(at("wc-6981-rewarded")).toBeLessThan(at("inn"));
    expect(at("inn")).toBeLessThan(at("lunch-pickup"));
    expect(at("lunch-pickup")).toBeLessThan(at("parker"));
    expect(at("parker")).toBeLessThan(at("lunch-return"));
    expect(at("town-hall")).toBeLessThan(at("report-pickup"));
    expect(at("report-return")).toBeLessThan(at("note-135"));
    expect(at("shaw")).toBeLessThan(at("city-167"));
    expect(at("city-2040")).toBeLessThan(at("return-shaw"));
    expect(at("spiders")).toBeLessThan(at("defias-unlock-brief"));
    expect(at("escort-return")).toBeLessThan(at("northern-gate"));
    expect(at("dungeon-lordaeron-entry")).toBeLessThan(at("deadmines-departure"));
    expect(at("deadmines-departure")).toBeLessThan(at("dungeon-deadmines-entry"));
    expect(at("stockade-level22")).toBeLessThan(at("stockade-pickup"));
    expect(result.actions.find((a) => a.id === "spiders")!.instructions.join(" ")).not.toContain(
      "skip it",
    );
    expect(result.actions.find((a) => a.id === "dodds")!.instructions.join(" ")).not.toContain(
      "skip this step",
    );
    for (const leg of result.legs)
      expect(leg.actionIds).toEqual(
        result.actions.filter((a) => a.legId === leg.id).map((a) => a.id),
      );
  });

  it("takes WC directly from Darkshore and uses the confirmed ship for the eastern return", () => {
    const input = fixture(),
      plan = reorderEarlyPreparation(input.plan, input.couriers, input.camp)!;
    const outward = plan.actions.find((a) => a.id.endsWith("-approach"))!.instructions.join(" ");
    const back = plan.actions
      .find((a) => a.id === "wailing-caverns-catchup-return")!
      .instructions.join(" ");
    expect(outward).toContain("Ashenvale");
    expect(outward).not.toContain("Stormwind Harbor");
    expect(back).toContain("Stormwind Harbor ship");
    expect(back).not.toMatch(/Booty Bay|Stranglethorn/);
  });

  it.each(["later-preparation", "defias-unlock"])("reuses the spider lifecycle already owned by %s exactly once", (owner) => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.map((entry) =>
        entry.questChanges.some((row) => row.questId === 245)
          ? { ...entry, legId: owner, fundingCheckpointId: "later-gate" }
          : entry,
      ),
      legs: owner === "defias-unlock" ? input.plan.legs : [...input.plan.legs, { ...input.plan.legs[0]!, id: owner }],
    };
    const before = structuredClone(plan);
    const result = reorderEarlyPreparation(plan, input.couriers, input.camp)!;
    expect(result).not.toBeNull();
    expect(new Set(result.actions.map((entry) => entry.id)).size).toBe(result.actions.length);
    const spiders = result.actions.filter((entry) =>
      entry.questChanges.some((row) => row.questId === 245),
    );
    expect(spiders.map((entry) => entry.id)).toEqual(["dodds", "spiders", "dodds-return"]);
    expect(spiders.every((entry) => entry.legId === "early-duskwood-spiders")).toBe(true);
    expect(result.actions.indexOf(spiders[2]!)).toBeLessThan(
      result.actions.findIndex((entry) => entry.id === "dungeon-lordaeron-entry"),
    );
    expect(plan).toEqual(before);
  });

  it("keeps later-funded western work before WC rather than mistaking it for the eastern tail", () => {
    const input = fixture();
    const additions = [
      action("later-west-pickup", "northern-approach", "1442", [change(8001, "accepted")]),
      action("later-west-return", "northern-approach", "1413", [change(8001, "rewarded")]),
    ].map((entry) => ({ ...entry, fundingCheckpointId: "northern-gate" }));
    const at = input.plan.actions.findIndex((entry) => entry.id === "town-hall") + 1;
    const plan: CampaignPlan = {
      ...input.plan,
      actions: [...input.plan.actions.slice(0, at), ...additions, ...input.plan.actions.slice(at)],
    };
    const result = reorderEarlyPreparation(plan, input.couriers, input.camp)!;
    expect(result).not.toBeNull();
    const index = (id: string): number => result.actions.findIndex((entry) => entry.id === id);
    expect(index("later-west-return")).toBeLessThan(index("wailing-caverns-catchup-approach"));
    expect(index("wc-6981-rewarded")).toBeLessThan(index("inn"));
    for (const original of plan.actions) {
      const retained = result.actions.filter((entry) => entry.id === original.id);
      expect(retained).toHaveLength(1);
      expect(retained[0]!.questChanges).toEqual(original.questChanges);
      expect(retained[0]!.source).toEqual(original.source);
    }
    expect(
      result.actions
        .find((entry) => entry.id === "wailing-caverns-catchup-approach")!
        .instructions.join(" "),
    ).not.toContain("Follow Darkshore");
  });

  it("places both owned courier phases on the original northern circuit, once and before WC", () => {
    const input = fixture();
    const cave = action("north-cave", "northern-approach", "1439");
    const pickup = action("owned-courier-pickup", "later-courier", "1439", [
      change(965, "accepted"),
    ]);
    const reward = action("owned-courier-return", "later-courier", "1439", [
      change(965, "rewarded"),
    ]);
    const actions = [input.plan.actions[0]!, cave, ...input.plan.actions.slice(1), pickup, reward];
    const plan: CampaignPlan = {
      ...input.plan,
      actions,
      legs: [
        ...input.plan.legs,
        {
          ...input.plan.legs[0]!,
          id: "later-courier",
          questIds: [965],
          actionIds: [pickup.id, reward.id],
        },
      ],
    };
    const courier: EarlyNorthernCourier = {
      actions: [pickup, reward],
      beforeActionIds: ["north-finish", cave.id],
    };
    const before = structuredClone(plan);
    const result = reorderEarlyPreparation(plan, input.couriers, input.camp, courier)!;
    expect(result.actions.slice(0, 4).map((entry) => entry.id)).toEqual([
      pickup.id,
      "north-finish",
      reward.id,
      cave.id,
    ]);
    expect(
      result.actions.filter((entry) => entry.questChanges.some((row) => row.questId === 965)),
    ).toHaveLength(2);
    expect(result.actions.findIndex((entry) => entry.id === reward.id)).toBeLessThan(
      result.actions.findIndex((entry) => entry.id === "wailing-caverns-catchup-approach"),
    );
    expect(result.legs.find((leg) => leg.id === "later-courier")!.questIds).toEqual([]);
    expect(result.legs.find((leg) => leg.id === "northern-approach")!.questIds).toContain(965);
    expect(result.legs.find((leg) => leg.id === "wailing-caverns-catchup")).toMatchObject({
      from: 17,
      to: 18,
    });
    for (const original of [pickup, reward]) {
      const retained = result.actions.find((entry) => entry.id === original.id)!;
      expect(retained.questChanges).toEqual(original.questChanges);
      expect(retained.source).toEqual(original.source);
      expect(retained.positions).toEqual(original.positions);
      expect(retained.xpOptional).toBe(false);
    }
    for (const leg of result.legs)
      expect(leg.actionIds).toEqual(
        result.actions.filter((entry) => entry.legId === leg.id).map((entry) => entry.id),
      );
    for (const beforeActionIds of [
      ["missing", cave.id],
      [cave.id, "north-finish"],
    ] as const)
      expect(
        reorderEarlyPreparation(plan, input.couriers, input.camp, { ...courier, beforeActionIds }),
      ).toBeNull();
    expect(
      reorderEarlyPreparation(plan, input.couriers, input.camp, {
        ...courier,
        actions: [{ ...pickup }, reward],
      }),
    ).toBeNull();
    expect(plan).toEqual(before);
  });

  it.each(["missing-gate", "wrong-gnoll-counter", "missing-spider-source", "already-ordered"])(
    "declines unsupported %s input atomically",
    (kind) => {
      const input = fixture();
      const plan: CampaignPlan = {
        ...input.plan,
        ...(kind === "already-ordered"
          ? {
              legs: [
                ...input.plan.legs,
                { ...input.plan.legs[0]!, id: "eastern-deadmines-preparation" },
              ],
            }
          : {}),
        actions: input.plan.actions
          .filter((a) => kind !== "missing-gate" || a.id !== "deadmines-departure")
          .map((a) =>
            kind === "missing-spider-source" && a.id === "spiders"
              ? { ...a, source: null }
              : kind === "wrong-gnoll-counter" && a.id === "gnolls"
                ? { ...a, questChanges: [change(246, "objectives-complete", 3)] }
                : a,
          ),
      };
      const before = structuredClone(plan);
      expect(reorderEarlyPreparation(plan, input.couriers, input.camp)).toBeNull();
      expect(plan).toEqual(before);
    },
  );
});
