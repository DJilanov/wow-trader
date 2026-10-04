import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import {
  auditChapterCatalog,
  chapterEligibility,
  evaluateChapterCondition,
  evaluateXpRate,
  extractChapterReferences,
  getChapterLabel,
  parseGuideInventoryCsv,
  selectChapterSequence,
  type ChapterReference,
} from "./chapter-catalog.js";
import {
  characterProfileSchema,
  createCharacterProfile,
  getPartyGuidance,
  getLevelingRace,
} from "./profile.js";

function chapter(sourceId: number): ChapterReference {
  const result = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId);
  if (!result) throw new Error("Missing chapter");
  return result;
}

describe("Forever character profiles", () => {
  it("includes new Forever combinations and rejects illegal choices", () => {
    expect(getLevelingRace("horde", "undead")?.classes).toContain("paladin");
    expect(getLevelingRace("alliance", "dwarf")?.classes).toContain("shaman");
    expect(
      characterProfileSchema.safeParse({ ...createCharacterProfile(), raceId: "orc" }).success,
    ).toBe(false);
    expect(
      characterProfileSchema.safeParse({
        ...createCharacterProfile("horde", "skyborne"),
        classSlug: "mage",
      }).success,
    ).toBe(false);
    expect(
      characterProfileSchema.safeParse({
        ...createCharacterProfile("alliance", "skyborne"),
        classSlug: "mage",
      }).success,
    ).toBe(true);
  });
  it("does not treat a duo, unfinished party or five DPS as ready for earlier content", () => {
    const base = createCharacterProfile();
    expect(
      getPartyGuidance({
        ...base,
        party: { ...base.party, size: 2, readiness: "together", tank: "yes", healer: "yes" },
      }).earlierCandidate,
    ).toBe(false);
    expect(
      getPartyGuidance({
        ...base,
        party: { ...base.party, size: 5, readiness: "recruiting", tank: "yes", healer: "yes" },
      }).recruitmentMinutes,
    ).toBeNull();
    const ready = {
      ...base,
      pace: "relaxed" as const,
      party: {
        size: 5,
        readiness: "together" as const,
        tank: "yes" as const,
        healer: "yes" as const,
      },
    };
    expect(getPartyGuidance(ready)).toMatchObject({
      recruitmentMinutes: 0,
      earlierCandidate: true,
    });
    expect(getPartyGuidance(ready).text).toContain("travel and turn-ins remain");
    expect(
      getPartyGuidance({ ...ready, party: { ...ready.party, healer: "unknown" } }).earlierCandidate,
    ).toBe(false);
  });
});

describe("chapter metadata and predicates", () => {
  it("preserves all 157 identities without distributing private steps", () => {
    expect(CHAPTER_REFERENCES).toHaveLength(157);
    expect(new Set(CHAPTER_REFERENCES.map((entry) => entry.id)).size).toBe(157);
    expect(
      CHAPTER_REFERENCES.every((entry) => !("steps" in entry) && !("raw_header" in entry)),
    ).toBe(true);
    expect(chapter(157).factions).toEqual(["alliance", "horde"]);
  });
  it("evaluates known conjunctions, alternatives and negation without guessing unknown class/rulesets", () => {
    const profile = { ...createCharacterProfile(), classSlug: "mage" as const };
    expect(evaluateChapterCondition("Human Mage/Gnome Mage", profile)).toBe("match");
    expect(evaluateChapterCondition("Alliance !Hunter", profile)).toBe("match");
    expect(evaluateChapterCondition("Alliance Hunter", createCharacterProfile())).toBe("unknown");
    expect(evaluateChapterCondition("SoD", profile)).toBe("exclude");
    expect(evaluateChapterCondition("!SoD", profile)).toBe("match");
    expect(evaluateChapterCondition("unknown-addon-setting", profile)).toBe("unknown");
    expect(evaluateXpRate("<1.5", null)).toBe("unknown");
    expect(evaluateXpRate("<1.5", 1.5)).toBe("exclude");
    expect(evaluateXpRate(">=1.5", 1.5)).toBe("match");
  });
  it("shows real race-dependent bracket labels", () => {
    expect(getChapterLabel(chapter(125), createCharacterProfile()).minimumLevel).toBe(13);
    expect(
      getChapterLabel(chapter(125), createCharacterProfile("alliance", "gnome")).minimumLevel,
    ).toBe(14);
    expect(
      getChapterLabel(chapter(157), createCharacterProfile("alliance", "skyborne")).maximumLevel,
    ).toBe(13);
    expect(
      getChapterLabel(chapter(157), createCharacterProfile("horde", "skyborne")).maximumLevel,
    ).toBe(12);
    expect(
      chapterEligibility(chapter(123), {
        ...createCharacterProfile("alliance", "dwarf"),
        classSlug: "priest",
        xpRate: 1,
      }),
    ).toBe("exclude");
  });
  it("stops at uncertain or branching continuations instead of substituting a known fallback", () => {
    const unknown = selectChapterSequence(CHAPTER_REFERENCES, createCharacterProfile());
    expect(unknown.chapters.map((entry) => entry.sourceId)).toEqual([115, 116, 117]);
    const known = selectChapterSequence(CHAPTER_REFERENCES, {
      ...createCharacterProfile(),
      classSlug: "warrior",
      xpRate: 1,
    });
    expect(known.chapters.map((entry) => entry.sourceId)).toEqual([115, 116, 117]);
    expect(known.alternatives.some((entry) => entry.sourceId === 125)).toBe(true);
    expect(known.chapters.every((entry) => entry.family === "questing")).toBe(true);
    const horde = selectChapterSequence(
      CHAPTER_REFERENCES,
      createCharacterProfile("horde", "skyborne"),
    );
    expect(horde.chapters.map((entry) => entry.sourceId)).toEqual([157]);
    expect(horde.messages.join(" ")).toContain("unresolved");
    const dangling = {
      ...chapter(115),
      next: [
        { value: chapter(116).title, condition: "" },
        { value: "missing chapter", condition: "" },
      ],
    };
    expect(
      selectChapterSequence([dangling, chapter(116)], createCharacterProfile()).chapters.map(
        (entry) => entry.id,
      ),
    ).toEqual([dangling.id]);
  });
  it("reports missing targets and cycles, and rejects duplicate identities", () => {
    const first = { ...chapter(115), next: [{ value: chapter(116).title, condition: "" }] };
    const second = {
      ...chapter(116),
      next: [
        { value: chapter(115).title, condition: "" },
        { value: "missing chapter", condition: "" },
      ],
    };
    const audit = auditChapterCatalog([first, second]);
    expect(audit.cycles).toContain(first.id);
    expect(audit.unresolvedTargets).toEqual([{ chapterId: second.id, target: "missing chapter" }]);
    expect(() => auditChapterCatalog([first, first])).toThrow("Duplicate");
  });
  it("reads quoted multiline CSV headers and rejects malformed input", () => {
    const csv =
      '\uFEFFguide_id,name,raw_header,subgroup\r\n1,1-6 Test,"#forever\n#group Example (A)\n<< Alliance\n#defaultfor Human\n#next 6-10 Test << !Hunter\n",Questing\r\n';
    expect(extractChapterReferences(csv)[0]).toMatchObject({
      sourceId: 1,
      title: "1-6 Test",
      factions: ["alliance"],
      next: [{ value: "6-10 Test", condition: "!Hunter" }],
    });
    expect(() => parseGuideInventoryCsv('guide_id,name,raw_header\n1,"broken')).toThrow(
      "Unterminated",
    );
    expect(() => parseGuideInventoryCsv("guide_id,name,raw_header\n1,two")).toThrow("width");
    expect(() => parseGuideInventoryCsv("name\nvalue")).toThrow("columns");
  });
});
