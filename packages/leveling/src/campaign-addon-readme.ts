import type { CampaignPlan } from "./campaign.js";
import type { CampaignAddonOptions } from "./campaign-addon.js";

interface ReadmeDetails {
  readonly edition: string;
  readonly compilerRevision: string;
  readonly browserUrl: string;
  readonly partyMemberEdition: string | null;
}

export function campaignAddonReadme(
  plan: CampaignPlan,
  options: CampaignAddonOptions,
  details: ReadmeDetails,
): string {
  const groups = details.partyMemberEdition
    ? `This ZIP contains two guide groups. The designated leader uses the Leader group. The Party group includes the ${details.partyMemberEdition} member's own starter, then automatically continues to the shared route. Each member must use their own race/class export. Already finished your starter? Select the first shared chapter in that Party group.`
    : "This ZIP contains two guide groups. The designated leader uses the Leader group. Other party members finish their own normal personal starter route, then use the Party group for shared work. Leader-only steps are intentionally absent from the Party group. To include a member's personal starter, generate an export for their race and class.";
  const observation =
    options.includeObservers !== false
      ? [
          "/kfcguide xp records the current level curve value.",
          "/kfcguide observe enables bounded quest turn-in evidence until reload; /kfcguide stop stops it.",
          "/kfcguide combat records bounded passive kill-XP messages with public party/map context until reload.",
          "/kfcguide grind <checkpoint-id> starts a bounded checkpoint measurement; use grind stop when the XP checkpoint is reached.",
          "/kfcguide validate <quest-id> <kind> records a bounded manual quest-validation session until validate stop.",
          "/reload writes KFCForeverGuideEvidence to the addon SavedVariables file.",
        ].join("\n")
      : "This guide-only ZIP does not collect observations or install /kfcguide commands.";
  return (
    [
      `KFC Forever Guides ${options.version} — Premade 5 review package`,
      [
        `Edition: ${details.edition} leader.`,
        `Source guide build: ${plan.targetBuild}. Review runtime build: ${options.runtimeBuild}.`,
        `Parser target: RestedXP ${options.restedXpVersion}; Interface ${options.interfaceVersion}.`,
        `Campaign release: ${plan.release}. Compiler: ${details.compilerRevision}.`,
      ].join("\n"),
      groups,
      "Your own real XP is checked by RestedXP. A separate party-ready step asks you to confirm in party chat that everyone has reached the required level before continuing. The guide cannot see other players' XP or web progress. Do not skip accepted chains, prerequisites, or dungeon preparation because one character is ahead.",
      "Native source instructions are filtered to retained quest phases and the selected race/class. The campaign's explicit sequential action order replaces source sticky/parallel labels and optional grinding. Source XP suggestions never replace the campaign's required XP gates.",
      `This is a review artifact, not a playtested public release. ${plan.rewardNotice ?? "Reward evidence remains under review."} Combat timing is not calibrated, and late content can be inaccessible during the current beta. Keep the previous KFC folder for rollback. Never overwrite RXPGuides or its SavedVariables.`,
      "ZIP installation: extract KFCForeverGuides into Interface/AddOns. Keep RXPGuides installed. Restart the game, enable KFC Forever Guides, then select the appropriate KFC group in RestedXP. Paste imports and this ZIP contain the same guide documents; use only one method to avoid duplicate groups. Stock paste imports are Forever-only, but only the ZIP bootstrap enforces the exact client build.",
      observation,
      `Browser route: ${details.browserUrl}`,
    ].join("\n\n") + "\n"
  );
}
