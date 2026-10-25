import {
  assertPaladinHealingJob,
  parsePaladinHealingJobReply,
} from "./paladin-healing-protocol.mjs";

/** Install the isolated Go/WASM healing executor in a classic Web Worker.
 * @param {{runtimeURL: string, wasmURL: string}} assets @returns {void}
 */
export function installPaladinHealingWorker({ runtimeURL, wasmURL }) {
  let stopped = false;
  function fatal(error) {
    if (stopped) return;
    stopped = true;
    globalThis.postMessage({ type: "fatal", error: String(error?.message ?? error) });
    globalThis.close();
  }
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  globalThis.kfcHealingWasmReady = () => {
    readyResolve();
    globalThis.postMessage({ type: "ready", schema: "kfc-paladin-healing-job.v1" });
  };
  globalThis.onmessage = async (event) => {
    try {
      if (event.data?.type !== "run") throw new Error("Unknown healing worker operation");
      const job = event.data.job;
      assertPaladinHealingJob(job);
      await ready;
      if (stopped) return;
      globalThis.postMessage({ type: "started", id: job.id });
      const reply = parsePaladinHealingJobReply(
        globalThis.kfcHealingSimulate(JSON.stringify(job)),
        job.id,
        job.detail,
      );
      globalThis.postMessage({ type: "result", reply });
    } catch (error) {
      fatal(error);
    }
  };
  ready.catch(fatal);
  (async () => {
    try {
      globalThis.importScripts(runtimeURL);
      const go = new globalThis.Go();
      const response = await globalThis.fetch(wasmURL);
      if (!response.ok) throw new Error(`Healing engine fetch failed: ${response.status}`);
      const result = await globalThis.WebAssembly.instantiate(
        await response.arrayBuffer(),
        go.importObject,
      );
      go.run(result.instance).then(
        () => fatal(new Error("Healing engine exited")),
        (error) => {
          readyReject(error);
          fatal(error);
        },
      );
    } catch (error) {
      readyReject(error);
      fatal(error);
    }
  })();
}
