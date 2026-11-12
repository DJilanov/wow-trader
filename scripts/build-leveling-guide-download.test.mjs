import assert from "node:assert/strict";
import test from "node:test";
import {
  clipGuidePlan,
  renderGuideDownload,
  tbcPreviewGuide,
} from "./leveling-guide-download/prepare.mjs";

function fixture() {
  const action = (id, questChanges) => ({
    id,
    legId: "first",
    title: id,
    questChanges,
    instructions: ["Accept future quest", "Talk to Archivist"],
    source: null,
  });
  const change = (questId, state) => ({ questId, title: `Quest ${questId}`, state });
  return {
    actions: [
      action("start", [change(1, "accepted")]),
      action("exchange", [change(1, "rewarded"), change(2, "accepted")]),
      action("accept-last", [change(3, "accepted")]),
      action("hand-in", [change(3, "rewarded")]),
      { ...action("later", [change(2, "rewarded")]), legId: "later" },
    ],
    legs: [
      {
        id: "first",
        actionIds: ["start", "exchange", "accept-last", "hand-in"],
        questIds: [1, 2, 3],
        unresolvedQuestIds: [],
      },
      { id: "later", actionIds: ["later"], questIds: [2], unresolvedQuestIds: [] },
    ],
    itemRequirements: [{ questId: 1 }, { questId: 2 }],
    combat: { activities: [{ actionId: "exchange" }, { actionId: "later" }] },
  };
}

test("the preview ends at its hand-in and removes unused later pickups without mutating the route", () => {
  const input = fixture(),
    original = JSON.parse(JSON.stringify(input)),
    clipped = clipGuidePlan(input, "hand-in");
  assert.deepEqual(
    clipped.actions.map((row) => row.id),
    ["start", "exchange", "accept-last", "hand-in"],
  );
  assert.deepEqual(
    clipped.actions[1].questChanges.map((row) => [row.questId, row.state]),
    [[1, "rewarded"]],
  );
  assert.deepEqual(clipped.actions[1].instructions, ["Hand in Quest 1", "Talk to Archivist"]);
  assert.deepEqual(
    clipped.legs.map((row) => row.id),
    ["first"],
  );
  assert.deepEqual(clipped.itemRequirements, [{ questId: 1 }]);
  assert.deepEqual(clipped.combat.activities, [{ actionId: "exchange" }]);
  assert.deepEqual(input, original);
});

test("a cutoff cannot silently discard a prerequisite or a source condition", () => {
  for (const condition of ["prerequisite", "source"]) {
    const input = fixture();
    if (condition === "prerequisite") input.actions[3].requiredQuestIds = [2];
    else
      input.actions[3].source = { conditions: { checks: [{ arguments: "2", tag: ".isOnQuest" }] } };
    assert.throws(() => clipGuidePlan(input, "hand-in"), /depends on an unfinished quest/);
  }
});

test("the cutoff must be a real hand-in", () => {
  assert.throws(() => clipGuidePlan(fixture(), "missing"), /absent/);
  assert.throws(() => clipGuidePlan(fixture(), "start"), /quest hand-in/);
});

test("TBC flow preview changes the flavor while preserving quest and navigation commands", () => {
  const text = "#forever\n<< Alliance Forever\n#group KFC\n#next Second\n.accept 123\n";
  assert.equal(
    tbcPreviewGuide(text),
    "#tbc\n<< Alliance TBC\n#group KFC\n#next Second\n.accept 123\n",
  );
  assert.throws(() => tbcPreviewGuide("#tbc\n"), /Forever documents/);
});

test("inline guide text cannot terminate its data script and networking is disabled", () => {
  const html = renderGuideDownload(
    "{{CSP}}{{GUIDES}}{{SCRIPT}}",
    "body{}",
    "void 0;",
    { forever: ["</script><img src=x>"], tbc: ["#tbc"] },
    "review-1",
    { levelRange: "1–39", through: "Razorfen Downs", scope: "Through the last hand-in." },
  );
  assert(!html.includes("<img"));
  assert(html.includes("\\u003c/script>"));
  assert(html.includes("connect-src 'none'"));
  assert(html.includes("form-action 'none'"));
  assert(html.includes("script-src 'sha256-"));
});

test("coverage and filename range follow the reviewed release and text stays escaped", () => {
  const html = renderGuideDownload("{{LEVEL_RANGE}} {{THROUGH}} {{SCOPE}} {{GUIDES}}",
    "", "void 0;", { forever: ["#forever"], tbc: ["#tbc"] }, "review-2",
    { levelRange: "1–39", through: "Razorfen <Downs>", scope: 'Finish "Bring the Light".' });
  assert(html.includes("1–39 Razorfen &lt;Downs&gt; Finish &quot;Bring the Light&quot;."));
  assert(html.includes('"fileRange":"1-39"'));
  assert.throws(() => renderGuideDownload("", "", "", { forever: [], tbc: [] }, "review",
    { levelRange: "bad", through: "Dungeon", scope: "Route" }), /Invalid guide level range/);
});
