import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignPlan, type CampaignSource } from "./campaign.js";
import { buildCampaignStarters } from "./campaign-starters.js";

function source(id: number, text: string): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((reference) => reference.sourceId === id)!;
  return { reference, guide: parseGuideChapter(text, reference.id, "a".repeat(64), 70205) };
}
function fixture(
  personal = "step\n.accept 244 >>Accept Encroaching Gnolls\nstep\n.turnin 244 >>Turn in Encroaching Gnolls",
): readonly CampaignSource[] {
  return [
    source(
      115,
      "step\n.accept 783 >>Accept A Threat Within\nstep\n.turnin 783 >>Turn in A Threat Within",
    ),
    source(
      116,
      personal +
        "\nstep << Warrior\n.accept 1638 >>Accept A Warrior's Training\nstep << Warrior\n.turnin 1638 >>Turn in A Warrior's Training",
    ),
    source(
      117,
      "step\n.accept 224 >>Accept In Defense of the King's Lands\nstep\n.complete 224,1 >>Rockjaw Trogg slain (10)\nstep\n.turnin 224 >>Turn in In Defense of the King's Lands",
    ),
    source(
      128,
      "step\n.accept 244 >>Accept Encroaching Gnolls\nstep\n.turnin 244 >>Turn in Encroaching Gnolls\nstep\n.accept 246 >>Accept Assessing the Threat\nstep\n.complete 246,1 >>Redridge Mongrel slain (10)\nstep\n.complete 246,2 >>Redridge Poacher slain (6)\nstep\n.turnin 246 >>Turn in Assessing the Threat",
    ),
  ];
}

describe("starter couriers scheduled with their party follow-up", () => {
  it("keeps the complete Redridge lifecycle and remaps each wholly deferred source bookmark", () => {
    const sources = fixture(),
      before = JSON.stringify(sources);
    const plan = buildCampaignPlan("human", "b".repeat(64), sources, "warrior");
    const phases = plan.actions.flatMap((a) =>
      a.questChanges.filter((c) => c.questId === 244).map((c) => ({ action: a, state: c.state })),
    );
    expect(phases.map((p) => p.state)).toEqual(["accepted", "rewarded"]);
    expect(
      phases.every((p) => !p.action.leaderOnly && p.action.legId === "redridge-kill-batch"),
    ).toBe(true);
    const child = plan.actions.findIndex((a) =>
      a.questChanges.some((c) => c.questId === 246 && c.state === "accepted"),
    );
    expect(plan.actions.indexOf(phases[1]!.action)).toBeLessThan(child);
    const early = sources.find((s) => s.reference.sourceId === 116)!;
    for (const phase of phases) {
      const tag = phase.state === "accepted" ? ".accept" : ".turnin";
      const step = early.guide.steps.find((s) =>
        s.directives.some((d) => d.questId === 244 && d.tag === tag),
      )!;
      expect(plan.bookmarkAliases?.[`start-116-116-${step.id}`]).toBe(phase.action.id);
    }
    expect(
      plan.actions.some((a) => a.leaderOnly && a.questChanges.some((c) => c.questId === 1638)),
    ).toBe(true);
    expect(JSON.stringify(sources)).toBe(before);
  });
  it("uses the same personal quest inventory in the independent starter catalog", () => {
    const sources = fixture(),
      catalog = buildCampaignStarters("b".repeat(64), sources);
    const route = catalog.routes.find((r) => r.race === "human" && r.classSlug === "warrior")!;
    const quests = route.actionIndexes.flatMap((i) =>
      catalog.entries[i]!.action.questChanges.map((c) => c.questId),
    );
    expect(quests).not.toContain(244);
    expect(quests).toContain(1638);
  });
  it("preserves utilities and other quests bundled with a deferred courier", () => {
    const sources = fixture(
      "step\n.accept 244 >>Accept Encroaching Gnolls\n.fp Lakeshire >>Learn the Lakeshire flight path\nstep\n.turnin 244 >>Turn in Encroaching Gnolls\n.accept 300001 >>Accept Independent Task\nstep\n.turnin 300001 >>Turn in Independent Task",
    );
    const plan = buildCampaignPlan("human", "b".repeat(64), sources, "warrior");
    const early = plan.actions.filter((a) => a.leaderOnly);
    expect(early.some((a) => a.title.includes("Learn the Lakeshire flight path"))).toBe(true);
    expect(
      early
        .flatMap((a) => a.questChanges)
        .filter((c) => c.questId === 300001)
        .map((c) => c.state),
    ).toEqual(["accepted", "rewarded"]);
    const bundled = early.find((a) =>
      a.questChanges.some((c) => c.questId === 300001 && c.state === "accepted"),
    )!;
    expect(plan.bookmarkAliases?.[bundled.id]).toBeUndefined();
    expect(bundled.instructions).not.toContain("Turn in Encroaching Gnolls");
  });
  it("retains the original courier when the applicable replacement is absent, skipped or incomplete", () => {
    for (const target of [
      null,
      "step\n.accept 244 >>Accept Encroaching Gnolls",
      "step << skip\n.accept 244 >>Accept Encroaching Gnolls\nstep << skip\n.turnin 244 >>Turn in Encroaching Gnolls",
      "step\n.accept 244 >>Accept Encroaching Gnolls\nstep\n.complete 244,1 >>Other objective\nstep\n.turnin 244 >>Turn in Encroaching Gnolls",
    ]) {
      const sources = [
        ...fixture().filter((s) => s.reference.sourceId !== 128),
        ...(target ? [source(128, target)] : []),
      ];
      const plan = buildCampaignPlan("human", "b".repeat(64), sources, "warrior", {
        starterOnly: true,
      });
      expect(
        plan.actions.some(
          (a) =>
            a.leaderOnly && a.questChanges.some((c) => c.questId === 244 && c.state === "accepted"),
        ),
      ).toBe(true);
    }
  });
});
