import { describe, expect, it } from "vitest";
import {
  isSimulatorFrameReady,
  simulatorDialogScrollOffset,
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
  it("handles browser access restrictions without crashing the host page", () => {
    const restricted = {
      get contentDocument(): Document {
        throw new Error("Blocked by browser origin policy");
      },
    } as HTMLIFrameElement;
    expect(isSimulatorFrameReady(restricted, src, origin)).toBe(false);
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
