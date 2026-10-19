import { describe, expect, it } from "vitest";
import { SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import { simulatorBuildQuery, simulatorNavigationHref } from "./forever-simulator-frame-navigation";

const origin = "https://kfcguild.online";
const release = "5c5564b645a7ac7a24b887f3";
const src = `/tools/forever-sim/${release}/hunter/`;

describe("Embedded simulator navigation", () => {
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
