import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  installSimulatorMeasurement,
  simulatorMeasurementModule,
  simulatorMeasurementSrc,
} from "./forever-simulator-measurement";

interface SimulatorFixture {
  listeners: Array<() => void>;
  simResultEmitter: { on(listener: () => void): void };
  result: unknown;
  failure: Error | null;
  received: unknown[];
  runRaidSim(...args: unknown[]): unknown;
  runRaidSimWithLogs(...args: unknown[]): unknown;
  complete(): void;
}

function fixture(): {
  runtime: Record<string, unknown>;
  simulator: SimulatorFixture;
  host: Pick<Window, "parent" | "location" | "navigator">;
  post: ReturnType<typeof vi.fn>;
} {
  const post = vi.fn();
  class Simulator {
    listeners: Array<() => void> = [];
    simResultEmitter = {
      on: (listener: () => void): void => {
        this.listeners.push(listener);
      },
    };
    result: unknown = Promise.resolve("original promise");
    failure: Error | null = null;
    received: unknown[] = [];
    makeRaidSimRequest(): void {}
    runRaidSim(...args: unknown[]): unknown {
      this.received = args;
      if (this.failure) throw this.failure;
      return this.result;
    }
    runRaidSimWithLogs(...args: unknown[]): unknown {
      return this.runRaidSim(...args);
    }
    complete(): void {
      for (const listener of this.listeners) listener();
    }
  }
  return {
    runtime: { minifiedExport: Simulator },
    simulator: new Simulator(),
    host: {
      parent: { postMessage: post } as unknown as Window,
      location: { origin: "https://helper.example" } as Location,
      navigator: {} as Navigator,
    },
    post,
  };
}

describe("Frozen-engine completion presentation adapter", () => {
  it("subscribes once per engine and sends only successful result notifications", () => {
    const f = fixture();
    installSimulatorMeasurement(f.runtime, f.host);
    installSimulatorMeasurement(f.runtime, f.host);
    expect(f.post).not.toHaveBeenCalled();
    expect(f.simulator.runRaidSim(37, "progress")).toBe(f.simulator.result);
    expect(f.simulator.received).toEqual([37, "progress"]);
    expect(f.post).not.toHaveBeenCalled();
    f.simulator.complete();
    expect(f.post).toHaveBeenCalledExactlyOnceWith(
      { type: "kfc-simulation-completed", version: 1 },
      "https://helper.example",
    );
    f.simulator.runRaidSimWithLogs(38);
    expect(f.simulator.listeners).toHaveLength(1);
    f.simulator.complete();
    expect(f.post).toHaveBeenCalledTimes(2);
  });

  it("preserves thrown errors, rejected/cancelled outcomes and promise identity without counting them", async () => {
    const f = fixture();
    installSimulatorMeasurement(f.runtime, f.host);
    const error = new Error("original failure");
    f.simulator.failure = error;
    expect(() => f.simulator.runRaidSim(1)).toThrow(error);
    f.simulator.failure = null;
    f.simulator.result = Promise.reject(error);
    const rejected = f.simulator.runRaidSim(2);
    expect(rejected).toBe(f.simulator.result);
    await expect(rejected).rejects.toBe(error);
    f.simulator.result = Promise.resolve({ type: "cancelled" });
    expect(f.simulator.runRaidSim(3)).toBe(f.simulator.result);
    await f.simulator.result;
    expect(f.post).not.toHaveBeenCalled();
  });

  it.each([{ doNotTrack: "1" }, { doNotTrack: "yes" }, { globalPrivacyControl: true }])(
    "does not send when a browser privacy preference is enabled: %j",
    (privacy) => {
      const f = fixture();
      Object.assign(f.host.navigator, privacy);
      installSimulatorMeasurement(f.runtime, f.host);
      f.simulator.runRaidSim();
      f.simulator.complete();
      expect(f.post).not.toHaveBeenCalled();
    },
  );

  it("does not let a blocked parent or unavailable emitter change a simulation", () => {
    const f = fixture();
    f.post.mockImplementation(() => {
      throw new Error("blocked");
    });
    installSimulatorMeasurement(f.runtime, f.host);
    expect(f.simulator.runRaidSim()).toBe(f.simulator.result);
    expect(() => f.simulator.complete()).not.toThrow();
    f.simulator.simResultEmitter.on = (): never => {
      throw new Error("unavailable");
    };
    const Other = f.runtime.minifiedExport as new () => SimulatorFixture;
    const other = new Other();
    other.simResultEmitter.on = f.simulator.simResultEmitter.on;
    expect(other.runRaidSim()).toBe(other.result);
  });

  it("rejects missing or ambiguous runtime contracts without guessing an export name", () => {
    const f = fixture();
    expect(() => installSimulatorMeasurement({}, f.host)).toThrow("contract changed");
    expect(() =>
      installSimulatorMeasurement({ ...f.runtime, duplicate: f.runtime.minifiedExport }, f.host),
    ).toThrow("contract changed");
  });

  it("serializes a self-contained adapter with no engine, storage or network substitutions", () => {
    const moduleUrl = `/forever-sim/${"a".repeat(24)}/bundle/preset_utils-test.chunk.js`;
    const module = simulatorMeasurementModule(moduleUrl);
    const f = fixture();
    runInNewContext(module.slice(module.indexOf("\n") + 1), { runtime: f.runtime, window: f.host });
    f.simulator.runRaidSim();
    f.simulator.complete();
    expect(f.post).toHaveBeenCalledTimes(1);
    for (const fragment of [
      "fetch(",
      "localStorage",
      "sessionStorage",
      "document.cookie",
    ])
      expect(module).not.toContain(fragment);
    expect(module).not.toMatch(/makeRaidSimRequest\s*=(?!=)/u);
    for (const invalid of [
      "https://external.example/module.js",
      "/forever-sim/a/entry.js",
      moduleUrl + "?x=1",
    ])
      expect(() => simulatorMeasurementModule(invalid)).toThrow("Invalid simulator");
    expect(
      simulatorMeasurementSrc(`/forever-sim/${"a".repeat(24)}/warrior/?build=Arms#saved`),
    ).toBe(`/forever-sim/${"a".repeat(24)}/warrior/?build=Arms&completionBridge=events-v1#saved`);
  });
});
