import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  druidHealingItemUseSchema,
  druidHealingJobSchema,
  druidHealingReplySchema,
  druidHealerLibrarySchema,
} from "./druid-healing-simulator.js";

const bytes = readFileSync(
  new URL("./fixtures/druid-item-use-transport.v1.json.gz", import.meta.url),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "94b0bc31c67758cf0c01d9ff60c58aa1e13b0696b389107e9ce18ab64ba9e312",
);
const fixture = z
  .object({
    schema: z.literal("kfc-druid-item-use-transport-fixture.v1"),
    jobs: z.array(z.unknown()).length(56),
    replies: z.array(z.unknown()).length(56),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString()));
const jobs = fixture.jobs.map((input) => druidHealingJobSchema.parse(input));
const policy = jobs.find((job) => job.workload.utilityProbe)?.workload.utilityProbe;
if (!policy) throw new Error("Captured coupled item-use policy is missing");

describe("Actual Druid item-use transport", () => {
  it("accepts all 56 real selected jobs and results, including both critical hypotheses", () => {
    expect(jobs.filter((job) => job.workload.utilityProbe)).toHaveLength(32);
    expect(
      new Set(
        jobs.flatMap((job) =>
          job.workload.utilityProbe ? [job.workload.utilityProbe.recombobulatorCanCrit] : [],
        ),
      ),
    ).toEqual(new Set([false, true]));
    for (const [index, job] of jobs.entries()) {
      const reply = druidHealingReplySchema.parse(fixture.replies[index]);
      expect(reply.id).toBe(job.id);
      expect(reply.status).toBe("complete");
      if (reply.status !== "complete") throw new Error("Captured completed job expected");
      expect(reply.result.survivalRate).toBe(1);
      expect(reply.result.utilityProbe).toEqual(job.workload.utilityProbe);
    }
  });
  it("admits only the actual coupled use with captured zero coefficients", () => {
    for (const change of [
      { mode: "optimistic-contender" },
      { headmasterIntellect: 20 },
      { circle: true },
      { gauntlets: true },
      { baronRegeneration: true },
      { recombobulatorHealingCoefficient: 1 },
      { recombobulatorManaCoefficient: 1 },
      { recombobulatorTarget: "tank-heal-caster-mana" },
      { infiniteCharges: true },
    ])
      expect(() => druidHealingItemUseSchema.parse({ ...policy, ...change })).toThrow();
    expect(() => druidHealingItemUseSchema.parse({ ...policy, minimumMissingMana: -1 })).toThrow();
  });
  it("normalizes omitted zero/false echo fields without granting another effect", () => {
    const minimal = {
      ...policy,
      recombobulatorCanCrit: undefined,
      recombobulatorHealingCoefficient: undefined,
      recombobulatorManaCoefficient: undefined,
    };
    const parsed = druidHealingItemUseSchema.parse(minimal);
    expect(parsed.recombobulatorCanCrit).toBe(false);
    expect(parsed.recombobulatorHealingCoefficient).toBe(0);
    expect(parsed.recombobulatorManaCoefficient).toBe(0);
    expect(parsed.mode).toBe("recombobulator-timed-use");
  });
  it("requires the admitted capability, Engineering and actual ownership in published builds", () => {
    const raw = JSON.parse(
      gunzipSync(
        readFileSync(new URL("./fixtures/druid-healer-library.v1.json.gz", import.meta.url)),
      ).toString(),
    );
    const library = druidHealerLibrarySchema.parse(raw);
    const first = library.builds[0]!;
    first.workload.utilityProbe = policy;
    expect(druidHealerLibrarySchema.safeParse(library).success).toBe(false);
    library.supportedItemUses = ["major-recombobulator"];
    const missing = druidHealerLibrarySchema.safeParse(library);
    expect(missing.success).toBe(false);
    if (!missing.success)
      expect(
        missing.error.issues.some((issue) => issue.message.includes("requires the equipped item")),
      ).toBe(true);
    first.gear[12] = { id: 18637 };
    expect(druidHealerLibrarySchema.safeParse(library).success).toBe(true);
    library.professions = ["Alchemy", "Tailoring"];
    const wrongProfession = druidHealerLibrarySchema.safeParse(library);
    expect(wrongProfession.success).toBe(false);
    if (!wrongProfession.success)
      expect(
        wrongProfession.error.issues.some((issue) =>
          issue.message.includes("supported Engineering model"),
        ),
      ).toBe(true);
  });
});
