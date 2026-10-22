import { describe, expect, it, vi } from "vitest";
import { SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import {
  connectSimulatorFrameNavigation,
  simulatorBuildQuery,
  simulatorNavigationHref,
} from "./forever-simulator-frame-navigation";

const origin = "https://kfcguild.online";
const release = "5c5564b645a7ac7a24b887f3";
const src = `/tools/forever-sim/${release}/hunter/`;

function frameWithActiveLabel(text: string | undefined): HTMLIFrameElement {
  const labels =
    text === undefined ? [] : [{ textContent: text, getClientRects: (): unknown[] => [{}] }];
  const document = {
    createElement: (): { textContent: string; remove: () => void } => ({
      textContent: "",
      remove: vi.fn(),
    }),
    head: { append: vi.fn() },
    querySelectorAll: (selector: string): typeof labels =>
      selector.includes(".active .saved-data-set-name") ? labels : [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return {
    contentDocument: document,
    ownerDocument: {
      location: { origin },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  } as unknown as HTMLIFrameElement;
}

describe("Embedded simulator navigation", () => {
  it.each(["configuration", "gear"] as const)(
    "loads the complete reviewed scenario before a %s chip can apply partial state",
    (kind) => {
      const frame = frameWithActiveLabel(undefined);
      const handlers = new Map<string, EventListener>();
      const document = frame.contentDocument!;
      vi.spyOn(document, "addEventListener").mockImplementation((name, handler): void => {
        handlers.set(name, handler as EventListener);
      });
      const label = { textContent: "Smite · pre-raid tested" };
      const chip = {
        disabled: false,
        querySelector: (): typeof label => label,
        closest: (): object => ({
          querySelector: (): { textContent: string } => ({ textContent: "Gear Sets" }),
        }),
      };
      const target = {
        closest: (selector: string): unknown =>
          selector === ".saved-data-set-name"
            ? label
            : selector.includes("preset-configuration")
              ? kind === "configuration"
                ? chip
                : null
              : selector.includes("saved-data-presets")
                ? kind === "gear"
                  ? chip
                  : null
                : null,
      };
      const onPresetSelected = vi.fn((): boolean => true);
      const disconnect = connectSimulatorFrameNavigation(frame, src, {
        onNavigate: vi.fn(),
        onPresetSelected,
      });
      const preventDefault = vi.fn(),
        stopImmediatePropagation = vi.fn();
      handlers.get("click")!({
        target,
        button: 0,
        preventDefault,
        stopImmediatePropagation,
      } as unknown as Event);
      expect(onPresetSelected).toHaveBeenCalledExactlyOnceWith("Smite · pre-raid tested", "user");
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(stopImmediatePropagation).toHaveBeenCalledOnce();
      disconnect();
    },
  );
  it("leaves user-saved sets and their names under the engine's control", () => {
    const frame = frameWithActiveLabel(undefined);
    const handlers = new Map<string, EventListener>();
    vi.spyOn(frame.contentDocument!, "addEventListener").mockImplementation(
      (name, handler): void => {
        handlers.set(name, handler as EventListener);
      },
    );
    const onPresetSelected = vi.fn((): boolean => true);
    const disconnect = connectSimulatorFrameNavigation(frame, src, {
      onNavigate: vi.fn(),
      onPresetSelected,
    });
    const preventDefault = vi.fn(),
      stopImmediatePropagation = vi.fn();
    handlers.get("click")!({
      target: { closest: (): null => null },
      button: 0,
      preventDefault,
      stopImmediatePropagation,
    } as unknown as Event);
    expect(onPresetSelected).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    disconnect();
  });
  it.each([undefined, "", "   "])(
    "does not invent an initial preset event for an absent or blank active chip: %s",
    (label: string | undefined) => {
      const onPresetSelected = vi.fn(),
        disconnect = connectSimulatorFrameNavigation(frameWithActiveLabel(label), src, {
          onNavigate: vi.fn(),
          onPresetSelected,
        });
      expect(onPresetSelected).not.toHaveBeenCalled();
      disconnect();
    },
  );
  it("reports a real active configuration as an initial event, not a user selection", () => {
    const onPresetSelected = vi.fn(),
      disconnect = connectSimulatorFrameNavigation(
        frameWithActiveLabel(" Balance · pre-raid tested "),
        src,
        {
          onNavigate: vi.fn(),
          onPresetSelected,
        },
      );
    expect(onPresetSelected).toHaveBeenCalledExactlyOnceWith(
      "Balance · pre-raid tested",
      "initial",
    );
    disconnect();
  });
  it("maps every supported engine profile to its canonical host route", () => {
    for (const spec of SIMULATOR_SPECS) {
      for (const prefix of ["", "/tools"]) {
        expect(
          simulatorNavigationHref(`${prefix}/forever-sim/${release}/${spec.page}/`, src, origin),
        ).toBe(`/forever/simulator/${spec.slug}`);
      }
    }
  });

  it("keeps community-build selections shareable without forwarding unrelated parameters", () => {
    expect(simulatorNavigationHref(`../warrior/?build=Arms%2034%2F17%2F0`, src, origin)).toBe(
      "/forever/simulator/warrior?build=Arms+34%2F17%2F0",
    );
    expect(
      simulatorNavigationHref(`${origin}/forever-sim/${release}/tank_warrior`, src, origin),
    ).toBe("/forever/simulator/tank-warrior");
  });
  it("strips only the valid internal defaults version from host navigation", () => {
    expect(
      simulatorNavigationHref(
        "../warrior/?build=Arms&raidDefaults=full-v2",
        src + "?raidDefaults=full-v2",
        origin,
      ),
    ).toBe("/forever/simulator/warrior?build=Arms");
    expect(simulatorNavigationHref("../warrior/?raidDefaults=unknown", src, origin)).toBeNull();
    expect(
      simulatorNavigationHref("../warrior/?raidDefaults=full-v2&raidDefaults=full-v2", src, origin),
    ).toBeNull();
    const onPresetSelected = vi.fn();
    const disconnect = connectSimulatorFrameNavigation(
      frameWithActiveLabel("Fury"),
      src + "?raidDefaults=full-v2",
      { onNavigate: vi.fn(), onPresetSelected },
    );
    expect(onPresetSelected).toHaveBeenCalledExactlyOnceWith("Fury", "initial");
    disconnect();
  });
  it("strips only the supported completion adapter and still initializes the active preset", () => {
    const query = "?raidDefaults=full-v2&completionBridge=events-v2";
    expect(simulatorNavigationHref(src + query, src + query, origin)).toBe(
      "/forever/simulator/hunter",
    );
    expect(
      simulatorNavigationHref("../warrior/" + query + "&build=Arms", src + query, origin),
    ).toBe("/forever/simulator/warrior?build=Arms");
    for (const value of ["unknown", "events-v2&completionBridge=events-v2"])
      expect(simulatorNavigationHref(src + "?completionBridge=" + value, src, origin)).toBeNull();
    const onPresetSelected = vi.fn();
    const disconnect = connectSimulatorFrameNavigation(frameWithActiveLabel("Fury"), src + query, {
      onNavigate: vi.fn(),
      onPresetSelected,
    });
    expect(onPresetSelected).toHaveBeenCalledExactlyOnceWith("Fury", "initial");
    disconnect();
  });

  it.each([
    `https://external.example/forever-sim/${release}/warrior/`,
    `https://user:password@kfcguild.online/forever-sim/${release}/warrior/`,
    `/forever-sim/aaaaaaaaaaaaaaaaaaaaaaaa/warrior/`,
    `/forever-sim/${release}/unknown/`,
    `/forever-sim/${release}/warrior/worker.js`,
    `/forever-sim/${release}/warrior/?other=1`,
    `/forever-sim/${release}/warrior/?build=one&build=two`,
    `/forever-sim/${release}/warrior/?build=`,
    `/forever-sim/${release}/warrior/?build=%00bad`,
    `/forever-sim/${release}/warrior/#unrelated-tab`,
    "/forever/encyclopedia/items/123",
    "javascript:void(0)",
  ])("leaves non-profile, unsafe and unrecognized links alone: %s", (href) => {
    expect(simulatorNavigationHref(href, src, origin)).toBeNull();
  });

  it("accepts only a bounded, single named build", () => {
    expect(simulatorBuildQuery("Fury 18/33/0")).toBe("?build=Fury+18%2F33%2F0");
    for (const value of [undefined, null, ["Arms"], "", "  ", "x".repeat(201), "bad\nname"])
      expect(simulatorBuildQuery(value)).toBe("");
  });
});
