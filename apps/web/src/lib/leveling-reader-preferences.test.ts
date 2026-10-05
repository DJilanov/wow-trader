import { describe, expect, it } from "vitest";
import { DEFAULT_READER_PREFERENCES, readReaderPreferences } from "./leveling-reader-preferences";

describe("reader preferences", () => {
  it("starts in current + next with a mobile quest view", () => {
    expect(readReaderPreferences(null)).toEqual(DEFAULT_READER_PREFERENCES);
    expect(readReaderPreferences("invalid")).toEqual(DEFAULT_READER_PREFERENCES);
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
