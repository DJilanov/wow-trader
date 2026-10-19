import type { ClassSlug } from "./model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignRace } from "./campaign-route.js";
import { gateQuestIds } from "./dungeon-model.js";
import { questEligibility } from "./quest-eligibility.js";

export const CAMPAIGN_ADDON_COMPILER_REVISION = "campaign-addon-20261019-v9" as const;

export interface CampaignAddonOptions {
  readonly version: string;
  readonly runtimeBuild: number;
  readonly interfaceVersion: number;
  readonly restedXpVersion: string;
  readonly browserBaseUrl?: string;
}

export interface CampaignAddonGuideSummary {
  readonly role: "leader" | "party";
  readonly group: string;
  readonly names: readonly string[];
  readonly actionIds: readonly string[];
}

export interface CampaignAddonArtifact {
  readonly toc: string;
  readonly lua: string;
  readonly readme: string;
  readonly guides: readonly CampaignAddonGuideSummary[];
}

const raceLabels: Readonly<Record<CampaignRace, string>> = {
  human: "Human",
  dwarf: "Dwarf",
  gnome: "Gnome",
  "night-elf": "NightElf",
  skyborne: "Skyborne",
};

const classLabels: Readonly<Record<ClassSlug, string>> = {
  warrior: "Warrior",
  paladin: "Paladin",
  hunter: "Hunter",
  rogue: "Rogue",
  priest: "Priest",
  shaman: "Shaman",
  mage: "Mage",
  warlock: "Warlock",
  druid: "Druid",
};

function oneLine(value: string, field: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${field} must not be empty.`);
  if (normalized.length > 1000) throw new Error(`${field} exceeds the guide line budget.`);
  return normalized.replaceAll("<<", "‹‹").replaceAll(">>", "››").replaceAll("--", "—");
}

function luaLongString(value: string): string {
  let delimiter = "=";
  while (value.includes(`]${delimiter}]`)) delimiter += "=";
  return `[${delimiter}[\n${value}]${delimiter}]`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Guide position must be finite.");
  return Number(value.toFixed(4)).toString();
}

function positionLines(action: CampaignAction): readonly string[] {
  const seen = new Set<string>();
  return [...action.positions]
    .sort((left, right) => left.sourceLine - right.sourceLine)
    .flatMap(({ position }) => {
      const map =
        position.space === "world"
          ? `${position.zone}/${position.floor ?? 0}`
          : oneLine(position.zone, "Position zone");
      const line = `    .goto ${map},${formatNumber(position.x)},${formatNumber(position.y)}`;
      if (seen.has(line)) return [];
      seen.add(line);
      return [line];
    });
}

function questLines(action: CampaignAction): readonly string[] {
  return action.questChanges.map((change) => {
    const text = questInstruction(change);
    if (change.state === "accepted") return `    .accept ${change.questId} >> ${text}`;
    if (change.state === "rewarded") return `    .turnin ${change.questId} >> ${text}`;
    return `    .complete ${change.questId},${change.objectiveIndex ?? 1} >> ${text}`;
  });
}

function questInstruction(change: CampaignAction["questChanges"][number]): string {
  return oneLine(
    `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : "Complete"} ${change.title}`,
    "Quest instruction",
  );
}

function xpLine(action: CampaignAction): string | null {
  if (action.targetLevel === null) return null;
  const current = action.targetCurrentXp ?? 0;
  const target = current > 0 ? `${action.targetLevel}+${current}` : String(action.targetLevel);
  return `    .xp ${target} >> ${oneLine(action.title, "XP checkpoint")}`;
}

function actionLines(action: CampaignAction): readonly string[] {
  if (action.kind === "unverified")
    throw new Error(`Unverified action ${action.id} cannot enter the addon package.`);
  const lines = ["step", `    #label ${oneLine(`kfc-${action.id}`, "Action label")}`];
  if (action.bundleId) {
    if (action.questChanges.length || action.positions.length)
      throw new Error("Planning-only bundles cannot emit quest or location directives.");
    lines.push(
      "    >> PLANNING ONLY: four owner-confirmed faction quests. IDs, objectives and access details are pending. Skip this optional stop or use actual in-game information; no quest completion is inferred.",
    );
  }
  lines.push(...positionLines(action));
  const xp = action.kind === "xp-check" || action.kind === "checkpoint" ? xpLine(action) : null;
  if (xp) lines.push(xp);
  if (action.kind === "xp-check" && action.targetLevel !== null)
    lines.push(
      `    >> Maintainer evidence: start /kfcguide grind ${action.id} before this grind, then use /kfcguide grind stop at the checkpoint.`,
    );
  lines.push(...questLines(action));
  const questText = new Set(action.questChanges.map(questInstruction));
  for (const instruction of action.instructions) {
    const text = oneLine(instruction, "Action instruction");
    if (!questText.has(text)) lines.push(`    >> ${text}`);
  }
  if (!xp && action.questChanges.length === 0 && action.instructions.length === 0)
    lines.push(`    >> ${oneLine(action.title, "Action title")}`);
  if (action.xpOptional)
    lines.push(
      "    >> Skip this XP work only after the browser confirms every participating player meets the next checkpoint.",
    );
  if (action.leaderOnly)
    lines.push("    >> Leader-only step. Party members remain on their personal starter route.");
  return lines;
}

function normalizeRoleActions(
  actions: readonly CampaignAction[],
  role: "leader" | "party",
): readonly CampaignAction[] {
  const states = new Map<number, "accepted" | "objectives-complete" | "rewarded">();
  const overlappingPickups = new Map<number, number>();
  const repeatedLifecycles = new Map<number, number>();
  const emittedPhases = new Map<number, Set<string>>();
  const normalized: CampaignAction[] = [];
  for (const action of actions) {
    const retained = action.questChanges.filter((change) => {
      const current = states.get(change.questId);
      if (current !== undefined && change.state === "accepted") {
        const collection = current === "rewarded" ? repeatedLifecycles : overlappingPickups;
        collection.set(change.questId, (collection.get(change.questId) ?? 0) + 1);
        return false;
      }
      const phaseKey = `${change.state}-${change.objectiveIndex ?? 0}`;
      const phases = emittedPhases.get(change.questId) ?? new Set<string>();
      const repeated = repeatedLifecycles.get(change.questId) ?? 0;
      if (current === "rewarded" && repeated > 0) {
        if (change.state === "rewarded") {
          if (repeated === 1) repeatedLifecycles.delete(change.questId);
          else repeatedLifecycles.set(change.questId, repeated - 1);
        }
        return false;
      }
      const overlapping = overlappingPickups.get(change.questId) ?? 0;
      if (current === "rewarded" && overlapping > 0 && phases.has(phaseKey)) {
        if (change.state === "rewarded") {
          if (overlapping === 1) overlappingPickups.delete(change.questId);
          else overlappingPickups.set(change.questId, overlapping - 1);
        }
        return false;
      }
      if (current === "rewarded")
        throw new Error(
          `${role} guide changes rewarded quest ${change.questId} back to ${change.state}.`,
        );
      if (overlapping > 0 && phases.has(phaseKey)) return false;
      states.set(change.questId, change.state);
      phases.add(phaseKey);
      emittedPhases.set(change.questId, phases);
      return true;
    });
    if (retained.length === action.questChanges.length) {
      normalized.push(action);
      continue;
    }
    if (retained.length === 0) {
      if (action.questChanges.length === 0) normalized.push(action);
      continue;
    }
    normalized.push({
      ...action,
      title: retained.map(questInstruction).join(" · "),
      instructions: retained.map(questInstruction),
      questChanges: retained,
    });
  }
  if (repeatedLifecycles.size > 0)
    throw new Error(
      `${role} guide repeats quest ${[...repeatedLifecycles.keys()].sort((left, right) => left - right).join(", ")} without a matching hand-in.`,
    );
  return normalized;
}

function validateLifecycle(actions: readonly CampaignAction[], role: "leader" | "party"): void {
  const states = new Map<number, "accepted" | "objectives-complete" | "rewarded">();
  for (const action of actions)
    for (const change of action.questChanges) {
      const current = states.get(change.questId);
      if (current === undefined && change.state !== "accepted")
        throw new Error(
          `${role} guide reaches ${change.state} for quest ${change.questId} before its pickup.`,
        );
      if (current !== undefined && change.state === "accepted")
        throw new Error(`${role} guide accepts quest ${change.questId} more than once.`);
      if (current === "rewarded")
        throw new Error(
          `${role} guide changes rewarded quest ${change.questId} back to ${change.state}.`,
        );
      states.set(change.questId, change.state);
    }
  const incomplete = [...states]
    .filter(([, state]) => state !== "rewarded")
    .map(([questId]) => questId)
    .sort((left, right) => left - right);
  if (incomplete.length)
    throw new Error(`${role} guide leaves quest ${incomplete.join(", ")} without a hand-in.`);
}

function compileRole(
  plan: CampaignPlan,
  actions: readonly CampaignAction[],
  role: "leader" | "party",
): { readonly lua: readonly string[]; readonly summary: CampaignAddonGuideSummary } {
  const filtered = normalizeRoleActions(
    actions.filter((action) => role === "leader" || !action.leaderOnly),
    role,
  );
  validateLifecycle(filtered, role);
  const race = raceLabels[plan.race];
  const className = classLabels[plan.leaderClass!];
  const roleTitle = role === "leader" ? "Leader" : "Party";
  const group = `KFC Forever Premade 5 · ${race} ${className} · ${roleTitle}`;
  const legs = plan.legs
    .map((leg) => ({
      leg,
      actions: filtered.filter((action) => action.legId === leg.id),
    }))
    .filter((entry) => entry.actions.length > 0);
  if (!legs.length) throw new Error(`${roleTitle} guide has no actions.`);
  const names = legs.map(
    ({ leg }, index) =>
      `${String(index + 1).padStart(2, "0")} · ${leg.from}-${leg.to} · ${oneLine(leg.title, "Leg title")}`,
  );
  const lua: string[] = [];
  for (const [index, entry] of legs.entries()) {
    const lines = [
      "#forever",
      "<< Alliance",
      `#name ${names[index]}`,
      "#version 1",
      `#group ${group}`,
    ];
    if (role === "leader") lines.push(`#defaultfor ${race} ${className}`);
    if (names[index + 1]) lines.push(`#next ${names[index + 1]}`);
    lines.push("");
    for (const action of entry.actions) lines.push(...actionLines(action));
    lua.push(`RXPGuides.RegisterGuide(${luaLongString(`${lines.join("\n")}\n`)})`);
  }
  return {
    lua,
    summary: {
      role,
      group,
      names,
      actionIds: filtered.map((action) => action.id),
    },
  };
}

export function compileCampaignAddon(
  plan: CampaignPlan,
  actions: readonly CampaignAction[],
  options: CampaignAddonOptions,
): CampaignAddonArtifact {
  if (!plan.leaderClass) throw new Error("Campaign addon requires an exact leader class.");
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(options.version))
    throw new Error("Campaign addon version must be semantic.");
  if (!Number.isInteger(options.runtimeBuild) || options.runtimeBuild <= 0)
    throw new Error("Campaign addon runtime build is invalid.");
  if (!Number.isInteger(options.interfaceVersion) || options.interfaceVersion <= 0)
    throw new Error("Campaign addon interface version is invalid.");
  if (!/^v\d+\.\d+\.\d+$/.test(options.restedXpVersion))
    throw new Error("RestedXP version must use the vX.Y.Z form.");
  if (!actions.length) throw new Error("Campaign addon requires executable actions.");
  if (new Set(actions.map((action) => action.id)).size !== actions.length)
    throw new Error("Campaign addon action IDs must be unique.");
  const knownLegs = new Set(plan.legs.map((leg) => leg.id));
  const orphan = actions.find((action) => !knownLegs.has(action.legId));
  if (orphan) throw new Error(`Campaign action has no package leg: ${orphan.id}`);
  const leader = compileRole(plan, actions, "leader");
  const party = compileRole(plan, actions, "party");
  const browser =
    options.browserBaseUrl ?? "https://kfcguild.online/tools/forever/leveling/premade";
  const query = `?race=${encodeURIComponent(plan.race)}&class=${encodeURIComponent(plan.leaderClass)}`;
  const grindCheckpoints = [
    ...new Set(
      actions
        .filter((action) => action.kind === "xp-check" && action.targetLevel !== null)
        .map((action) => action.id),
    ),
  ].sort();
  const bootstrap = [
    "local _, namespace = ...",
    `namespace.release = ${JSON.stringify(plan.release)}`,
    `namespace.compiler = ${JSON.stringify(CAMPAIGN_ADDON_COMPILER_REVISION)}`,
    `namespace.sourceBuild = ${plan.targetBuild}`,
    `namespace.runtimeBuild = ${options.runtimeBuild}`,
    "namespace.grindCheckpoints = {",
    ...grindCheckpoints.map((checkpoint) => `  [${JSON.stringify(checkpoint)}] = true,`),
    "}",
    "namespace.questValidationPrerequisites = {",
    ...[...new Set(actions.flatMap((action) => action.sourceGateConflictQuestIds ?? []))]
      .sort((a, b) => a - b)
      .map((questId) => {
        const gate = questEligibility(questId, plan.rewardFacts).gate;
        const ids = gate ? [...new Set(gateQuestIds(gate))].sort((a, b) => a - b) : [];
        if (ids.length > 50)
          throw new Error("Quest validation prerequisite count exceeds its budget.");
        return `  [${questId}] = { ${ids.join(", ")} },`;
      }),
    "}",
    'if not RXPGuides or type(RXPGuides.RegisterGuide) ~= "function" then return end',
    "local _, build = GetBuildInfo()",
    "if tonumber(build) ~= namespace.runtimeBuild then",
    '  print("KFC guide: this review package targets build " .. namespace.runtimeBuild .. ". Open the browser guide for an updated package.")',
    "  return",
    "end",
    ...leader.lua,
    ...party.lua,
  ];
  return {
    toc: `## Interface: ${options.interfaceVersion}\n## Title: KFC Forever Guides · Premade 5 Review\n## Notes: Source-ordered five-player route. Actual party XP gates and in-game review are required.\n## Author: KFC Guild\n## Version: ${options.version}\n## Dependencies: RXPGuides\n## SavedVariables: KFCForeverGuideEvidence\nGuides.lua\nObserver.lua\nGrindObserver.lua\nQuestObserver.lua\n`,
    lua: `${bootstrap.join("\n")}\n`,
    readme: `KFC Forever Guides ${options.version} — Premade 5 review package\n\nEdition: ${raceLabels[plan.race]} ${classLabels[plan.leaderClass]} leader.\nSource guide build: ${plan.targetBuild}. Review runtime build: ${options.runtimeBuild}.\nTested parser target: RestedXP ${options.restedXpVersion}; Interface ${options.interfaceVersion}.\nCampaign release: ${plan.release}. Compiler: ${CAMPAIGN_ADDON_COMPILER_REVISION}.\n\nThis ZIP contains two guide groups. The designated leader uses the Leader group. Other party members finish their own normal personal starter route, then use the Party group for shared work. Leader-only steps are intentionally absent from the Party group.\n\nThe addon cannot see all five players' XP bars or web progress. At every XP checkpoint, stop until the browser confirms every participating player is ready. Do not skip accepted chains, prerequisites, or dungeon preparation because one character is ahead.\n\nThis is a review artifact, not a playtested public release. ${plan.rewardNotice ?? "Reward evidence remains under review."} Combat timing is not calibrated, and late content can be inaccessible during the current beta. Keep the previous KFC folder for rollback. Never overwrite RXPGuides or its SavedVariables.\n\n/kfcguide xp records the current level curve value.\n/kfcguide observe enables bounded quest turn-in evidence until reload; /kfcguide stop stops it.\n/kfcguide combat records bounded passive kill-XP messages with public party/map context until reload.\n/kfcguide grind <checkpoint-id> starts a bounded checkpoint measurement; use grind stop when the XP checkpoint is reached.\n/kfcguide validate <quest-id> <kind> records a bounded manual quest-validation session until validate stop.\n/reload writes KFCForeverGuideEvidence to the addon SavedVariables file.\n\nBrowser route: ${browser}${query}\n`,
    guides: [leader.summary, party.summary],
  };
}
