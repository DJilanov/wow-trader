import assert from "node:assert/strict";
import test from "node:test";

import { compileQuestValidationPlan } from "./leveling-quest-validation-plan.mjs";

const input = {
  runtimeBuild: 70450,
  backlogSha256: "a".repeat(64),
  questEvidenceSha256: "b".repeat(64),
};

test("compiles exact validation commands and disputed level context", () => {
  const plan = compileQuestValidationPlan(
    {
      schema: "campaign-evidence-backlog.v1",
      targetBuild: 70205,
      tasks: [
        {
          code: "pickup-level-conflict",
          questId: 153,
          actionId: "accept-153",
          editions: ["human:warrior"],
          players: [1],
        },
        { code: "reward-historical-estimate", questId: 977 },
      ],
    },
    {
      schema: "campaign-quest-source-evidence.v1",
      quests: [
        {
          questId: 153,
          title: "Red Leather Bandanas",
          sourceUrl: "https://www.wowhead.com/forever/quest=153",
          minimumLevel: 10,
          questLevel: 15,
          minimumClaims: [
            { value: 9, source: "curated-route" },
            { value: 10, source: "questiedb-historical" },
          ],
        },
      ],
    },
    input,
  );
  assert.equal(plan.summary.tasks, 1);
  assert.equal(plan.runtimeBuild, 70450);
  assert.equal(plan.tasks[0].command, "/kfcguide validate 153 pickup-level");
  assert.deepEqual(plan.tasks[0].minimumClaims, [
    { value: 9, source: "curated-route" },
    { value: 10, source: "questiedb-historical" },
  ]);
});

test("keeps missing metadata explicit and rejects duplicate validation tasks", () => {
  const evidence = { schema: "campaign-quest-source-evidence.v1", quests: [] };
  const incomplete = compileQuestValidationPlan(
    {
      schema: "campaign-evidence-backlog.v1",
      tasks: [{ code: "quest-lifecycle-unverified", questId: 1053 }],
    },
    evidence,
    input,
  );
  assert.equal(incomplete.summary.tasksMissingQuestMetadata, 1);
  assert.equal(incomplete.tasks[0].title, null);
  assert.throws(
    () =>
      compileQuestValidationPlan(
        {
          schema: "campaign-evidence-backlog.v1",
          tasks: [
            { code: "named-target-unverified", questId: 19 },
            { code: "named-target-unverified", questId: 19 },
          ],
        },
        {
          schema: "campaign-quest-source-evidence.v1",
          quests: [{ questId: 19 }],
        },
        input,
      ),
    /Duplicate quest validation task/,
  );
});
