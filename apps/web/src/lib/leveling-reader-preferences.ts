export type ReaderView = "split" | "map" | "quests";
export interface ReaderPreferences {
  readonly display: "all" | "focus";
  readonly textSize: "standard" | "large";
  readonly mobileView: ReaderView;
  readonly mapWidth: number;
}
export const READER_PREFERENCES_KEY = "kfc-leveling:reader-preferences:v1";
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  display: "focus",
  textSize: "standard",
  mobileView: "quests",
  mapWidth: 50,
};
export function readReaderPreferences(raw: string | null): ReaderPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return DEFAULT_READER_PREFERENCES;
    return {
      display: "display" in value && value.display === "all" ? "all" : "focus",
      textSize: "textSize" in value && value.textSize === "large" ? "large" : "standard",
      mobileView:
        "mobileView" in value && (value.mobileView === "map" || value.mobileView === "split")
          ? value.mobileView
          : "quests",
      mapWidth:
        "mapWidth" in value &&
        typeof value.mapWidth === "number" &&
        Number.isFinite(value.mapWidth) &&
        value.mapWidth >= 35 &&
        value.mapWidth <= 60
          ? value.mapWidth
          : 50,
    };
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}
