import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";

export const simulationHash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");

export async function createSimulationCache(directory, fingerprint, workers) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !workers.length)
    throw new Error("Invalid simulation cache identity");
  const root = join(directory, fingerprint);
  await mkdir(root, { recursive: true });
  const memory = new Map();
  const stats = { simulations: 0, iterations: 0, reused: 0 };
  const validate = (result, input) => {
    if (
      result.id !== input.id ||
      !Number.isFinite(result.dps) ||
      result.dps <= 0 ||
      !Number.isFinite(result.stdev) ||
      result.stdev < 0 ||
      result.iterations !== input.iterations ||
      result.error
    )
      throw new Error("Invalid cached simulation evidence");
    return result;
  };
  return {
    stats,
    async run(inputs) {
      const jobs = new Map();
      const ids = inputs.map((input) => {
        const { id: suppliedId, ...request } = input;
        if (suppliedId !== undefined) throw new Error("Simulation cache owns request IDs");
        const id = simulationHash(request);
        jobs.set(id, { ...request, id });
        return id;
      });
      const pending = [...jobs.values()];
      let next = 0;
      await Promise.all(
        workers.map(async (worker) => {
          while (next < pending.length) {
            const input = pending[next++];
            if (memory.has(input.id)) {
              stats.reused++;
              continue;
            }
            const path = join(root, input.id + ".json");
            try {
              const record = JSON.parse(await readFile(path, "utf8"));
              if (
                record.schema !== "kfc-simulation-evidence.v1" ||
                record.fingerprint !== fingerprint ||
                record.requestSha256 !== input.id
              )
                throw new Error("Simulation cache fingerprint mismatch");
              memory.set(input.id, validate(record.result, input));
              stats.reused++;
              continue;
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
            const result = validate(await worker.run(input), input);
            const temporary = path + "." + randomUUID() + ".pending";
            await writeFile(
              temporary,
              JSON.stringify({
                schema: "kfc-simulation-evidence.v1",
                fingerprint,
                requestSha256: input.id,
                result,
              }),
            );
            await rename(temporary, path);
            memory.set(input.id, result);
            stats.simulations++;
            stats.iterations += input.iterations;
          }
        }),
      );
      return ids.map((id) => memory.get(id));
    },
  };
}
