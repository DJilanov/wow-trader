import { describe, expect, it } from "vitest";
import { DEFAULT_READER_PREFERENCES, readReaderPreferences } from "./leveling-reader-preferences";

describe("reader preferences", () => {
  it("starts with the full scrollable chapter and a mobile quest view", () => {
    expect(DEFAULT_READER_PREFERENCES.display).toBe("all");
    expect(DEFAULT_READER_PREFERENCES.mobileView).toBe("quests");
    expect(readReaderPreferences(null)).toEqual(DEFAULT_READER_PREFERENCES);
    expect(readReaderPreferences("invalid")).toEqual(DEFAULT_READER_PREFERENCES);
  });
  it("does not hide the quest list when reading mode is absent or malformed", () => {
    for (const raw of [
      "{}",
      "[]",
      '{"display":null}',
      '{"display":"unknown"}',
      '{"textSize":"large"}',
    ])
      expect(readReaderPreferences(raw).display).toBe("all");
  });
  it("keeps an explicitly saved focus preference rather than silently resetting it", () => {
    expect(readReaderPreferences('{"display":"focus"}')).toEqual({
      ...DEFAULT_READER_PREFERENCES,
      display: "focus",
    });
  });
  it("preserves legacy reading preferences without changing progress", () => {
    expect(readReaderPreferences('{"display":"all","textSize":"large"}')).toEqual({
      ...DEFAULT_READER_PREFERENCES,
      display: "all",
      textSize: "large",
    });
  });
  it("restores mobile layout and a bounded desktop map width", () => {
    expect(readReaderPreferences('{"mobileView":"map","mapWidth":40}')).toMatchObject({
      mobileView: "map",
      mapWidth: 40,
    });
    expect(readReaderPreferences('{"mobileView":"invalid","mapWidth":100}')).toEqual(
      DEFAULT_READER_PREFERENCES,
    );
  });
});
