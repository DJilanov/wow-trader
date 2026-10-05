import { describe, expect, it } from "vitest";
import {
  CHAPTER_REFERENCES,
  LEVELING_RACES,
  FOREVER_XP_CURVE,
  createCharacterProfile,
  getChapterLabel,
  parseGuideChapter,
  type ChapterReference,
} from "@wow-trader/leveling";
import {
  buildChapterPath,
  chapterActivityStats,
  chapterTargetXp,
  estimateChapterMinutes,
  formatChapterMinutes,
  parseChapterPace,
  projectChapterActivity,
} from "./leveling-chapter-path";

const profile = { ...createCharacterProfile(), classSlug: "warrior" as const, xpRate: 1 };
function activity(source: string) {
  return projectChapterActivity(parseGuideChapter(source, "chapter-test", "a".repeat(64), 70205));
}
function chapter(overrides: Partial<ChapterReference> = {}): ChapterReference {
  return {
    id: "chapter-test",
    sourceId: 1,
    title: "1-6 Test",
    factions: ["alliance"],
    family: "questing",
    condition: "",
    defaults: [],
    labels: [],
    next: [],
    xpRates: [],
    ...overrides,
  };
}

describe("full chapter path", () => {
  it("includes the full eligible 1–60 catalog, not just the first unambiguous segment", () => {
    for (const race of LEVELING_RACES) {
      const character = {
        ...createCharacterProfile(race.faction, race.id),
        classSlug: race.classes[0]!,
        xpRate: 1,
      };
      const path = buildChapterPath(CHAPTER_REFERENCES, character, "questing");
      expect(path.some((node) => getChapterLabel(node.chapter, character).minimumLevel === 1)).toBe(
        true,
      );
      expect(
        path.some((node) => getChapterLabel(node.chapter, character).maximumLevel === 60),
      ).toBe(true);
      expect(new Set(path.map((node) => node.chapter.id)).size).toBe(path.length);
      expect(
        path
          .flatMap((node) => node.targets)
          .every((edge) => path.some((node) => node.chapter.id === edge.chapterId)),
      ).toBe(true);
    }
  });
  it("keeps actual alternative continuations rather than selecting one", () => {
    const path = buildChapterPath(CHAPTER_REFERENCES, profile, "questing");
    const loch = path.find((node) => node.chapter.id === "chapter-117-11-13-loch-modan")!;
    expect(loch.targets.map((target) => target.chapterId)).toEqual([
      "chapter-125-13-15-westfall",
      "chapter-126-14-16-darkshore",
    ]);
  });
  it("preserves conditional, missing and cyclic edges without inventing or recursively duplicating nodes", () => {
    const a = chapter({
      next: [
        { value: "6-8 Next", condition: "Mage" },
        { value: "9-10 Missing", condition: "" },
      ],
    });
    const b = chapter({
      id: "chapter-next",
      sourceId: 2,
      title: "6-8 Next",
      next: [{ value: a.title, condition: "" }],
    });
    const path = buildChapterPath([a, b], { ...profile, classSlug: null }, "questing");
    expect(path).toHaveLength(2);
    expect(path[0]?.targets).toEqual([{ chapterId: b.id, conditional: true }]);
    expect(path[0]?.missingTargets).toEqual(["9-10 Missing"]);
    expect(path[1]?.targets).toEqual([{ chapterId: a.id, conditional: false }]);
    expect(buildChapterPath([a, b], profile, "questing")[0]?.targets).toEqual([]);
  });
  it("does not connect adjacent level ranges without a source edge", () => {
    const path = buildChapterPath(
      [chapter(), chapter({ id: "chapter-later", sourceId: 2, title: "6-10 Next" })],
      profile,
      "questing",
    );
    expect(path.every((node) => node.targets.length === 0)).toBe(true);
  });
});

describe("chapter quest activity", () => {
  it("deduplicates quests and hand-ins rather than counting objective rows or source steps", () => {
    const stats = chapterActivityStats(
      activity(
        "step\n.accept 7\n.complete 7,1\n.complete 7,2\n.turnin 7\nstep\n.turnin 7\n.accept 783\n.abandon 999\n.isOnQuest 999",
      ),
      profile,
    );
    expect(stats).toMatchObject({
      questCount: 2,
      handInCount: 1,
      conditionalQuestCount: 0,
      referenceRewardXp: null,
      knownRewardCount: 0,
    });
  });
  it("retains class/rate/season/dungeon controls but never sends guide text or map data", () => {
    const source =
      "step << Mage\n.accept 7 >>Private guide prose\nstep\n#season 2\n.accept 8\nstep\n.dungeon DM\n.accept 9\nstep\n#xprate <1.5\n.accept 10\nstep\n#optional\n.accept 11\n.goto Elwynn Forest,1,2";
    const projected = activity(source);
    expect(JSON.stringify(projected)).not.toContain("Private guide prose");
    expect(JSON.stringify(projected)).not.toContain("Elwynn");
    expect(chapterActivityStats(projected, profile)).toMatchObject({
      questCount: 2,
      optionalQuestCount: 1,
      conditionalQuestCount: 0,
    });
    expect(
      chapterActivityStats(projected, { ...profile, classSlug: null, xpRate: null }),
    ).toMatchObject({ questCount: 1, conditionalQuestCount: 2 });
  });
  it("does not add conditional/optional duplicates to a definite required quest", () => {
    const projected = activity(
      "step\n.accept 7\nstep << UnknownPredicate\n.accept 7\n.accept 8\n.turnin 8\nstep\n#optional\n.accept 7\n.accept 9",
    );
    expect(chapterActivityStats(projected, profile)).toMatchObject({
      questCount: 2,
      conditionalQuestCount: 1,
      optionalQuestCount: 1,
      handInCount: 0,
      conditionalHandInCount: 1,
    });
  });
  it("reports reward coverage and never treats a missing reward as zero", () => {
    const stats = chapterActivityStats(
      activity("step\n.turnin 95189\n.turnin 7\n.turnin 95189"),
      profile,
    );
    expect(stats).toMatchObject({ handInCount: 2, knownRewardCount: 1, referenceRewardXp: 2600 });
  });
});

describe("XP targets and personal timing scenarios", () => {
  it("uses the verified client curve through level 60", () => {
    expect(FOREVER_XP_CURVE[31]).toBe(50800);
    expect(FOREVER_XP_CURVE[59]).toBe(209800);
    expect(chapterTargetXp(chapter({ title: "59-60 Endgame" }), profile)).toBe(209800);
  });
  it("does not double-count XP bonuses, group size or overlapping branches", () => {
    expect(chapterTargetXp(chapter(), profile)).toBe(7600);
    expect(
      chapterTargetXp(chapter(), { ...profile, xpRate: 3, party: { ...profile.party, size: 5 } }),
    ).toBe(7600);
    expect(estimateChapterMinutes(7600, 7600)).toBe(60);
  });
  it("does not describe same-level or unresolved labels as zero XP / zero time", () => {
    expect(chapterTargetXp(chapter({ title: "40-40 Dustwallow" }), profile)).toBeNull();
    expect(
      chapterTargetXp(chapter({ labels: [{ value: "2-4 Other", condition: "Mage" }] }), {
        ...profile,
        classSlug: null,
      }),
    ).toBeNull();
    expect(estimateChapterMinutes(null, 6000)).toBeNull();
    expect(estimateChapterMinutes(6000, null)).toBeNull();
  });
  it("validates stored pace and rounds modeling precision to five minutes", () => {
    for (const value of ["", " ", "0", "-1", "NaN", "Infinity", "1000000001", "{}"])
      expect(parseChapterPace(value)).toBeNull();
    expect(parseChapterPace("12000.5")).toBe(12000.5);
    expect(formatChapterMinutes(61)).toBe("≈1h 5m");
    expect(formatChapterMinutes(0.3)).toBe("≈5m");
    expect(formatChapterMinutes(null)).toBe("Not estimated");
  });
});
