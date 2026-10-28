import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { URL, URLSearchParams } from "node:url";
import process from "node:process";

assert.deepEqual(
  process.argv.slice(2),
  ["--verify"],
  "Use --verify for the browser transport check",
);
const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const { chromium } = require("playwright"),
  esbuild = require("esbuild");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const release = "ce2375bbbbc13f564a8717f3",
  pins = new Map();
let bundle;
try {
  bundle = await esbuild.build({
    entryPoints: [join(root, "apps/web/src/lib/forever-simulator-frame-controls.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [
      {
        name: "forbid-protected-cache",
        setup(build) {
          build.onResolve({ filter: /simulation-cache/ }, () => {
            throw new Error("Protected helper requested");
          });
        },
      },
    ],
  });
} finally {
  esbuild.stop();
}
for (const path of Object.keys(bundle.metafile.inputs)) {
  const relativePath = relative(root, resolve(root, path));
  assert(!relativePath.includes("simulation-cache"));
  pins.set(relativePath, sha(await readFile(join(root, relativePath))));
}
for (const path of [
  relative(root, import.meta.filename),
  "apps/web/src/components/forever-simulator-frame.tsx",
])
  pins.set(path, sha(await readFile(join(root, path))));
const component = await readFile(
  join(root, "apps/web/src/components/forever-simulator-frame.tsx"),
  "utf8",
);
assert(
  component.includes("element.contentWindow?.location.replace(url)"),
  "Host recovery contract changed",
);
const base = join(root, "artifacts/forever-simulator/optimization/stop-recovery-browser-v1");
await mkdir(base, { recursive: true });
const directory = await mkdtemp(join(base, "review-"));
await writeFile(join(directory, "controls.js"), bundle.outputFiles[0].contents, { flag: "wx" });

const workerSource = `
postMessage("ready");
onmessage = event => {
  if (event.data === "abort") { postMessage("aborted"); close(); return; }
  if (event.data !== "run") return;
  postMessage("running");
  if (new URL(location.href).searchParams.get("mode") === "responsive") return;
  // Deliberately block this real worker's message loop. No combat engine is loaded.
  let value = 0;
  for (;;) { value = (value + 1) % 1000003; }
};`;

function frameHtml(mode) {
  return `<!doctype html><title>Worker transport control</title>
  <div class="sim-ui"><div class="sim-sidebar-actions"><button class="dps-action">Simulate</button></div>
  <label>Probe character <input id="probe-character"></label><div id="probe-results"></div></div>
  <script>
  const storageKey = "kfc-stop-transport-probe-character";
  if (location.hash) localStorage.setItem(storageKey,"Imported starter");
  const input = document.querySelector("#probe-character");
  input.value = localStorage.getItem(storageKey) || "Saved character";
  input.addEventListener("input",()=>localStorage.setItem(storageKey,input.value));
  const run = document.querySelector(".dps-action"), results = document.querySelector("#probe-results");
  let worker;
  run.addEventListener("click",()=>{
    run.disabled = true;
    const stop = document.createElement("button");stop.className="sim-abort-button";stop.textContent="Stop";
    stop.addEventListener("click",()=>worker.postMessage("abort"));results.replaceChildren(stop);
    worker = new Worker("/probe-worker.js?mode=${mode}");
    worker.onmessage = event => {
      if(event.data==="ready")worker.postMessage("run");
      if(event.data==="running")document.documentElement.dataset.probeRunning="true";
      if(event.data==="aborted"){stop.remove();run.disabled=false;document.documentElement.dataset.probeRunning="false";}
    };
  });
  </script>`;
}

const hostHtml = `<!doctype html><title>Real frame-control transport review</title>
<style>iframe{display:block;width:100%;height:500px;border:0}button{padding:12px}</style>
<iframe title="Transport control"></iframe>
<script type="module">
import {connectSimulatorFrameControls} from "/controls.js";
const frame=document.querySelector("iframe"), parameters=new URL(location.href).searchParams;
const mode=parameters.get("mode")==="responsive"?"responsive":"busy";
const prefix=parameters.get("prefix")==="root"?"":"/tools";
const path=parameters.get("invalid")==="yes"?"/unapproved-frame":prefix+"/forever-sim/${release}/feral_druid/";
window.stopProbe={restarts:[],documents:0,runs:0,stopAt:0,cleanup:null};
let current;
function connect(){
 const doc=frame.contentDocument;if(!doc?.querySelector(".sim-sidebar-actions")||doc===current)return;
 window.stopProbe.cleanup?.();current=doc;window.stopProbe.documents++;
 window.stopProbe.cleanup=connectSimulatorFrameControls(frame,{
  onRun:()=>{window.stopProbe.runs++;},
  onRestart:url=>{window.stopProbe.restarts.push({url,at:performance.now()});frame.contentWindow.location.replace(url);}
 });
 doc.addEventListener("click",event=>{if(event.target.closest?.(".sim-abort-button"))window.stopProbe.stopAt=performance.now();},true);
}
frame.addEventListener("load",connect);
frame.src=path+"?mode="+mode+"#original-build";
</script>`;

const requests = [],
  server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push(url.pathname);
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(hostHtml);
    } else if (url.pathname === "/controls.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(bundle.outputFiles[0].contents);
    } else if (url.pathname === "/probe-worker.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(workerSource);
    } else if (
      url.pathname === "/unapproved-frame" ||
      /^\/(?:tools\/)?forever-sim\/[a-f0-9]{24}\/feral_druid\/$/.test(url.pathname)
    ) {
      response.setHeader("Content-Type", "text/html");
      response.end(
        frameHtml(url.searchParams.get("mode") === "responsive" ? "responsive" : "busy"),
      );
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
assert(address && typeof address === "object");
const origin = "http://127.0.0.1:" + address.port,
  results = [],
  errors = [];
let browser, failure;
try {
  browser = await chromium.launch({ headless: true });
  for (const scenario of [
    { id: "blocked-desktop-repeated", width: 1440, prefix: "tools", mode: "busy", repeat: true },
    { id: "blocked-mobile-root", width: 390, prefix: "root", mode: "busy" },
    { id: "responsive-no-restart", width: 1440, prefix: "tools", mode: "responsive" },
    {
      id: "unapproved-url-no-navigation",
      width: 1440,
      prefix: "tools",
      mode: "busy",
      invalid: true,
    },
    {
      id: "cleanup-cancels-stale-recovery",
      width: 1440,
      prefix: "tools",
      mode: "busy",
      cleanup: true,
    },
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 900 } }),
      page = await context.newPage();
    page.on("pageerror", (error) => errors.push({ scenario: scenario.id, message: error.message }));
    try {
      await page.goto(
        origin +
          "/?" +
          new URLSearchParams({
            prefix: scenario.prefix,
            mode: scenario.mode,
            invalid: scenario.invalid ? "yes" : "no",
          }),
      );
      await page.waitForFunction(() => globalThis.stopProbe?.documents === 1);
      const frame = page.frameLocator("iframe");
      await frame.locator("#probe-character").fill("Edited character kept");
      const rounds = scenario.repeat ? 2 : 1,
        latencies = [],
        restartLatencies = [];
      for (let round = 0; round < rounds; round++) {
        const workerPromise = page.waitForEvent("worker");
        await frame.getByRole("button", { name: "Simulate", exact: true }).click();
        const worker = await workerPromise;
        await page.waitForFunction(
          () =>
            globalThis.document.querySelector("iframe")?.contentDocument?.documentElement.dataset
              .probeRunning === "true",
        );
        let closedAt = null;
        worker.once("close", () => {
          closedAt = Date.now();
        });
        const closed = worker.waitForEvent("close", { timeout: 6000 });
        const stopAt = Date.now();
        await frame.getByRole("button", { name: "Stop", exact: true }).click();
        if (scenario.cleanup) {
          await page.evaluate(() => {
            globalThis.stopProbe.cleanup();
            globalThis.document.querySelector("iframe").remove();
          });
          await closed;
          await page.waitForTimeout(1600);
          assert.equal(await page.evaluate(() => globalThis.stopProbe.restarts.length), 0);
        } else if (scenario.invalid) {
          await frame.locator(".kfc-frame-notice").waitFor({ state: "visible" });
          assert(
            (await frame.locator(".kfc-frame-notice").textContent()).includes(
              "could not restart safely",
            ),
          );
          assert.equal(await page.evaluate(() => globalThis.stopProbe.restarts.length), 0);
          // This refused path is intentionally still busy; closing the context ends its worker.
          await context.close();
          await closed;
        } else if (scenario.mode === "responsive") {
          await closed;
          await frame
            .getByRole("button", { name: "Simulate", exact: true })
            .waitFor({ state: "visible" });
          await page.waitForTimeout(1600);
          assert.equal(await page.evaluate(() => globalThis.stopProbe.restarts.length), 0);
          assert.equal(
            await frame.locator("#probe-character").inputValue(),
            "Edited character kept",
          );
        } else {
          await closed;
          const elapsed = closedAt - stopAt;
          assert(elapsed >= 0 && elapsed < 3500, "Busy worker was not ended promptly: " + elapsed);
          latencies.push(elapsed);
          await page.waitForFunction((count) => globalThis.stopProbe.documents >= count, round + 2);
          const state = await page.evaluate(() => globalThis.stopProbe);
          assert.equal(state.restarts.length, round + 1);
          const restartDelay = state.restarts[round].at - state.stopAt;
          assert(
            restartDelay >= 1100 && restartDelay < 1800,
            "Host recovery timer drifted: " + restartDelay,
          );
          restartLatencies.push(restartDelay);
          assert(!new URL(state.restarts[round].url).hash);
          assert.equal(
            await frame.locator("#probe-character").inputValue(),
            "Edited character kept",
          );
        }
      }
      results.push({
        id: scenario.id,
        passed: true,
        rounds,
        workerCloseLatencyMs: latencies,
        restartRequestedLatencyMs: restartLatencies,
      });
      console.log("PASS " + scenario.id);
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  for (const [path, digest] of pins)
    assert.equal(sha(await readFile(join(root, path))), digest, path);
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
const report = {
  schema: "kfc-simulator-stop-transport-review.v1",
  status: failure ? "failed" : "passed",
  sourcePins: [...pins].map(([path, sha256]) => ({ path, sha256 })),
  results,
  errors,
  requestPaths: [...new Set(requests)].sort(),
  failure: failure?.stack,
  combatEngineLoaded: false,
  nativeJobs: 0,
  browserCombatJobs: 0,
  scope:
    "Actual website frame-control module with real dedicated workers; not the WoW engine, a Next.js page review or qualification of raw Druid cancellation latency.",
  classOptimizationStarted: false,
  classClockChanged: false,
  publicationAllowed: false,
};
const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
await writeFile(join(directory, "report.json"), bytes, { flag: "wx" });
console.log(
  JSON.stringify({
    report: relative(root, join(directory, "report.json")),
    sha256: sha(bytes),
    status: report.status,
    passed: results.length,
  }),
);
if (failure) throw failure;
