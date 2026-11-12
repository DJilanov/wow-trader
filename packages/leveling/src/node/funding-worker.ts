import { Buffer } from "node:buffer";
import { deserialize } from "node:v8";
import { workerData, threadId, type MessagePort } from "node:worker_threads";
import type { CampaignPlan } from "../campaign.js";
import { campaignFundingState } from "../campaign-funding-scenarios.js";
import type { FundingWorkerRequest, FundingWorkerResponse } from "./funding-protocol.js";

const port = (workerData as { readonly port: MessagePort }).port;
port.on("message", (request: FundingWorkerRequest): void => {
  const start = performance.now();
  let response: FundingWorkerResponse;
  try {
    const plan = deserialize(Buffer.from(request.plan)) as CampaignPlan;
    response = { batch: request.batch, threadId, elapsedMs: performance.now() - start, ok: true,
      entries: request.scenarios.map(({ index, scenario }) => ({ index, state: campaignFundingState(plan, scenario) })) };
    response = { ...response, elapsedMs: performance.now() - start };
  } catch (error) {
    response = { batch: request.batch, threadId, elapsedMs: performance.now() - start,
      ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) };
  }
  port.postMessage(response);
  const signal = new Int32Array(request.signal);
  Atomics.add(signal, 0, 1);
  Atomics.notify(signal, 0);
});
