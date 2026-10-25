import type { ClassSlug } from "./model.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CampaignRace } from "./campaign-route.js";
import { gateQuestIds } from "./dungeon-model.js";
import { questEligibility } from "./quest-eligibility.js";
import { campaignPartyExport } from "./campaign-addon-party.js";
import { campaignAddonReadme } from "./campaign-addon-readme.js";
import { campaignPartyStarterSchema, type CampaignPartyStarter } from "./restedxp-documents.js";
import {
  CAMPAIGN_NATIVE_POLICY,
  campaignNativeInstructions,
  type CampaignNativeInstructions,
} from "./campaign-addon-native.js";

export const CAMPAIGN_ADDON_COMPILER_REVISION = "campaign-addon-20261025-v24" as const;

export interface CampaignAddonOptions {
  readonly version: string;
  readonly runtimeBuild: number;
  readonly interfaceVersion: number;
  readonly restedXpVersion: string;
  readonly browserBaseUrl?: string;
  readonly nativeSources?: readonly CampaignSource[];
  readonly includeObservers?: boolean;
  readonly partyStarter?: CampaignPartyStarter;
}

export interface CampaignAddonGuideSummary {
  readonly role: "leader" | "party";
  readonly group: string;
  readonly names: readonly string[];
  readonly actionIds: readonly string[];
  readonly requestedActionIds: readonly string[];
  readonly normalizations: readonly {
    readonly actionId: string;
    readonly reason: "duplicate-one-time-quest-phase";
    readonly removedQuestChanges: CampaignAction["questChanges"];
  }[];
}

export interface CampaignAddonArtifact {
  readonly toc: string;
  readonly lua: string;
  readonly readme: string;
  readonly guides: readonly CampaignAddonGuideSummary[];
  readonly documents: readonly CampaignAddonGuideDocument[];
  readonly nativePolicy: typeof CAMPAIGN_NATIVE_POLICY | "normalized-v1";
}

export interface CampaignAddonGuideDocument {
  readonly role: "leader" | "party";
  readonly group: string;
  readonly name: string;
  readonly content: string;
  readonly actionIds: readonly string[];
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

function questLines(
  action: CampaignAction,
  conditions: Readonly<Record<number, string>> = {},
): readonly string[] {
  return action.questChanges.map((change) => {
    const text = questInstruction(change);
    const directive =
      change.state === "accepted"
        ? `.accept ${change.questId}`
        : change.state === "rewarded"
          ? `.turnin ${change.questId}`
          : `.complete ${change.questId},${change.objectiveIndex ?? 1}`;
    const condition = conditions[change.questId];
    return `    ${directive} >> ${text}${condition ? ` << ${oneLine(condition, "Quest condition")}` : ""}`;
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

function actionLines(
  action: CampaignAction,
  nativeInstructions?: CampaignNativeInstructions,
): readonly string[] {
  if (action.kind === "unverified")
    throw new Error(`Unverified action ${action.id} cannot enter the addon package.`);
  const native = nativeInstructions?.(action);
  const condition = native?.condition ? ` << ${oneLine(native.condition, "Step condition")}` : "";
  const lines = [`step${condition}`, `    #label ${oneLine(`kfc-${action.id}`, "Action label")}`];
  if (action.bundleId) {
    if (action.questChanges.length || action.positions.length)
      throw new Error("Planning-only bundles cannot emit quest or location directives.");
    lines.push(
      "    >> PLANNING ONLY: four owner-confirmed faction quests. IDs, objectives and access details are pending. Skip this optional stop or use actual in-game information; no quest completion is inferred.",
    );
  }
  if (native) {
    for (const directive of native.directives) {
      const args = directive.arguments ? ` ${directive.arguments}` : "";
      const description =
        directive.tag === ".macro" ? directive.text.replaceAll("\n", "\\n") : directive.text;
      const text = description ? ` >> ${oneLine(description, "Native instruction")}` : "";
      const gate = directive.condition
        ? ` << ${oneLine(directive.condition, "Native condition")}`
        : "";
      lines.push(`    ${directive.tag}${args}${text}${gate}`);
    }
    if (native.canonicalQuestConditions)
      lines.push(...questLines(action, native.canonicalQuestConditions));
  } else lines.push(...positionLines(action), ...questLines(action));
  const xp = action.kind === "xp-check" || action.kind === "checkpoint" ? xpLine(action) : null;
  if (xp) lines.push(xp);
  const questText = new Set([
    ...action.questChanges.map(questInstruction),
    ...(native?.directives ?? [])
      .filter((directive) => directive.text)
      .map((directive) => oneLine(directive.text, "Native instruction")),
  ]);
  for (const instruction of action.instructions) {
    const text = oneLine(instruction, "Action instruction");
    if (!questText.has(text)) lines.push(`    >> ${text}`);
  }
  if (!xp && action.questChanges.length === 0 && action.instructions.length === 0)
    lines.push(`    >> ${oneLine(action.title, "Action title")}`);
  if (action.xpOptional && !xp)
    lines.push(
      "    >> Skip this extra XP work only when everyone in your party is ready for the next checkpoint.",
    );
  if (xp && !action.leaderOnly) {
    const bar =
      (action.targetCurrentXp ?? 0) > 0
        ? ` with at least ${action.targetCurrentXp!.toLocaleString("en-US")} XP into that level`
        : "";
    lines.push(
      "step",
      `    #label ${oneLine(`kfc-${action.id}-party-ready`, "Party readiness label")}`,
      `    +Is everyone level ${action.targetLevel}${bar}? Ask in party chat, then check this step to continue together. Your own XP is checked automatically; other players' XP is not visible to this guide.`,
    );
  }
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
  nativeInstructions?: CampaignNativeInstructions,
  personalActionIds: ReadonlySet<string> = new Set(),
  partyStarter?: CampaignPartyStarter,
): {
  readonly lua: readonly string[];
  readonly summary: CampaignAddonGuideSummary;
  readonly documents: readonly CampaignAddonGuideDocument[];
} {
  const requested = actions.filter(
    (action) => role === "leader" || !action.leaderOnly || personalActionIds.has(action.id),
  );
  const filtered = normalizeRoleActions(requested, role);
  const emitted = new Map(filtered.map((action) => [action.id, action]));
  const normalizations = requested.flatMap((action) => {
    const removedQuestChanges = action.questChanges.filter(
      (change) => !emitted.get(action.id)?.questChanges.includes(change),
    );
    return removedQuestChanges.length
      ? [
          {
            actionId: action.id,
            reason: "duplicate-one-time-quest-phase" as const,
            removedQuestChanges,
          },
        ]
      : [];
  });
  validateLifecycle(filtered, role);
  const race = raceLabels[plan.race];
  const className = classLabels[plan.leaderClass!];
  const roleTitle = role === "leader" ? "Leader" : "Party";
  const member = partyStarter
    ? ` · ${raceLabels[partyStarter.race]} ${classLabels[partyStarter.classSlug]}`
    : "";
  const group = `KFC Forever Premade 5 · ${race} ${className} · ${roleTitle}${member}`;
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
  const documents: CampaignAddonGuideDocument[] = [];
  for (const [index, entry] of legs.entries()) {
    const lines = [
      "#forever",
      `<< Alliance Forever${role === "leader" ? ` ${race} ${className}` : partyStarter ? ` ${raceLabels[partyStarter.race]} ${classLabels[partyStarter.classSlug]}` : ""}`,
      `#name ${names[index]}`,
      "#version 1",
      `#group ${group}`,
    ];
    if (role === "leader") lines.push(`#defaultfor ${race} ${className}`);
    if (names[index + 1]) lines.push(`#next ${names[index + 1]}`);
    lines.push("");
    for (const action of entry.actions) lines.push(...actionLines(action, nativeInstructions));
    const content = `${lines.join("\n")}\n`;
    documents.push({
      role,
      group,
      name: names[index]!,
      content,
      actionIds: entry.actions.map((action) => action.id),
    });
    lua.push(`RXPGuides.RegisterGuide(${luaLongString(content)})`);
  }
  return {
    lua,
    documents,
    summary: {
      role,
      group,
      names,
      actionIds: filtered.map((action) => action.id),
      requestedActionIds: requested.map((action) => action.id),
      normalizations,
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
  const nativeInstructions = options.nativeSources
    ? campaignNativeInstructions(plan, options.nativeSources)
    : undefined;
  const leader = compileRole(plan, actions, "leader", nativeInstructions);
  const starter = options.partyStarter
    ? campaignPartyStarterSchema.parse(options.partyStarter)
    : undefined;
  const partyRoute = starter ? campaignPartyExport(plan, actions, starter) : null;
  const personalNative =
    partyRoute && options.nativeSources
      ? campaignNativeInstructions(partyRoute.personalPlan, options.nativeSources)
      : undefined;
  const partyNative: CampaignNativeInstructions | undefined = nativeInstructions
    ? (action: CampaignAction) =>
        partyRoute?.personalActionIds.has(action.id)
          ? personalNative!(action)
          : nativeInstructions(action)
    : undefined;
  const party = compileRole(
    partyRoute?.plan ?? plan,
    partyRoute?.actions ?? actions,
    "party",
    partyNative,
    partyRoute?.personalActionIds,
    starter,
  );
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
  const observers = options.includeObservers !== false;
  const observerToc = observers
    ? "## SavedVariables: KFCForeverGuideEvidence\nGuides.lua\nObserver.lua\nGrindObserver.lua\nQuestObserver.lua\n"
    : "Guides.lua\n";
  return {
    toc: `## Interface: ${options.interfaceVersion}\n## Title: KFC Forever Guides · Premade 5 Review\n## Notes: Selected five-player route. Party-ready confirmations and in-game review are required.\n## Author: KFC Guild\n## Version: ${options.version}\n## Dependencies: RXPGuides\n${observerToc}`,
    lua: `${bootstrap.join("\n")}\n`,
    readme: campaignAddonReadme(plan, options, {
      edition: `${raceLabels[plan.race]} ${classLabels[plan.leaderClass]}`,
      compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
      browserUrl: `${browser}${query}`,
      partyMemberEdition: starter
        ? `${raceLabels[starter.race]} ${classLabels[starter.classSlug]}`
        : null,
    }),
    guides: [leader.summary, party.summary],
    documents: [...leader.documents, ...party.documents],
    nativePolicy: nativeInstructions ? CAMPAIGN_NATIVE_POLICY : "normalized-v1",
  };
}
