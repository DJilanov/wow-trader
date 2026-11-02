import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DUNGEON_RELEASE,
  createCharacterProfile,
  emptyPremadeProgress,
} from "@wow-trader/leveling";
import { emptyLevelingWorkspace, updateCharacterSession } from "../lib/leveling-experience";
import { LevelingPremade } from "./leveling-premade";

let progress = emptyPremadeProgress();
vi.mock("./leveling-provider", () => ({
  useLeveling: () => {
    const workspace = updateCharacterSession(
      emptyLevelingWorkspace(),
      "party",
      createCharacterProfile(),
    );
    const session = workspace.sessions[0]!;
    return {
      workspace,
      session: { ...session, dungeonPlans: { [DUNGEON_RELEASE]: { premade: progress } } },
      loaded: true,
      notice: null,
      storageStatus: "saved",
      setDungeonPlan: vi.fn(),
      saveCharacter: vi.fn(),
    };
  },
}));

function markup(): string {
  return renderToStaticMarkup(
    <LevelingPremade
      revision="quest-log-test"
      maps={{
        buildNumber: null,
        targetBuild: 70205,
        state: "unavailable",
        zones: [],
        points: [],
        unmappedPoints: 0,
      }}
    />,
  );
}

describe("quest log capacity controls", () => {
  beforeEach(() => {
    progress = emptyPremadeProgress();
  });

  it("disables new active quest states for a full member while retaining hand-in corrections", () => {
    progress.members[3]!.questStates = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [String(300000 + index), "accepted"]),
    );
    const html = markup();
    const full = html.match(
      /<select[^>]*aria-label="Player 4 quest \d+ status — quest log full"[^>]*>[\s\S]*?<\/select>/g,
    );
    expect(full?.length).toBeGreaterThan(0);
    for (const select of full!) {
      expect(select).toContain('<option value="accepted" disabled="">');
      expect(select).toContain('<option value="objectives-complete" disabled="">');
      expect(select).toContain('<option value="rewarded">Handed in</option>');
      expect(select).toContain('<option value="not-started" selected="">');
    }
    expect(html).toContain("Quest log full (40/40)");
    expect(html).not.toContain("Player 1 quest log full");
  });

  it("counts rewarded history without blocking new pickups", () => {
    progress.members[3]!.questStates = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [
        String(300000 + index),
        index < 39 ? "accepted" : "rewarded",
      ]),
    );
    const html = markup();
    expect(html).not.toContain("quest log full");
    expect(html).not.toContain('<option value="accepted" disabled="">');
  });
});
