import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { batchCampaignVisits } from "./campaign-visit-flow.js";

/** Sort bounded visit windows while retaining their original source actions and leg identity. */
export function batchCampaignVisitWindows(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  legId: string,
  barriers: ReadonlySet<string>,
): readonly CampaignAction[] {
  const leg = plan.legs.find((entry) => entry.id === legId);
  if (!leg) throw new Error(`Visit window has no owning leg: ${legId}`);
  const entries = plan.actions.filter((action) => action.legId === legId);
  const first = plan.actions.findIndex((action) => action.legId === legId);
  if (!entries.length) return plan.actions;
  if (plan.actions.slice(first, first + entries.length).some((action) => action.legId !== legId))
    return plan.actions;
  const windows: CampaignAction[][] = [];
  let pending: CampaignAction[] = [];
  for (const action of entries) {
    if (barriers.has(action.id)) {
      if (pending.length) windows.push(pending);
      pending = [];
    } else pending.push(action);
  }
  if (pending.length) windows.push(pending);
  const result = [...plan.actions];
  for (const window of windows) {
    if (window.length < 2) continue;
    const offset = result.findIndex((action) => action.id === window[0]!.id);
    const previous = result
      .slice(0, offset)
      .reverse()
      .find((action) => action.location);
    // The real preceding location seeds the sorter; it never enters the scheduled window.
    const scoped: CampaignPlan = {
      ...plan,
      actions: [...(previous ? [{ ...previous, legId: `${legId}-origin` }] : []), ...window],
      legs: [{ ...leg, actionIds: window.map((action) => action.id) }],
    };
    const sorted = batchCampaignVisits(scoped, sources).actions.filter(
      (action) => action.legId === legId,
    );
    result.splice(offset, window.length, ...sorted);
  }
  return result.every((action, index) => action === plan.actions[index]) ? plan.actions : result;
}
