import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import process from "node:process";

/** Serialize atomic progress updates from concurrent workers in submission order.
 * @param {string} path @returns {(snapshot:object) => Promise<void>}
 */
export function createSimulatorProgressWriter(path) {
  let queued = Promise.resolve();
  return async function publish(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
      throw new TypeError("Simulator progress requires an object snapshot");
    const serialized = JSON.stringify(snapshot);
    if (serialized === undefined) throw new TypeError("Simulator progress is not serializable");
    const body = serialized + "\n";
    const pending = path + "." + process.pid + "." + randomUUID() + ".pending";
    async function update() {
      try {
        await writeFile(pending, body, { flag: "wx" });
        await rename(pending, path);
      } catch (error) {
        try {
          await rm(pending, { force: true });
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Progress update and cleanup failed");
        }
        throw error;
      }
    }
    const result = queued.then(update, update);
    queued = result;
    await result;
  };
}
