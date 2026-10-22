import { describe, expect, it } from "vitest";
import {
  isSimulatorFrameReady,
  simulatorDialogScrollOffset,
  simulatorFrameViewport,
} from "./forever-simulator-frame-state";

const origin = "http://localhost:3017";
const src = "/forever-sim/aaaaaaaaaaaaaaaaaaaaaaaa/tank_warrior/";
function fixture(href = origin + src, visible = true, disabled = false): HTMLIFrameElement {
  return {
    contentDocument: {
      location: { href },
      querySelector: (selector: string) =>
        selector.includes("data-kfc-initialized")
          ? null
          : { disabled, getClientRects: () => (visible ? [{}] : []) },
    },
  } as unknown as HTMLIFrameElement;
}

describe("Simulator frame readiness", () => {
  it("positions embedded dialogs in the host's visible viewport, below its navigation", () => {
    expect(simulatorFrameViewport(200, 1800, 72, 1000)).toEqual({ top: 0, height: 800 });
    expect(simulatorFrameViewport(-400, 1800, 72, 1000)).toEqual({ top: 472, height: 928 });
    expect(simulatorFrameViewport(-1600, 1800, 72, 1000)).toEqual({ top: 1672, height: 128 });
    expect(simulatorFrameViewport(1200, 1800, 72, 1000)).toEqual({ top: 0, height: 0 });
    expect(simulatorFrameViewport(-1900, 1800, 72, 1000)).toEqual({ top: 1800, height: 0 });
    expect(simulatorFrameViewport(0, 800, -20, 1000)).toEqual({ top: 0, height: 800 });
  });
  it("keeps embedded modal headers below fixed navigation and within the viewport", () => {
    expect(simulatorDialogScrollOffset(-6, 0, 73, 1000)).toBe(-95);
    expect(simulatorDialogScrollOffset(89, 0, 73, 1000)).toBe(0);
    expect(simulatorDialogScrollOffset(120, 28, 73, 844)).toBe(0);
    expect(simulatorDialogScrollOffset(900, 100, 73, 844)).toBe(911);
    expect(simulatorDialogScrollOffset(10, 0, -20, 844)).toBe(-6);
  });
  it("recognizes the ready engine even when its load event was missed during hydration", () => {
    expect(isSimulatorFrameReady(fixture(), src, origin)).toBe(true);
    expect(isSimulatorFrameReady(fixture(origin + src, true, true), src, origin)).toBe(true);
    expect(isSimulatorFrameReady(fixture((origin + src).slice(0, -1)), src, origin)).toBe(true);
  });
  it("does not accept blank, previous-profile, previous-release or cross-origin documents", () => {
    for (const href of [
      "about:blank",
      origin + src.replace("tank_warrior", "mage"),
      origin + src.replace("aaaa", "bbbb"),
      "https://other.example" + src,
      origin + src + "?unexpected=1",
    ])
      expect(isSimulatorFrameReady(fixture(href), src, origin)).toBe(false);
    expect(isSimulatorFrameReady(fixture(), "https://other.example" + src, origin)).toBe(false);
  });
  it("accepts a consumed named-build query, but not unrelated or invalid stripped parameters", () => {
    expect(isSimulatorFrameReady(fixture(), src + "?build=Arms+34%2F17%2F0", origin)).toBe(true);
    for (const query of [
      "?other=1",
      "?build=",
      "?build=one&build=two",
      "?build=%00bad",
      "?build=Arms&other=1",
    ])
      expect(isSimulatorFrameReady(fixture(), src + query, origin)).toBe(false);
    expect(
      isSimulatorFrameReady(fixture(origin + src + "?build=wrong"), src + "?build=Arms", origin),
    ).toBe(false);
  });
  it("does not declare a hidden, failed or uninitialized engine ready", () => {
    expect(isSimulatorFrameReady(fixture(origin + src, false), src, origin)).toBe(false);
    const missing = {
      contentDocument: { location: { href: origin + src }, querySelector: () => null },
    } as unknown as HTMLIFrameElement;
    expect(isSimulatorFrameReady(missing, src, origin)).toBe(false);
    expect(isSimulatorFrameReady({ contentDocument: null } as HTMLIFrameElement, src, origin)).toBe(
      false,
    );
  });
  it("accepts the reverse-proxy engine alias without accepting another profile or build query", () => {
    expect(isSimulatorFrameReady(fixture(), `/tools${src}`, origin)).toBe(true);
    expect(isSimulatorFrameReady(fixture(`${origin}/tools${src}`), src, origin)).toBe(true);
    expect(
      isSimulatorFrameReady(fixture(`${origin}${src}?build=Arms`), `/tools${src}`, origin),
    ).toBe(false);
    expect(
      isSimulatorFrameReady(
        fixture(origin + src.replace("tank_warrior", "mage")),
        `/tools${src}`,
        origin,
      ),
    ).toBe(false);
  });
  it("handles browser access restrictions without crashing the host page", () => {
    const restricted = {
      get contentDocument(): Document {
        throw new Error("Blocked by browser origin policy");
      },
    } as HTMLIFrameElement;
    expect(isSimulatorFrameReady(restricted, src, origin)).toBe(false);
  });
  it("recognizes an applied named build after the engine consumes its query", () => {
    const requested = `${src}?build=Arms+34%2F17%2F0`;
    expect(isSimulatorFrameReady(fixture(), requested, origin)).toBe(true);
    expect(isSimulatorFrameReady(fixture(), `${src}?other=Arms`, origin)).toBe(false);
    expect(isSimulatorFrameReady(fixture(), `${requested}&extra=1`, origin)).toBe(false);
    expect(isSimulatorFrameReady(fixture(), `${src}?build=one&build=two`, origin)).toBe(false);
    expect(isSimulatorFrameReady(fixture(), `${src}?build=%00bad`, origin)).toBe(false);
    expect(isSimulatorFrameReady(fixture(origin + src + "?build=Fury"), requested, origin)).toBe(
      false,
    );
    const pending = fixture();
    pending.contentDocument!.querySelector = (() => ({})) as Document["querySelector"];
    expect(isSimulatorFrameReady(pending, requested, origin)).toBe(false);
  });
  it("recognizes a consumed build while keeping the versioned raid defaults query", () => {
    const query = "?raidDefaults=full-v2";
    expect(isSimulatorFrameReady(fixture(origin + src + query), src + query, origin)).toBe(true);
    expect(
      isSimulatorFrameReady(
        fixture(origin + src + query),
        src + "?build=Arms&raidDefaults=full-v2",
        origin,
      ),
    ).toBe(true);
    expect(isSimulatorFrameReady(fixture(), src + query, origin)).toBe(false);
    expect(
      isSimulatorFrameReady(
        fixture(origin + src + query),
        src + "?build=Arms&build=Fury&raidDefaults=full-v2",
        origin,
      ),
    ).toBe(false);
  });
  it("keeps the completion adapter while a named build query is consumed", () => {
    const query = "?raidDefaults=full-v2&completionBridge=events-v1";
    expect(isSimulatorFrameReady(fixture(origin + src + query), src + query, origin)).toBe(true);
    expect(
      isSimulatorFrameReady(
        fixture(origin + src + query),
        src + "?build=Arms&raidDefaults=full-v2&completionBridge=events-v1",
        origin,
      ),
    ).toBe(true);
    expect(
      isSimulatorFrameReady(fixture(origin + src + "?raidDefaults=full-v2"), src + query, origin),
    ).toBe(false);
    expect(
      isSimulatorFrameReady(
        fixture(origin + src + query),
        src + "?build=Arms&raidDefaults=full-v2&completionBridge=events-v1&unexpected=1",
        origin,
      ),
    ).toBe(false);
  });
  it("keeps loading visible until the initial gear and talents finish loading", () => {
    const loading = fixture();
    loading.contentDocument!.querySelector = (() => ({})) as Document["querySelector"];
    expect(isSimulatorFrameReady(loading, src, origin)).toBe(false);
  });
  it("recognizes the initialized mobile workspace even when its desktop simulation button is hidden", () => {
    const mobile = fixture(origin + src, false);
    mobile.contentDocument!.querySelector = ((selector: string) =>
      selector.includes('data-kfc-initialized="true"')
        ? { getClientRects: () => [{}] }
        : null) as Document["querySelector"];
    expect(isSimulatorFrameReady(mobile, src, origin)).toBe(true);
    mobile.contentDocument!.querySelector = ((selector: string) =>
      selector.includes('data-kfc-initialized="true"')
        ? { getClientRects: () => [] }
        : null) as Document["querySelector"];
    expect(isSimulatorFrameReady(mobile, src, origin)).toBe(false);
  });
});
