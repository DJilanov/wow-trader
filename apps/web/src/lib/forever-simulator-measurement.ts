// HTML adapters are immutable by their full URL, independently of the frozen engine release.
export const simulatorMeasurementVersion = "events-v1";

interface MeasuredSimulator {
  readonly simResultEmitter: { on(listener: () => void): unknown };
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
  const installed = Symbol.for("kfc-simulator-measurement-events-v1");
  if (Object.prototype.hasOwnProperty.call(prototype, installed)) return;
  const subscribed = new WeakSet<MeasuredSimulator>();
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
  for (const method of ["runRaidSim", "runRaidSimWithLogs"] as const) {
    const original = prototype[method];
    prototype[method] = function (this: MeasuredSimulator, ...args: unknown[]): unknown {
      if (!subscribed.has(this)) {
        try {
          this.simResultEmitter.on(notify);
          subscribed.add(this);
        } catch {
          // A changed/unavailable event interface must not prevent running a simulation.
        }
      }
      return original.apply(this, args);
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
