import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";

export async function updateGuideProgress(page, { level, xp, player = 0 }) {
  await page.getByRole("button", { name: /^Update (?:my|party) level \/ XP$/ }).click();
  const dialog = page.getByRole("dialog", { name: /^Where are/ });
  const players = dialog.getByLabel("Player", { exact: true });
  if (await players.count()) await players.selectOption(String(player));
  else if (player !== 0) throw new Error("Personal starting chapters only edit your own XP.");
  await dialog.getByLabel("Level", { exact: true }).fill(String(level));
  await dialog.getByLabel("XP into this level", { exact: true }).fill(String(xp));
  await dialog.getByRole("button", { name: "Save progress update", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    ({ release, player, level, xp }) => {
      const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
      const member = workspace.sessions.find((session) => session.id === workspace.activeId)
        .dungeonPlans[release].premade.members[player];
      return (
        member.level === level && member.currentXp === xp && member.guideXpAnchor !== undefined
      );
    },
    { release: DUNGEON_RELEASE, player, level, xp },
  );
}
