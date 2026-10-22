// HTML adapters are immutable by their full URL, independently of the frozen engine release.
export const simulatorMeasurementVersion = "events-v2";

interface MeasuredSimulator {
  readonly simResultEmitter: { on(listener: (eventID: number) => void): unknown };
  readonly signalManager: { abortType: (...args: unknown[]) => unknown };
}

type SimulationMethod = (this: MeasuredSimulator, ...args: unknown[]) => unknown;
interface SimulatorPrototype {
  runRaidSim: SimulationMethod;
  runRaidSimWithLogs: SimulationMethod;
  makeRaidSimRequest: (...args: unknown[]) => unknown;
}

/** Subscribe to successful results without reading inputs/results or changing returned promises. */
export function installSimulatorMeasurement(
  runtime: Record<string, unknown>,
  host: Pick<Window, "parent" | "location" | "navigator">,
): void {
  const candidates = Object.values(runtime).filter((value): boolean => {
    if (typeof value !== "function") return false;
    const prototype = (value as { prototype?: Partial<SimulatorPrototype> }).prototype;
    return (
      typeof prototype?.runRaidSim === "function" &&
      typeof prototype.runRaidSimWithLogs === "function" &&
      typeof prototype.makeRaidSimRequest === "function"
    );
  });
  if (candidates.length !== 1) throw new Error("Simulator completion contract changed");
  const prototype = (candidates[0] as { prototype: SimulatorPrototype }).prototype;
  const installed = Symbol.for("kfc-simulator-measurement-events-v2");
  if (Object.prototype.hasOwnProperty.call(prototype, installed)) return;
  interface PendingRun {
    cancelled: boolean;
    notified: boolean;
  }
  const states = new WeakMap<MeasuredSimulator, Map<number, PendingRun> | null>();
  const notify = (): void => {
    try {
      const privacy = host.navigator as Navigator & { globalPrivacyControl?: boolean };
      if (
        privacy.globalPrivacyControl ||
        privacy.doNotTrack === "1" ||
        privacy.doNotTrack === "yes" ||
        host.parent === host
      )
        return;
      host.parent.postMessage(
        { type: "kfc-simulation-completed", version: 1 },
        host.location.origin,
      );
    } catch {
      // An optional notification cannot interrupt the engine's result delivery.
    }
  };
  function observe(simulator: MeasuredSimulator): Map<number, PendingRun> | null {
    if (states.has(simulator)) return states.get(simulator) ?? null;
    states.set(simulator, null);
    try {
      const pending = new Map<number, PendingRun>();
      const manager = simulator.signalManager;
      const abort = manager.abortType;
      if (typeof abort !== "function") return null;
      manager.abortType = function (...args: unknown[]): unknown {
        // RaidSim is the public bitmask 0x1. Ignore unrelated stat-weight cancellation.
        if (typeof args[0] === "number" && (args[0] & 1) !== 0)
          for (const run of pending.values()) run.cancelled = true;
        return abort.apply(this, args);
      };
      simulator.simResultEmitter.on((eventID: number): void => {
        const run = pending.get(eventID);
        if (!run || run.cancelled || run.notified) return;
        run.notified = true;
        notify();
      });
      states.set(simulator, pending);
      return pending;
    } catch {
      return null;
    }
  }
  for (const method of ["runRaidSim", "runRaidSimWithLogs"] as const) {
    const original = prototype[method];
    prototype[method] = function (this: MeasuredSimulator, ...args: unknown[]): unknown {
      const pending = observe(this);
      const eventID = args[0];
      if (
        !pending ||
        typeof eventID !== "number" ||
        !Number.isSafeInteger(eventID) ||
        eventID < 0 ||
        pending.size >= 32
      )
        return original.apply(this, args);
      const run: PendingRun = { cancelled: false, notified: false };
      pending.set(eventID, run);
      const release = (): void => {
        if (pending.get(eventID) === run) pending.delete(eventID);
      };
      let result: unknown;
      try {
        result = original.apply(this, args);
      } catch (error: unknown) {
        release();
        throw error;
      }
      try {
        if (
          result &&
          typeof result === "object" &&
          "then" in result &&
          typeof result.then === "function"
        )
          void (result as PromiseLike<unknown>).then(release, release);
        else release();
      } catch {
        release();
      }
      return result;
    };
  }
  Object.defineProperty(prototype, installed, { value: true });
}

export function simulatorMeasurementSrc(src: string): string {
  const url = new URL(src, "https://simulator.invalid");
  url.searchParams.set("completionBridge", simulatorMeasurementVersion);
  return url.pathname + url.search + url.hash;
}

export function simulatorMeasurementModule(moduleUrl: string): string {
  if (
    !/^\/forever-sim\/[a-f0-9]{24}\/bundle\/preset_utils-[a-zA-Z0-9_-]+\.chunk\.js$/.test(moduleUrl)
  )
    throw new Error("Invalid simulator completion module");
  return `import * as runtime from ${JSON.stringify(moduleUrl)};\ntry { (${installSimulatorMeasurement.toString()})(runtime, window); } catch (error) { console.warn("Simulator completion measurement unavailable", error); }`;
}
