import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** @param {import('../../packages/leveling/dist/index.js').CampaignPlan} plan
 * @param {string} boundaryActionId
 * @returns {import('../../packages/leveling/dist/index.js').CampaignPlan} */
export function clipGuidePlan(plan, boundaryActionId) {
  const index = plan.actions.findIndex((action) => action.id === boundaryActionId);
  assert(index >= 0, "The requested hand-in is absent from the qualified route.");
  assert(
    plan.actions[index].questChanges.some((change) => change.state === "rewarded"),
    "The downloadable preview must end at a quest hand-in.",
  );
  const prefix = plan.actions.slice(0, index + 1);
  const paid = new Set(
    prefix.flatMap((action) =>
      action.questChanges
        .filter((change) => change.state === "rewarded")
        .map((change) => change.questId),
    ),
  );
  const unfinished = new Set(
    prefix.flatMap((action) =>
      action.questChanges
        .filter((change) => !paid.has(change.questId))
        .map((change) => change.questId),
    ),
  );
  const actions = prefix.flatMap((action) => {
    const changes = action.questChanges.filter((change) => paid.has(change.questId));
    if (action.questChanges.length && !changes.length) {
      assert(
        !action.movement &&
          !action.nativeUtilityTags?.length &&
          !action.itemCollections?.length &&
          !action.auctionSupplies?.length,
        "An unfinished quest carries a required utility step.",
      );
      return [];
    }
    assert(
      !(action.requiredQuestIds ?? []).some((id) => unfinished.has(id)) &&
        !(action.source?.conditions?.checks ?? []).some((check) =>
          check.arguments.split(",").some((id) => unfinished.has(Number(id))),
        ),
      "A retained step depends on an unfinished quest.",
    );
    if (changes.length === action.questChanges.length) return [action];
    const instructions = changes.map(
      (change) =>
        `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : "Complete"} ${change.title}`,
    );
    return [
      {
        ...action,
        questChanges: changes,
        title: instructions.join(" · "),
        instructions: [
          ...instructions,
          ...action.instructions.filter((line) => /^(?:Talk to |Target: )/.test(line)),
        ],
      },
    ];
  });
  const actionIds = new Set(actions.map((action) => action.id));
  const questIds = new Set(
    actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  return {
    ...plan,
    actions,
    legs: plan.legs.flatMap((leg) => {
      const entries = actions.filter((action) => action.legId === leg.id);
      return entries.length
        ? [
            {
              ...leg,
              actionIds: entries.map((action) => action.id),
              questIds: leg.questIds.filter((id) => questIds.has(id)),
              unresolvedQuestIds: leg.unresolvedQuestIds.filter((id) => questIds.has(id)),
            },
          ]
        : [];
    }),
    catchUpBatches: [],
    defaultCatchUpBatches: {},
    library: { revision: "source-backbone-20261021-v3", choices: [] },
    starters: { entries: [], routes: [] },
    ...(plan.itemRequirements
      ? { itemRequirements: plan.itemRequirements.filter((row) => questIds.has(row.questId)) }
      : {}),
    ...(plan.combat
      ? {
          combat: {
            ...plan.combat,
            activities: plan.combat.activities.filter((activity) =>
              actionIds.has(activity.actionId),
            ),
          },
        }
      : {}),
  };
}

/** @param {string} content @returns {string} */
export function tbcPreviewGuide(content) {
  assert(/^#forever\r?$/m.test(content), "TBC flow preview requires Forever documents.");
  return content
    .replace(/^#forever\r?$/m, "#tbc")
    .replace(/^<<[^\r\n]+/gm, (line) => line.replace(/\bForever\b/g, "TBC"));
}

/** @param {string} template @param {string} css @param {string} javascript
 * @param {{forever:readonly string[], tbc:readonly string[]}} guides @param {string} revision
 * @param {{levelRange:string, through:string, scope:string}} presentation
 * @returns {string} */
export function renderGuideDownload(template, css, javascript, guides, revision, presentation) {
  assert(!/<\/script/i.test(javascript), "The browser bundle contains a script terminator.");
  assert(/^\d{1,2}–\d{1,2}$/.test(presentation.levelRange), "Invalid guide level range.");
  assert(presentation.through.trim() && presentation.scope.trim(), "Guide coverage is missing.");
  const hash = (text) => createHash("sha256").update(text).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash(javascript)}'; style-src 'sha256-${hash(css)}'; connect-src 'none'; form-action 'none'; base-uri 'none'`;
  const payload = JSON.stringify({ schema: "kfc-local-guide-download.v1",
    fileRange: presentation.levelRange.replace("–", "-"), ...guides }).replaceAll(
    "<",
    "\\u003c",
  );
  assert(/^[a-zA-Z0-9._/-]+$/.test(revision), "Invalid preview revision.");
  const escape = (text) => text.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const values = { CSP: csp, STYLE: `<style>${css}</style>`,
    GUIDES: `<script id="guide-data" type="application/json">${payload}</script>`,
    SCRIPT: `<script>${javascript}</script>`, REVISION: revision,
    LEVEL_RANGE: escape(presentation.levelRange), THROUGH: escape(presentation.through),
    SCOPE: escape(presentation.scope) };
  return template.replace(
    /\{\{(CSP|STYLE|GUIDES|SCRIPT|REVISION|LEVEL_RANGE|THROUGH|SCOPE)\}\}/g,
    (_match, key) => values[key],
  );
}
