import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES, WESTFALL_ROUTE, createCharacterProfile } from "@wow-trader/leveling";
import {
  WESTFALL_CHAPTER_ID,
  LEVELING_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_KEY,
  chapterProgressKey,
  emptyLevelingWorkspace,
  getPublicChapter,
  isChapterComplete,
  levelingChapterPath,
  profileForRouteId,
  readLevelingWorkspace,
  readStoredLevelingWorkspace,
  readSharedCharacter,
  serializeLevelingWorkspace,
  updateCharacterSession,
  updateStepProgress,
} from "./leveling-experience";

describe("dedicated leveling workspace", () => {
  it("restores legacy saves without modifying their rollback copy", () => {
    const legacy = serializeLevelingWorkspace(
      updateCharacterSession(emptyLevelingWorkspace(), "first", createCharacterProfile()),
    );
    const values = new Map([[LEGACY_CHARACTER_STORAGE_KEY, legacy]]);
    const restored = readStoredLevelingWorkspace({ getItem: (key) => values.get(key) ?? null });
    expect(restored).toEqual({ workspace: readLevelingWorkspace(legacy), unreadable: false });
    expect(values.get(LEGACY_CHARACTER_STORAGE_KEY)).toBe(legacy);
    expect(values.has(LEVELING_STORAGE_KEY)).toBe(false);
    values.set(LEVELING_STORAGE_KEY, serializeLevelingWorkspace(restored.workspace!));
    expect(values.get(LEGACY_CHARACTER_STORAGE_KEY)).toBe(legacy);
  });
  it("prefers the current save and never resurrects a stale legacy save if it is corrupt", () => {
    const legacy = serializeLevelingWorkspace(
      updateCharacterSession(emptyLevelingWorkspace(), "old", createCharacterProfile()),
    );
    const current = serializeLevelingWorkspace(
      updateCharacterSession(emptyLevelingWorkspace(), "new", createCharacterProfile()),
    );
    const values = new Map([
      [LEGACY_CHARACTER_STORAGE_KEY, legacy],
      [LEVELING_STORAGE_KEY, current],
    ]);
    const storage = { getItem: (key: string): string | null => values.get(key) ?? null };
    expect(readStoredLevelingWorkspace(storage).workspace?.activeId).toBe("new");
    for (const corrupt of ["{broken", ""]) {
      values.set(LEVELING_STORAGE_KEY, corrupt);
      expect(readStoredLevelingWorkspace(storage)).toEqual({ workspace: null, unreadable: true });
      expect(values.get(LEVELING_STORAGE_KEY)).toBe(corrupt);
    }
    values.clear();
    expect(readStoredLevelingWorkspace(storage)).toEqual({ workspace: null, unreadable: false });
    expect(() =>
      readStoredLevelingWorkspace({
        getItem: () => {
          throw new Error("Storage denied");
        },
      }),
    ).toThrow("Storage denied");
  });
  it("validates route identities and rejects hostile or illegal shared setups", () => {
    expect(profileForRouteId("alliance-night-elf")?.raceId).toBe("night-elf");
    expect(profileForRouteId("horde-human")).toBeNull();
    expect(profileForRouteId("javascript:alert(1)")).toBeNull();
    expect(
      readSharedCharacter(JSON.stringify({ ...createCharacterProfile(), raceId: "orc" })),
    ).toBeNull();
    expect(readSharedCharacter("x".repeat(1501))).toBeNull();
    expect(readSharedCharacter(JSON.stringify(createCharacterProfile()))).toEqual(
      createCharacterProfile(),
    );
  });
  it("isolates characters and preserves progress when pace/party changes", () => {
    let workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "first",
      createCharacterProfile(),
    );
    const step = WESTFALL_ROUTE.steps[0]!;
    workspace = updateStepProgress(workspace, "first", WESTFALL_CHAPTER_ID, step.id, "done");
    workspace = updateCharacterSession(workspace, "second", createCharacterProfile("horde"));
    expect(workspace.sessions[1]?.progress).toEqual({});
    workspace = updateCharacterSession(workspace, "first", {
      ...createCharacterProfile(),
      pace: "relaxed",
    });
    expect(
      workspace.sessions[0]?.progress[
        chapterProgressKey(WESTFALL_CHAPTER_ID, WESTFALL_ROUTE.version, WESTFALL_ROUTE.clientBuild)
      ]?.[step.id],
    ).toBe("done");
    expect(
      workspace.sessions[0]?.progress[
        chapterProgressKey(WESTFALL_CHAPTER_ID, "0.2.0", WESTFALL_ROUTE.clientBuild)
      ],
    ).toBeUndefined();
    expect(() =>
      updateCharacterSession(workspace, "first", createCharacterProfile("horde")),
    ).toThrow("another character");
    expect(readLevelingWorkspace(JSON.stringify(workspace))).toEqual(workspace);
  });
  it("does not mark a chapter complete for skipped required steps or an arbitrary current level", () => {
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === WESTFALL_CHAPTER_ID)!;
    let workspace = updateCharacterSession(emptyLevelingWorkspace(), "first", {
      ...createCharacterProfile(),
      level: 30,
    });
    expect(isChapterComplete(workspace.sessions[0]!, chapter)).toBe(false);
    for (const step of WESTFALL_ROUTE.steps)
      workspace = updateStepProgress(
        workspace,
        "first",
        chapter.id,
        step.id,
        step.optional ? "skipped" : "done",
      );
    expect(isChapterComplete(workspace.sessions[0]!, chapter)).toBe(true);
    const required = WESTFALL_ROUTE.steps.find((step) => !step.optional)!;
    workspace = updateStepProgress(workspace, "first", chapter.id, required.id, "skipped");
    expect(isChapterComplete(workspace.sessions[0]!, chapter)).toBe(false);
  });
  it("allows only published compatible content and known progress identities", () => {
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === WESTFALL_CHAPTER_ID)!;
    expect(getPublicChapter(chapter, createCharacterProfile("horde"))).toBeNull();
    expect(getPublicChapter(chapter, createCharacterProfile("alliance", "dwarf"))).toEqual(
      WESTFALL_ROUTE,
    );
    const workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "first",
      createCharacterProfile(),
    );
    expect(updateStepProgress(workspace, "first", chapter.id, "fake-step", "done")).toBe(workspace);
    expect(levelingChapterPath(createCharacterProfile(), chapter.id)).toBe(WESTFALL_ROUTE.path);
  });
  it("rejects stale/corrupt storage and impossible active sessions", () => {
    expect(readLevelingWorkspace("{broken")).toBeNull();
    expect(
      readLevelingWorkspace(JSON.stringify({ ...emptyLevelingWorkspace(), version: 2 })),
    ).toBeNull();
    expect(
      readLevelingWorkspace(JSON.stringify({ ...emptyLevelingWorkspace(), activeId: "missing" })),
    ).toBeNull();
    expect(readLevelingWorkspace(" ".repeat(2000001))).toBeNull();
  });
  it("never serializes multi-chapter history that the next visit cannot read", () => {
    const workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "first",
      createCharacterProfile(),
    );
    expect(readLevelingWorkspace(serializeLevelingWorkspace(workspace))).toEqual(workspace);
    const session = workspace.sessions[0]!;
    const history = Object.fromEntries(
      Array.from({ length: 75000 }, (_, index) => [
        `source-step-${String(index).padStart(8, "0")}`,
        "done" as const,
      ]),
    );
    expect(() =>
      serializeLevelingWorkspace({
        ...workspace,
        sessions: [{ ...session, progress: { "chapter-large": history } }],
      }),
    ).toThrow("Earlier saved progress is preserved");
  });
  it("tracks imported steps in their own immutable release without changing original progress", () => {
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
    let workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "first",
      createCharacterProfile(),
    );
    const definition = {
      chapterId: chapter.id,
      version: "import-v2-aaaaaaaaaaaaaaaa",
      clientBuild: 70205,
      stepIds: ["source-step-0001"],
    };
    workspace = updateStepProgress(
      workspace,
      "first",
      chapter.id,
      "source-step-0001",
      "done",
      definition,
    );
    expect(workspace.sessions[0]?.lastChapterId).toBe(chapter.id);
    expect(
      workspace.sessions[0]?.progress[chapterProgressKey(chapter.id, definition.version, 70205)]?.[
        "source-step-0001"
      ],
    ).toBe("done");
    expect(
      updateStepProgress(workspace, "first", chapter.id, "source-step-9999", "done", definition),
    ).toBe(workspace);
    expect(
      updateStepProgress(workspace, "first", chapter.id, "source-step-0001", "done", {
        ...definition,
        chapterId: "chapter-other",
      }),
    ).toBe(workspace);
    expect(readLevelingWorkspace(JSON.stringify(workspace))).toEqual(workspace);
  });
});
