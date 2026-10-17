import assert from "node:assert/strict";
import { resolve, sep } from "node:path";
import { simulationHash } from "./simulation-cache.mjs";
import { selectedTalentEvidence } from "./talent-search.mjs";

export function feedbackOutputPath(kind, stdout, root) {
  assert(["talents", "gear", "feedback", "browser", "review"].includes(kind));
  const lines = stdout.trim().split(/\r?\n/);
  let output;
  if (kind === "talents") {
    output = lines
      .findLast((line) => /^(Fury|Arms) talent evidence saved: /.test(line))
      ?.replace(/^(Fury|Arms) talent evidence saved: /, "")
      .split("; ")[0];
  } else if (kind === "gear") {
    const prefix = "Finished 1 profiles. Report: ";
    output = lines.findLast((line) => line.startsWith(prefix))?.slice(prefix.length);
    assert(output?.endsWith("-results.json"), "Missing completed gear report");
    output = output.replace(/-results\.json$/, "-gear.json");
  } else {
    for (const line of [...lines].reverse()) {
      if (!line.startsWith("{")) continue;
      const result = JSON.parse(line);
      if (typeof result.output === "string") {
        output = result.output;
        break;
      }
    }
  }
  assert(typeof output === "string" && output.endsWith(".json"), "Missing artifact output");
  const path = resolve(root, output);
  const directory = resolve(root, "artifacts/forever-simulator/optimization");
  assert(path.startsWith(directory + sep), "Feedback artifact escaped the optimization directory");
  return path;
}

export async function runFuryFeedback(session, actions, save, maxRounds = 6) {
  assert.equal(session.profile, "warrior/fury");
  return runWarriorFeedback(session, actions, save, maxRounds);
}

export async function runWarriorFeedback(session, actions, save, maxRounds = 6) {
  assert.equal(session.schema, "kfc-prebis-feedback-session.v1");
  assert(["warrior/fury", "warrior/arms"].includes(session.profile));
  assert(Number.isSafeInteger(maxRounds) && maxRounds >= 1 && maxRounds <= 20);
  delete session.lastError;
  session.final = null;
  const load = async (reference) => {
    const value = await actions.read(reference.path);
    assert.equal(simulationHash(value), reference.sha256, "Feedback evidence changed on disk");
    return value;
  };
  await load(session.initialBaseline);
  if (session.initialGear) await load(session.initialGear);
  for (const step of session.steps) await load(step.output);
  const step = async (kind, inputs) => {
    const identity = simulationHash({ kind, inputs });
    const existing = session.steps.find((entry) => entry.identity === identity);
    if (existing) return existing.output;
    session.active = { kind, inputs };
    session.status = "running";
    await save(session);
    const path = await actions.execute(kind, inputs);
    const value = await actions.read(path);
    const output = { path, sha256: simulationHash(value) };
    session.steps.push({ identity, kind, inputs, output });
    session.active = null;
    await save(session);
    return output;
  };
  let baseline = session.initialBaseline;
  let gear = session.initialGear;
  if (gear) {
    const input = await load(baseline);
    const reviewed = await load(gear);
    assert.equal(`${reviewed.result?.profile}/${reviewed.result?.variant}`, session.profile);
    assert.equal(reviewed.result.requestSha256, simulationHash(input.requestBase64));
    baseline = await step("feedback", { baseline, gear });
  }
  for (let round = 0; round <= maxRounds; round++) {
    const input = await load(baseline);
    assert.equal(`${input.profile}/${input.variant}`, session.profile);
    const talents = await step("talents", { baseline });
    const talentReview = await load(talents);
    assert.equal(talentReview.baselineSha256, simulationHash(input));
    selectedTalentEvidence(talentReview, input);
    assert(
      talentReview.validation.every((row) =>
        [row.baseline, row.candidate].every(
          (metric) => metric.iterations >= (session.validationIterationsPerSeed ?? 20000),
        ),
      ),
      "Talent evidence is below the requested validation precision",
    );
    const gearReview = gear ? await load(gear) : null;
    if (
      !talentReview.validated &&
      gearReview?.result.converged === true &&
      (await actions.hasCurrentCoverage(gearReview.result, input))
    ) {
      const browser = await step("browser", { baseline });
      const review = await step("review", { baseline, gear, talents, browser });
      assert.equal((await load(review)).status, "closed-loop-verified");
      session.status = "closed-loop-reviewed";
      session.final = { baseline, gear, talents, browser, review };
      session.active = null;
      await save(session);
      return session;
    }
    if (round === maxRounds) break;
    gear = await step("gear", { baseline, talents });
    const measured = await load(gear);
    assert.equal(measured.result?.status, "simulation-complete-awaiting-browser-review");
    assert.equal(`${measured.result.profile}/${measured.result.variant}`, session.profile);
    baseline = await step("feedback", { baseline, gear });
  }
  session.status = "feedback-limit-reached";
  session.active = null;
  session.final = null;
  await save(session);
  return session;
}
