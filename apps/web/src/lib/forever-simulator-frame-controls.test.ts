import { describe, expect, it } from "vitest";
import { simulatorRestartUrl, simulatorStopGraceMs } from "./forever-simulator-frame-controls";

const release = "43d50c157f60e48c403c088b";

describe("Simulator restart safety", () => {
  it("restarts the actual current engine without replaying its original build import", () => {
    expect(
      simulatorRestartUrl(
        `https://kfcguild.online/tools/forever-sim/${release}/warrior/?mode=embed#old-build`,
        "https://kfcguild.online",
      ),
    ).toBe(`https://kfcguild.online/tools/forever-sim/${release}/warrior/?mode=embed`);
  });

  it("supports the immutable root asset namespace and local development origins", () => {
    expect(
      simulatorRestartUrl(
        `http://localhost:3017/forever-sim/${release}/feral_druid/#old-build`,
        "http://localhost:3017",
      ),
    ).toBe(`http://localhost:3017/forever-sim/${release}/feral_druid/`);
  });

  it("accepts the real Next.js engine URL after trailing-slash normalization", () => {
    expect(
      simulatorRestartUrl(
        `https://kfcguild.online/tools/forever-sim/${release}/warrior#`,
        "https://kfcguild.online",
      ),
    ).toBe(`https://kfcguild.online/tools/forever-sim/${release}/warrior`);
  });

  it.each([
    "https://other.example/tools/forever-sim/" + release + "/warrior/",
    "https://kfcguild.online/tools/forever/simulator/warrior",
    "https://kfcguild.online/tools/forever-sim/current/warrior/",
    "https://kfcguild.online/tools/forever-sim/" + release + "/warrior/nested/",
    "javascript:alert('unsafe')",
    "about:blank",
    "not a URL",
  ])("refuses an unrecognized or cross-origin recovery target: %s", (url) => {
    expect(simulatorRestartUrl(url, "https://kfcguild.online")).toBeNull();
  });

  it("does not wait for a whole long-running WASM batch before recovering", () => {
    expect(simulatorStopGraceMs).toBeGreaterThan(0);
    expect(simulatorStopGraceMs).toBeLessThanOrEqual(1500);
  });
});
