import path from "node:path";

import type { CompanionSnapshot } from "@wow-trader/companion-core";
import { app, utilityProcess, type UtilityProcess } from "electron";

import { utilityEventSchema, type UtilityCommand, type UtilityEvent } from "../shared/contracts.js";

export class CompanionUtilityHost {
  readonly #listeners = new Set<(snapshot: CompanionSnapshot) => void>();
  readonly #errorListeners = new Set<(message: string) => void>();
  #process: UtilityProcess | null = null;
  #readyPromise: Promise<void> | null = null;
  #resolveReady: (() => void) | null = null;
  #rejectReady: ((error: Error) => void) | null = null;
  #configuration: Extract<UtilityCommand, { readonly type: "configure" }> | null = null;
  #restartTimer: NodeJS.Timeout | null = null;
  #restartAttempt = 0;
  #stopping = false;

  public async start(
    configuration: Extract<UtilityCommand, { readonly type: "configure" }>,
  ): Promise<void> {
    this.#configuration = configuration;
    if (this.#process) {
      this.send(configuration);
      return;
    }
    await this.#spawn();
  }

  async #spawn(): Promise<void> {
    if (!this.#configuration || this.#process || this.#stopping) return;
    this.#stopping = false;
    const entryPath = app.isPackaged
      ? path.join(process.resourcesPath, "dist-utility", "index.js")
      : path.join(app.getAppPath(), "dist-utility", "index.js");
    this.#readyPromise = new Promise((resolvePromise, rejectPromise) => {
      this.#resolveReady = resolvePromise;
      this.#rejectReady = rejectPromise;
    });
    const child = utilityProcess.fork(entryPath, [], {
      serviceName: "WoW Trader Scan Processor",
      stdio: "pipe",
    });
    this.#process = child;
    child.on("message", (value: unknown) => this.#handleEvent(value));
    child.on("exit", (code) => {
      this.#process = null;
      this.#rejectReady?.(new Error(`Companion utility stopped during startup (${code}).`));
      this.#resolveReady = null;
      this.#rejectReady = null;
      if (!this.#stopping) {
        this.#emitError(`Companion utility stopped unexpectedly (${code}); restarting.`);
        this.#scheduleRestart();
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => this.#emitError(chunk.toString("utf8").trim()));
    await waitWithTimeout(this.#readyPromise, 10_000, "Companion utility did not start in time");
    this.#restartAttempt = 0;
    this.send(this.#configuration);
  }

  public send(command: UtilityCommand): void {
    if (!this.#process) throw new Error("Companion utility is not running");
    this.#process.postMessage(command);
  }

  public async stop(): Promise<void> {
    this.#stopping = true;
    this.#configuration = null;
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    this.#restartTimer = null;
    if (!this.#process) return;
    this.#process.postMessage({ type: "stop" } satisfies UtilityCommand);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    this.#process?.kill();
    this.#process = null;
  }

  public subscribe(listener: (snapshot: CompanionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public subscribeErrors(listener: (message: string) => void): () => void {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  #handleEvent(value: unknown): void {
    const result = utilityEventSchema.safeParse(value);
    if (!result.success) {
      this.#emitError("Companion utility sent an invalid event");
      return;
    }
    const event: UtilityEvent = result.data;
    if (event.type === "ready") {
      this.#resolveReady?.();
      this.#resolveReady = null;
      this.#rejectReady = null;
    } else if (event.type === "snapshot") {
      for (const listener of this.#listeners) listener(event.snapshot);
    } else this.#emitError(event.message);
  }

  #emitError(message: string): void {
    if (!message) return;
    for (const listener of this.#errorListeners) listener(message);
  }

  #scheduleRestart(): void {
    if (this.#restartTimer || this.#stopping) return;
    const delayMilliseconds = Math.min(30_000, 1_000 * 2 ** this.#restartAttempt);
    this.#restartAttempt += 1;
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      void this.#spawn().catch((error: unknown) => {
        this.#emitError(
          error instanceof Error ? error.message : "The companion utility could not restart.",
        );
        this.#scheduleRestart();
      });
    }, delayMilliseconds);
  }
}

function waitWithTimeout(
  promise: Promise<void>,
  milliseconds: number,
  message: string,
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(new Error(message)), milliseconds);
    promise.then(
      () => {
        clearTimeout(timeout);
        resolvePromise();
      },
      (error: unknown) => {
        clearTimeout(timeout);
        rejectPromise(error);
      },
    );
  });
}
