import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES, WESTFALL_ROUTE, createCharacterProfile } from "@wow-trader/leveling";
import {
  chapterProgressKey,
  emptyLevelingWorkspace,
  readingPositionPath,
  readLevelingWorkspace,
  rememberReadingPosition,
  updateCharacterSession,
  updateStepProgress,
  WESTFALL_CHAPTER_ID,
} from "./leveling-experience";
import { exportLevelingBackup, mergeLevelingBackup, readLevelingBackup } from "./leveling-backup";
import { constrainMapView, fitMapPoints, fullMapView, zoomMapView } from "./leveling-map-view";
import { resolveChapterHandoff } from "./leveling-handoff";
import { feedbackProfilesMatch, levelingFeedbackSchema } from "./leveling-feedback";
import { previousReaderStep } from "./leveling-reader-navigation";
import type { LevelingMapPoint } from "./leveling-map-data";

function workspace() {
  return updateCharacterSession(
    emptyLevelingWorkspace(),
    "test-character",
    createCharacterProfile(),
  );
}
const position = {
  chapterId: WESTFALL_CHAPTER_ID,
  version: WESTFALL_ROUTE.version,
  clientBuild: WESTFALL_ROUTE.clientBuild,
  stepId: WESTFALL_ROUTE.steps[2]!.id,
};
const release = chapterProgressKey(position.chapterId, position.version, position.clientBuild);

describe("durable reading position", () => {
  it("restores old saves without reader fields and does not infer completion", () => {
    const old = workspace();
    const saved = JSON.parse(JSON.stringify(old)) as { sessions: Record<string, unknown>[] };
    delete saved.sessions[0]!.readerPositions;
    delete saved.sessions[0]!.lastReader;
    expect(readLevelingWorkspace(JSON.stringify(saved))).toEqual(old);
    const next = rememberReadingPosition(old, "test-character", position);
    expect(next.sessions[0]!.progress).toEqual({});
    expect(next.sessions[0]!.readerPositions[release]).toBe(position.stepId);
    expect(rememberReadingPosition(next, "test-character", position)).toBe(next);
    expect(readingPositionPath(next.sessions[0]!)).toContain(
      `?edition=kfc#route-${position.stepId}`,
    );
    expect(readLevelingWorkspace(JSON.stringify(next))).toEqual(next);
  });
  it("keeps bookmarks when playstyle changes and rejects unknown chapters or characters", () => {
    const saved = rememberReadingPosition(workspace(), "test-character", position);
    const changed = updateCharacterSession(saved, "test-character", {
      ...createCharacterProfile(),
      pace: "relaxed",
    });
    expect(changed.sessions[0]!.lastReader).toEqual(position);
    expect(rememberReadingPosition(saved, "missing", position)).toBe(saved);
    expect(
      rememberReadingPosition(saved, "test-character", { ...position, chapterId: "fake" }),
    ).toBe(saved);
    expect(
      readingPositionPath({
        ...saved.sessions[0]!,
        lastReader: { ...position, chapterId: "fake" },
      }),
    ).toBe("/forever/leveling/routes/alliance-human");
  });
  it("Previous skips hidden cards without wrapping or guessing invalid cursors", () => {
    expect(previousReaderStep(["a", "b", "c"], ["a", "c"], "c")).toBe("a");
    for (const id of [null, "a", "unknown"])
      expect(previousReaderStep(["a", "b"], ["a", "b"], id)).toBeNull();
  });
});

describe("private backup safety", () => {
  it("round-trips progress and position with explicit format metadata", () => {
    const saved = rememberReadingPosition(workspace(), "test-character", position);
    expect(readLevelingBackup(exportLevelingBackup(saved))).toEqual(saved);
  });
  it("preserves local undone states and settings while adding missing chapters or characters", () => {
    const incoming = updateStepProgress(
      workspace(),
      "test-character",
      position.chapterId,
      position.stepId,
      "done",
    );
    const current = updateStepProgress(
      incoming,
      "test-character",
      position.chapterId,
      position.stepId,
      "pending",
    );
    const imported = updateCharacterSession(
      incoming,
      "second-character",
      createCharacterProfile("horde"),
    );
    const merged = mergeLevelingBackup(current, imported);
    expect(merged.sessions).toHaveLength(2);
    expect(merged.sessions[0]!.progress[release]?.[position.stepId]).toBeUndefined();
    expect(merged.activeId).toBe(current.activeId);
    expect(
      mergeLevelingBackup(workspace(), incoming).sessions[0]!.progress[release]?.[position.stepId],
    ).toBe("done");
    expect(current.sessions).toHaveLength(1);
  });
  it("rejects corrupt, foreign or oversized files and identity conflicts before modification", () => {
    for (const raw of ["{broken", "{}", " ".repeat(2_010_001)])
      expect(() => readLevelingBackup(raw)).toThrow();
    const other = updateCharacterSession(
      emptyLevelingWorkspace(),
      "test-character",
      createCharacterProfile("horde"),
    );
    expect(() => mergeLevelingBackup(workspace(), other)).toThrow("different setup");
    const full = {
      ...workspace(),
      sessions: Array.from({ length: 10 }, (_, index) => ({
        ...workspace().sessions[0]!,
        id: index === 0 ? "test-character" : `character-${index}`,
      })),
    };
    const extra = updateCharacterSession(
      emptyLevelingWorkspace(),
      "extra",
      createCharacterProfile(),
    );
    expect(() => mergeLevelingBackup(full, extra)).toThrow("ten local");
  });
});

function point(x: number, y: number): LevelingMapPoint {
  return {
    id: "point",
    stepId: "step",
    sourceLine: 1,
    uiMapId: 37,
    x,
    y,
    questId: null,
    evidence: "guide_coordinate",
    outline: [],
  };
}
describe("bounded map navigation", () => {
  it("fits selected coordinates and outlines without inventing a marker", () => {
    const fitted = fitMapPoints(1000, 600, [point(0.5, 0.5)]);
    expect(fitted).toEqual({ x: 400, y: 240, width: 200, height: 120 });
    expect(fitMapPoints(1000, 600, [point(Number.NaN, 2)])).toEqual(fullMapView(1000, 600));
    const outlined = fitMapPoints(1000, 600, [
      {
        ...point(0.5, 0.5),
        outline: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ]);
    expect(outlined).toEqual(fullMapView(1000, 600));
  });
  it("limits zoom and dragging to the zone while preserving its aspect ratio", () => {
    expect(zoomMapView(fullMapView(1000, 600), 1000, 600, 10)).toEqual(fullMapView(1000, 600));
    const zoomed = zoomMapView(fullMapView(1000, 600), 1000, 600, 0.001);
    expect(zoomed.width).toBe(125);
    expect(zoomed.height).toBe(75);
    expect(constrainMapView({ ...zoomed, x: -99, y: 9999 }, 1000, 600)).toEqual({
      x: 0,
      y: 525,
      width: 125,
      height: 75,
    });
  });
});

describe("evidence-backed chapter handoffs", () => {
  const profile = {
    ...createCharacterProfile(),
    classSlug: "warrior" as const,
    xpRate: 1,
  };
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
  it("only offers published source continuations and never silently picks a bracket", () => {
    const all = CHAPTER_REFERENCES.map((entry) => entry.id);
    const handoff = resolveChapterHandoff(chapter, profile, all);
    expect(handoff.targets.length).toBeGreaterThan(0);
    expect(handoff.message).toContain("source");
    expect(resolveChapterHandoff(chapter, profile, []).kind).toBe("unresolved");
    expect(resolveChapterHandoff(chapter, profile, []).targets).toEqual([]);
  });
  it("does not manufacture missing or circular transitions", () => {
    const all = CHAPTER_REFERENCES.map((entry) => entry.id);
    const broken = { ...chapter, next: [{ ...chapter.next[0]!, value: "Missing source chapter" }] };
    expect(resolveChapterHandoff(broken, profile, all).kind).toBe("unresolved");
    const self = { ...chapter, next: [{ ...chapter.next[0]!, value: chapter.title }] };
    expect(resolveChapterHandoff(self, profile, all).targets).toEqual([]);
  });
});

describe("minimal player feedback", () => {
  const report = {
    submissionId: "00000000-0000-4000-8000-000000000001",
    position,
    profile: createCharacterProfile(),
    category: "wrong-location",
    message: "This coordinate does not match the instruction.",
  };
  it("rejects extra private fields, control characters, short or oversized text", () => {
    expect(levelingFeedbackSchema.safeParse(report).success).toBe(true);
    for (const input of [
      { ...report, sessionId: "private" },
      { ...report, message: "short" },
      { ...report, message: "x".repeat(1501) },
      { ...report, message: `bad${String.fromCharCode(0)} instruction` },
    ])
      expect(levelingFeedbackSchema.safeParse(input).success).toBe(false);
  });
  it("recognizes identical JSONB profiles regardless of object key order", () => {
    const profile = createCharacterProfile();
    const reordered = Object.fromEntries(Object.entries(profile).reverse());
    expect(feedbackProfilesMatch(profile, reordered)).toBe(true);
    expect(feedbackProfilesMatch(profile, { ...profile, pace: "relaxed" })).toBe(false);
    expect(feedbackProfilesMatch(profile, { ...profile, name: "private" })).toBe(false);
  });
});
