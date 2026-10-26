import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertShamanRecipientManaPolicy,
  renderShamanManaRecipients,
} from "./shaman-mana-recipients.mjs";
const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-mana-recipient-parent.v1.json.gz", import.meta.url)),
  ),
);
const base = {
  schema: "kfc-shaman-recipient-mana.v1",
  id: "declared-resource-demand",
  regeneration: "none-reference",
  payment: "all-or-nothing-no-retry-reference",
  timing: "spend-before-pulses-reference",
  recipients: [
    {
      raidIndex: 1,
      maximumMana: 1000,
      startingMana: 500,
      costs: [
        { atMs: 1000, amount: 600 },
        { atMs: 2000, amount: 400 },
      ],
    },
  ],
};
test("explicit mana capacity, availability, costs and ordering are required", () => {
  assertShamanRecipientManaPolicy(base, 12);
  assertShamanRecipientManaPolicy({ ...base, timing: "spend-after-pulses-reference" }, 12);
  assertShamanRecipientManaPolicy(
    { ...base, recipients: [{ ...base.recipients[0], costs: null }] },
    12,
  );
  assertShamanRecipientManaPolicy(
    { ...base, recipients: [{ raidIndex: 1, maximumMana: 0.1, startingMana: 0, costs: [] }] },
    12,
  );
  for (const edit of [
    (value) => {
      delete value.recipients[0].startingMana;
    },
    (value) => {
      value.regeneration = "unlimited";
    },
    (value) => {
      value.payment = "partial";
    },
    (value) => {
      value.timing = "guessed";
    },
    (value) => {
      value.extra = 0;
    },
    (value) => {
      value.recipients[0].extra = 0;
    },
    (value) => {
      value.recipients[0].costs[0].extra = 0;
    },
  ]) {
    const value = structuredClone(base);
    edit(value);
    assert.throws(() => assertShamanRecipientManaPolicy(value, 12));
  }
});
test("invalid slots, pools, duplicate recipients and invalid cost timestamps reject", () => {
  for (const edit of [
    (value) => {
      value.recipients.push(structuredClone(value.recipients[0]));
    },
    (value) => {
      value.recipients[0].raidIndex = 40;
    },
    (value) => {
      value.recipients[0].maximumMana = Infinity;
    },
    (value) => {
      value.recipients[0].startingMana = 1001;
    },
    (value) => {
      value.recipients[0].startingMana = NaN;
    },
    (value) => {
      value.recipients[0].costs[0].atMs = 12000;
    },
    (value) => {
      value.recipients[0].costs[0].atMs = 0.5;
    },
    (value) => {
      value.recipients[0].costs[0].amount = -1;
    },
  ]) {
    const value = structuredClone(base);
    edit(value);
    assert.throws(() => assertShamanRecipientManaPolicy(value, 12));
  }
});
test("cost-count limit applies across the entire recipient roster", () => {
  const value = structuredClone(base);
  value.recipients[0].costs = Array.from({ length: 10001 }, () => ({ atMs: 1, amount: 1 }));
  value.recipients.push({ ...value.recipients[0], raidIndex: 2 });
  assert.throws(() => assertShamanRecipientManaPolicy(value, 12));
});
test("the old spell-only request validator is unchanged and only the equipped frame gains mana", () => {
  const result = renderShamanManaRecipients(fixture.sources),
    start = fixture.sources.definitions.indexOf("func validateKFCShamanWorkloadRequest("),
    end = fixture.sources.definitions.indexOf(
      "func (resto *RestorationShaman) validateKFCShamanWorkloadPriority(",
    );
  assert(result.definitions.includes(fixture.sources.definitions.slice(start, end)));
  assert(!result.definitions.includes("RecipientMana *KFCShamanRecipientManaPolicy"));
  assert.equal(result.equipped.split('json:"recipientMana,omitempty"').length, 3);
  assert(result.equipped.includes("RecipientMana:frame.RecipientMana"));
});
test("mana setup happens before initialization; initial availability and costs reset every iteration", () => {
  const result = renderShamanManaRecipients(fixture.sources),
    core = readFileSync(new URL("./healing-mana-recipients.go", import.meta.url), "utf8");
  assert(core.indexOf("dummy.EnableManaBar()") < core.indexOf("env.initialize("));
  assert(core.includes("return NewSim(request, signals), nil"));
  assert(result.runner.includes("core.NewKFCManaRecipientSimulation("));
  assert(result.runner.indexOf("recipientMana.reset(") < result.runner.indexOf("sim.PrePull()"));
  assert(result.runner.indexOf("recipientMana.schedule(") > result.runner.indexOf("sim.PrePull()"));
  assert(result.runner.includes("recipientMana.finish(assignment)"));
});
test("mana metrics stay separate from healing and temporary Intellect expiry clamps capacity", () => {
  const result = renderShamanManaRecipients(fixture.sources);
  assert(result.definitions.includes('json:"recipientUnpaidManaMean,omitempty"'));
  assert(result.definitions.includes('json:"finalLivingRecipientManaMean,omitempty"'));
  assert(result.utility.includes("character.SpendMana(sim,loss,metrics)"));
  assert(result.utility.includes("character.CurrentMana()-character.MaxMana()"));
  assert.throws(() => renderShamanManaRecipients(result));
  assert.deepEqual(
    fixture.sources,
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("./fixtures/shaman-mana-recipient-parent.v1.json.gz", import.meta.url),
        ),
      ),
    ).sources,
  );
});
