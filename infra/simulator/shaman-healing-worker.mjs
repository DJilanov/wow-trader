/** Install the Shaman executor with the same SDK parsers used by the page.
 * @param {{runtimeURL:string,wasmURL:string,parseJob:Function,parseReply:Function}} options @returns {void}
 */
export function installShamanHealingWorker({ runtimeURL, wasmURL, parseJob, parseReply }) {
  let stopped = false,
    busy = false,
    readyResolve,
    readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  function fatal(error) {
    if (stopped) return;
    stopped = true;
    readyReject(error);
    globalThis.postMessage({ type: "fatal", error: String(error?.message ?? error) });
    globalThis.close();
  }
  globalThis.kfcShamanEquippedWasmReady = () => {
    if (stopped) return;
    if (typeof globalThis.kfcShamanEquippedSimulate !== "function") {
      fatal(new Error("The Shaman engine callback is unavailable"));
      return;
    }
    readyResolve();
    globalThis.postMessage({ type: "ready", schema: "kfc-shaman-equipped-job.v1" });
  };
  globalThis.onmessage = async (event) => {
    try {
      if (event.data?.type !== "run" || busy)
        throw new Error("Unknown or overlapping Shaman worker operation");
      busy = true;
      const job = parseJob(event.data.job);
      await ready;
      if (stopped) return;
      globalThis.postMessage({ type: "started", id: job.id });
      const reply = parseReply(
        JSON.parse(globalThis.kfcShamanEquippedSimulate(JSON.stringify(job))),
      );
      if (reply.id !== job.id) throw new Error("The Shaman engine returned another job");
      busy = false;
      globalThis.postMessage({ type: "result", reply });
    } catch (error) {
      fatal(error);
    }
  };
  ready.catch(fatal);
  (async () => {
    try {
      globalThis.importScripts(runtimeURL);
      const go = new globalThis.Go(),
        response = await globalThis.fetch(wasmURL);
      if (!response.ok) throw new Error("Shaman engine fetch failed: " + response.status);
      const result = await globalThis.WebAssembly.instantiate(
        await response.arrayBuffer(),
        go.importObject,
      );
      if (stopped) return;
      go.run(result.instance).then(
        () => fatal(new Error("Shaman engine exited")),
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
