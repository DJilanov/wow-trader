import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { installShamanHealingWorker } from "./shaman-healing-worker.mjs";

function environment(t, status = 200) {
  const names = [
    "postMessage",
    "close",
    "importScripts",
    "Go",
    "fetch",
    "WebAssembly",
    "onmessage",
    "kfcShamanEquippedWasmReady",
    "kfcShamanEquippedSimulate",
  ];
  const saved = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const messages = [];
  let closed = false,
    executions = 0;
  globalThis.postMessage = (message) => messages.push(message);
  globalThis.close = () => {
    closed = true;
  };
  globalThis.importScripts = (url) => {
    assert.equal(url, "runtime");
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, "wasm");
    return { ok: status === 200, status, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  globalThis.WebAssembly = { instantiate: async () => ({ instance: {} }) };
  globalThis.Go = class {
    importObject = {};
    run() {
      globalThis.kfcShamanEquippedSimulate = (text) => {
        ++executions;
        const job = JSON.parse(text);
        return JSON.stringify({ id: job.id, status: "complete" });
      };
      globalThis.kfcShamanEquippedWasmReady();
      return new Promise(() => {});
    }
  };
  installShamanHealingWorker({
    runtimeURL: "runtime",
    wasmURL: "wasm",
    parseJob: (job) => {
      if (!job?.id) throw new Error("Invalid job");
      return job;
    },
    parseReply: (reply) => {
      assert.equal(reply.status, "complete");
      return reply;
    },
  });
  return { messages, closed: () => closed, executions: () => executions };
}
test("waits for the native callback and returns the matching parsed result", async (t) => {
  const e = environment(t);
  await globalThis.onmessage({ data: { type: "run", job: { id: "test" } } });
  assert.deepEqual(
    e.messages.map((message) => message.type),
    ["ready", "started", "result"],
  );
  assert.equal(e.messages[2].reply.id, "test");
  assert.equal(e.executions(), 1);
  assert.equal(e.closed(), false);
});
test("a failed WASM download reports one fatal error and closes", async (t) => {
  const e = environment(t, 503);
  await setImmediate();
  assert.equal(e.closed(), true);
  assert.equal(e.executions(), 0);
  assert.equal(e.messages.length, 1);
  assert.match(e.messages[0].error, /503/);
});
test("overlapping jobs are rejected before either can execute", async (t) => {
  const e = environment(t);
  const first = globalThis.onmessage({ data: { type: "run", job: { id: "one" } } });
  await globalThis.onmessage({ data: { type: "run", job: { id: "two" } } });
  await first;
  assert.equal(e.closed(), true);
  assert.equal(e.executions(), 0);
  assert.equal(e.messages.filter((message) => message.type === "fatal").length, 1);
});
test("invalid messages and jobs fail with no native execution", async (t) => {
  const e = environment(t);
  await globalThis.onmessage({ data: { type: "run", job: {} } });
  await setImmediate();
  assert.equal(e.closed(), true);
  assert.equal(e.executions(), 0);
  assert.match(e.messages[0].error, /Invalid job/);
  assert.deepEqual(
    e.messages.map((message) => message.type),
    ["fatal"],
  );
});
