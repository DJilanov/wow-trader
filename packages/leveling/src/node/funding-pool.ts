import { availableParallelism, freemem } from "node:os";
import { serialize } from "node:v8";
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from "node:worker_threads";
import type { CampaignPlan } from "../campaign.js";
import { campaignFundingScenarioKey, campaignFundingScenarios, campaignFundingState, campaignFundingStates,
  type CampaignFundingExecutor, type CampaignFundingScenario, type CampaignFundingState } from "../campaign-funding-scenarios.js";
import type { FundingWorkerRequest, FundingWorkerResponse } from "./funding-protocol.js";

export interface CampaignFundingPoolOptions {
  readonly workers?: number;
  readonly timeoutMs?: number;
  readonly minimumActions?: number;
  /** Explicit qualification scope; omitted means every scenario supported by the plan. */
  readonly scenarios?: readonly CampaignFundingScenario[];
  readonly onBatch?: (statistics: CampaignFundingPoolStatistics) => void;
}

export interface CampaignFundingPoolStatistics {
  readonly workers: number;
  readonly workerThreadIds: readonly number[];
  readonly parallelBatches: number;
  readonly serialBatches: number;
  readonly scenarios: number;
  readonly elapsedMs: number;
}

interface Slot { readonly worker: Worker; readonly port: MessagePort; error: Error | null }

/** Synchronous coordinator for offline route builds. CPU work runs in reusable Node workers. */
export class CampaignFundingPool {
  readonly workerCount: number;
  private readonly timeoutMs: number;
  private readonly minimumActions: number;
  private readonly selectedScenarios: readonly CampaignFundingScenario[] | undefined;
  private readonly onBatch: CampaignFundingPoolOptions["onBatch"];
  private readonly slots: Slot[] = [];
  private readonly threadIds = new Set<number>();
  private batch = 0;
  private parallelBatches = 0;
  private serialBatches = 0;
  private scenarios = 0;
  private elapsedMs = 0;
  private closed = false;
  private busy = false;

  constructor(options: CampaignFundingPoolOptions = {}) {
    const memoryWorkers = Math.max(1, Math.floor(freemem() / (512 * 1024 * 1024)));
    this.workerCount = options.workers ?? Math.max(1, Math.min(8, availableParallelism() - 1, memoryWorkers));
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.minimumActions = options.minimumActions ?? 100;
    this.selectedScenarios = options.scenarios?.map((scenario) => ({ ...scenario }));
    this.onBatch = options.onBatch;
    if (!Number.isInteger(this.workerCount) || this.workerCount < 1 || this.workerCount > 64)
      throw new Error("Route workers must be an integer from 1 to 64.");
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 3_600_000)
      throw new Error("Route worker timeout must be between 1 and 3,600,000 milliseconds.");
    if (!Number.isInteger(this.minimumActions) || this.minimumActions < 0)
      throw new Error("The route parallelism threshold must be a non-negative integer.");
    if (this.selectedScenarios && (!this.selectedScenarios.length ||
      new Set(this.selectedScenarios.map(campaignFundingScenarioKey)).size !== this.selectedScenarios.length))
      throw new Error("Route scenario selection must be nonempty and unique.");
  }

  get statistics(): CampaignFundingPoolStatistics {
    return { workers: this.workerCount, workerThreadIds: [...this.threadIds].sort((a, b) => a - b),
      parallelBatches: this.parallelBatches, serialBatches: this.serialBatches,
      scenarios: this.scenarios, elapsedMs: this.elapsedMs };
  }

  readonly execute: CampaignFundingExecutor = (plan: CampaignPlan): readonly CampaignFundingState[] => {
    if (this.closed) throw new Error("The route worker pool is closed.");
    if (this.busy) throw new Error("The route worker pool cannot run overlapping batches.");
    this.busy = true;
    const start = performance.now();
    try {
      const available = campaignFundingScenarios(plan);
      const requested = this.selectedScenarios && new Set(this.selectedScenarios.map(campaignFundingScenarioKey));
      const scenarios = requested ? available.filter((scenario) => requested.has(campaignFundingScenarioKey(scenario))) : available;
      if (requested && scenarios.length !== requested.size)
        throw new Error("A selected route scenario is unavailable for this plan.");
      this.scenarios += scenarios.length;
      if (this.workerCount === 1 || plan.actions.length < this.minimumActions) {
        this.serialBatches++;
        return requested ? scenarios.map((scenario) => campaignFundingState(plan, scenario)) : campaignFundingStates(plan);
      }
      const count = Math.min(this.workerCount, scenarios.length);
      this.ensureWorkers(count);
      const bytes = serialize(plan), sharedPlan = new SharedArrayBuffer(bytes.byteLength);
      new Uint8Array(sharedPlan).set(bytes);
      const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
      const batch = ++this.batch, pending = new Set<number>();
      const result: (CampaignFundingState | undefined)[] = Array.from({ length: scenarios.length });
      for (let index = 0; index < count; index++) {
        const slot = this.slots[index]!;
        if (slot.error) throw slot.error;
        const request: FundingWorkerRequest = { batch, plan: sharedPlan, signal: signal.buffer as SharedArrayBuffer,
          scenarios: scenarios.flatMap((scenario, offset) => offset % count === index ? [{ index: offset, scenario }] : []) };
        pending.add(index);
        slot.port.postMessage(request);
      }
      const deadline = performance.now() + this.timeoutMs;
      while (pending.size) {
        const observed = Atomics.load(signal, 0);
        for (const index of pending) {
          const slot = this.slots[index]!;
          if (slot.error) throw slot.error;
          const received = receiveMessageOnPort(slot.port);
          if (!received) continue;
          const response = received.message as FundingWorkerResponse;
          if (response.batch !== batch) throw new Error("A route worker returned a stale batch.");
          if (!response.ok) throw new Error(`Route worker ${response.threadId} failed: ${response.error}`);
          for (const entry of response.entries) {
            if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= result.length || result[entry.index])
              throw new Error("A route worker returned a duplicate or invalid scenario.");
            result[entry.index] = entry.state;
          }
          this.threadIds.add(response.threadId);
          pending.delete(index);
        }
        if (!pending.size) break;
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw new Error(`Route workers timed out after ${this.timeoutMs} ms; no partial route was accepted.`);
        Atomics.wait(signal, 0, observed, Math.min(remaining, 100));
      }
      if (result.some((state) => state === undefined)) throw new Error("Route workers omitted a scenario.");
      this.parallelBatches++;
      return result.map((state) => state!);
    } catch (error) {
      this.closed = true;
      for (const slot of this.slots) { slot.port.close(); void slot.worker.terminate(); }
      throw error;
    } finally {
      this.busy = false;
      this.elapsedMs += performance.now() - start;
      this.onBatch?.(this.statistics);
    }
  };

  async close(): Promise<void> {
    this.closed = true;
    for (const slot of this.slots) slot.port.close();
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
    this.slots.length = 0;
  }

  private ensureWorkers(count: number): void {
    while (this.slots.length < count) {
      const { port1, port2 } = new MessageChannel();
      const worker = new Worker(new URL("./route-worker.js", import.meta.url), {
        workerData: { port: port2 }, transferList: [port2],
        execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512 },
      });
      const slot: Slot = { worker, port: port1, error: null };
      worker.on("error", (error: Error): void => { slot.error = error; });
      worker.on("exit", (code: number): void => {
        if (!this.closed) slot.error = new Error(`Route worker exited unexpectedly with code ${code}.`);
      });
      this.slots.push(slot);
    }
  }
}
