import { describe, expect, it } from "vitest";

import manifest from "../app/manifest";
import { HELPER_BASE_PATH, withHelperBasePath } from "./site-path";

describe("Helper base path", () => {
  it.each(["/api/v1/leveling-rewards/4604", "/api/v1/leveling-feedback"])(
    "keeps guide request %s under the tools mount",
    (path: string) => {
      expect(withHelperBasePath(path)).toBe(`/tools${path}`);
    },
  );
  it("prefixes application routes and preserves query strings", () => {
    expect(withHelperBasePath("/forever/encyclopedia?type=recipe")).toBe(
      "/tools/forever/encyclopedia?type=recipe",
    );
  });

  it("maps the application root to the guild tools page without double-prefixing", () => {
    expect(withHelperBasePath("/")).toBe(HELPER_BASE_PATH);
    expect(withHelperBasePath("/tools/forever")).toBe("/tools/forever");
  });

  it("rejects paths that are not root-relative", () => {
    expect(() => withHelperBasePath("forever")).toThrow(TypeError);
  });

  it("keeps installed-app navigation inside the Helper path", () => {
    expect(manifest()).toMatchObject({
      start_url: "/tools",
      scope: "/tools/",
      icons: [{ src: "/tools/kfc-icon.svg" }],
    });
  });
});
