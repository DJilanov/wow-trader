import { createHash } from "node:crypto";
import console from "node:console";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import { z } from "zod";
import data from "./data/forever-healer-tier-list.json";
import { healerTierSnapshotSchema, type HealerTierSnapshot } from "./forever-healer-tier-list";
import { verifyTierSourceBindings } from "./forever-tier-source-bindings";
import { simulatorDirectory } from "./forever-simulator";
import {
  healerTierPolicy,
  healerTierDemand,
} from "../../../../infra/simulator/current-tier-policy.mjs";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const readHealerTierSnapshot = cache(async function readHealerTierSnapshot(
  directory: string = simulatorDirectory(),
  source: unknown = data,
): Promise<HealerTierSnapshot | null> {
  try {
    const snapshot = healerTierSnapshotSchema.parse(source);
    if (
      snapshot.policySha256 !== hash(healerTierPolicy) ||
      hash(snapshot.policy) !== hash(healerTierPolicy)
    )
      throw new Error("Healer comparison policy changed");
    for (const entry of snapshot.entries) {
      const demand = healerTierDemand(entry.assignment);
      if (
        entry.demandSha256 !== hash(demand) ||
        entry.metrics.plannedIncomingPostMitigationDamage !==
          demand.damage.reduce(
            (sum: number, event: { amount: number }): number => sum + event.amount,
            0,
          )
      )
        throw new Error("Healer comparison workload changed");
    }
    await verifyTierSourceBindings(directory, snapshot.sourceBindings);
    for (const profile of [
      "healing-priest",
      "healing-druid",
      "healing-shaman",
      "healing-paladin",
    ] as const) {
      const path = "healing/" + (profile === "healing-priest" ? "" : profile + "/") + "active.json";
      const active = z
        .object({
          release: z.string(),
          modelIdentity: z.string(),
          files: z.record(z.string(), z.object({ sha256: z.string() }).passthrough()),
        })
        .passthrough()
        .parse(JSON.parse(await readFile(join(directory, path), "utf8")));
      if (
        snapshot.entries.some(
          (entry) =>
            entry.profile === profile &&
            (entry.release !== active.release ||
              entry.modelIdentity !== active.modelIdentity ||
              entry.wasmSha256 !== active.files["healing.wasm"]?.sha256),
        )
      )
        throw new Error("Healer result differs from its selected model");
    }
    return snapshot;
  } catch (error: unknown) {
    console.warn(
      "[simulator] Healer rankings unavailable",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return null;
  }
});
