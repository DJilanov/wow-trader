import assert from "node:assert/strict";

export async function captureTankSettings(page, origin, release, profile) {
  await page.route(/^https?:\/\/([^/]+\.)?(zamimg|wowhead)\.com\//, (route) => route.abort());
  await page.addInitScript(() => globalThis.localStorage.setItem("classic_wasmconcurrency", "1"));
  assert((await page.goto(`${origin}/forever-sim/${release}/${profile}/`))?.ok());
  await page.locator(".dps-action").waitFor({ timeout: 60000 });
  await page.locator("#simui-iterations").evaluate((input) => {
    input.value = "1";
    input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
  });
  const candidates = await page.evaluate(() =>
    Object.values(globalThis.localStorage).flatMap((value) => {
      try {
        const parsed = JSON.parse(value);
        return parsed.player && parsed.encounter ? [parsed] : [];
      } catch {
        return [];
      }
    }),
  );
  assert.equal(candidates.length, 1, "Expected a single fresh tank starter");
  return candidates[0];
}

export async function openTankWorker(page, origin, release, profile) {
  assert((await page.goto(`${origin}/forever-sim/${release}/${profile}/`))?.ok());
  await page.evaluate(async (url) => {
    const worker = new globalThis.Worker(url);
    globalThis.__tankWorker = worker;
    await new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(
        () => reject(new Error("Tank WASM worker not ready")),
        60000,
      );
      worker.onerror = (event) => {
        globalThis.clearTimeout(timer);
        reject(new Error(event.message));
      };
      worker.onmessage = ({ data }) => {
        globalThis.clearTimeout(timer);
        if (data.msg === "ready" && data.outputData[0] === 1) resolve();
        else reject(new Error("Actual WASM engine required"));
      };
    });
    globalThis.__tankCall = (kind, bytes) =>
      new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(
          () => reject(new Error("Tank benchmark timed out")),
          300000,
        );
        worker.onerror = (event) => {
          globalThis.clearTimeout(timer);
          reject(new Error(event.message));
        };
        worker.onmessage = ({ data }) => {
          if (data.msg !== kind || data.id !== "tank-tier") return;
          globalThis.clearTimeout(timer);
          resolve(Array.from(data.outputData));
        };
        worker.postMessage({ id: "tank-tier", msg: kind, inputData: Uint8Array.from(bytes) });
      });
  }, `/forever-sim/${release}/sim_worker.js`);
}

export async function callTankWorker(page, kind, bytes) {
  return Uint8Array.from(
    await page.evaluate(({ kind, bytes }) => globalThis.__tankCall(kind, bytes), {
      kind,
      bytes: Array.from(bytes),
    }),
  );
}
