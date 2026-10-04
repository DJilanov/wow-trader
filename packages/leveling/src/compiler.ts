import { validateRoute, type LevelingRoute } from "./model.js";

export interface GuideArtifact {
  readonly toc: string;
  readonly lua: string;
  readonly readme: string;
}

export function compileGuides(inputs: readonly LevelingRoute[]): GuideArtifact {
  if (!inputs.length) throw new Error("At least one route is required");
  const routes = inputs.map(validateRoute);
  if (new Set(routes.map((route) => route.id)).size !== routes.length)
    throw new Error("Duplicate route release ID");
  const primary = routes[0]!;
  if (
    routes.some(
      (route) =>
        route.clientBuild !== primary.clientBuild ||
        route.version !== primary.version ||
        route.interfaceVersion !== primary.interfaceVersion,
    )
  )
    throw new Error("Guide releases must have identical build and version");
  const lua: string[] = [
    "local _, namespace = ...",
    `namespace.release = ${luaString(primary.version)}`,
    `namespace.build = ${primary.clientBuild}`,
    'if not RXPGuides or type(RXPGuides.RegisterGuide) ~= "function" then return end',
    "local _, build = GetBuildInfo()",
    "if tonumber(build) ~= namespace.build then",
    '  print("KFC guide: this preview targets build " .. namespace.build .. ". Check the browser guide before continuing.")',
    "  return",
    "end",
  ];
  for (const route of routes) {
    const accepted = new Set<number>();
    const completed = new Set<number>();
    const lines = [
      "#classic",
      `#group KFC Forever Guides (${route.faction === "alliance" ? "A" : "H"})`,
      `#name ${singleLine(route.title)} [preview]`,
      "#version 1",
      `<< ${route.faction === "alliance" ? "Alliance" : "Horde"}`,
    ];
    for (const step of route.steps) {
      if (
        step.questId !== null &&
        ["complete", "turnin"].includes(step.action) &&
        !accepted.has(step.questId)
      )
        throw new Error(`Quest ${step.questId} must be accepted before completion/turn-in`);
      if (step.action === "turnin" && step.questId !== null && !completed.has(step.questId))
        throw new Error(`Quest ${step.questId} must be completed before turn-in`);
      if (step.action === "accept" && step.questId !== null) accepted.add(step.questId);
      if (step.action === "complete" && step.questId !== null) completed.add(step.questId);
      lines.push("step", `    #label ${step.id}`);
      if (step.optional) lines.push("    #optional");
      if (step.position)
        lines.push(`    .goto ${step.position.zone},${step.position.x},${step.position.y}`);
      if (step.action === "checkpoint")
        lines.push(`    .xp ${step.level} >> ${singleLine(step.text)}`);
      else if (step.action === "complete" && step.questId !== null) {
        const quest = route.quests.find((entry) => entry.id === step.questId)!;
        for (const objectiveIndex of quest.objectiveIndexes)
          lines.push(`    .complete ${step.questId},${objectiveIndex} >> ${singleLine(step.text)}`);
      } else if (step.questId !== null && ["accept", "turnin"].includes(step.action))
        lines.push(`    .${step.action} ${step.questId} >> ${singleLine(step.text)}`);
      else lines.push(`    >> ${singleLine(step.text)}`);
    }
    const guide = lines.join("\n") + "\n";
    let delimiter = "=";
    while (guide.includes(`]${delimiter}]`)) delimiter += "=";
    lua.push(`RXPGuides.RegisterGuide([${delimiter}[\n${guide}]${delimiter}])`);
  }
  return {
    toc: `## Interface: ${primary.interfaceVersion}\n## Title: KFC Forever Guides · Preview\n## Notes: Original Westfall route and Hall of Thanes alternative. Requires a playthrough before release.\n## Author: KFC Guild\n## Version: ${primary.version}\n## Dependencies: RXPGuides\n## SavedVariables: KFCForeverGuideEvidence\nGuides.lua\nObserver.lua\n`,
    lua: lua.join("\n") + "\n",
    readme: `KFC Forever Guides ${primary.version} — maintainer preview\n\nCoverage: Alliance Westfall 13–15 and the level-14 Hall of Thanes alternative.\nBuild: ${primary.clientBuild}; RestedXP v4.11.14; Interface ${primary.interfaceVersion}.\nThe browser and addon use the same route and step IDs. This is not a complete 1–60 guide.\n\nExit WoW. Extract KFCForeverGuides into the Classic Beta Interface/AddOns directory.\nWindows: your WoW folder\\_classic_beta_\\Interface\\AddOns\\KFCForeverGuides\nmacOS: /Applications/World of Warcraft/_classic_beta_/Interface/AddOns/KFCForeverGuides\nEnable KFCForeverGuides and RXPGuides, then select the KFC Forever Guides (A) group.\nNever overwrite RXPGuides or SavedVariables. Keep the previous KFC folder for rollback.\n\n/kfcguide xp records your current level curve value.\n/kfcguide observe enables bounded quest turn-in evidence until reload; /kfcguide stop stops it.\n/reload writes KFCForeverGuideEvidence to the addon SavedVariables file.\nEvidence collection performs no quest scans, NPC scans, targeting or protected UI actions.\n\nValidate pickups, tracking, skipped optional steps and the Sentinel Hill return in game.\nCurrent reward XP is unknown; enter your actual reward in the free browser planner.\nGuide registration is disabled on a different client build until a reviewed update.\nBrowser: https://helper.kfcguild.online${primary.path}\n`,
  };
}

function singleLine(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("Guide text must contain one line");
  return value;
}

function luaString(value: string): string {
  return JSON.stringify(value);
}
