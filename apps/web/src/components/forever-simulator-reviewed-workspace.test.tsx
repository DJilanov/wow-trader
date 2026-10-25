import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LocalSimulatorBuildReview } from "../lib/forever-simulator-local-reviews";
import { ForeverSimulatorReviewedWorkspace } from "./forever-simulator-reviewed-workspace";

vi.mock("./forever-simulator-frame", () => ({ ForeverSimulatorFrame: (): null => null }));

const preview: LocalSimulatorBuildReview = {
  id: "rogue-combat-static",
  spec: "rogue/combat",
  faction: "Alliance",
  scenario: "unit-guide-markup",
  stage: "Unit-only guide preview",
  status: "preview",
  href: null,
  referenceDps: null,
  requiresProvisionalEnchantOptIn: false,
  warnings: [],
  rotationGuidance: {
    talents: "16/33/2",
    scenario: "Unit-only rotation guide transport.",
    instruction: "Follow the first available priority.",
    prepull: ["1 second before the pull: Use Blade Flurry when available."],
    priorities: ["Use Thistle Tea when available if your energy is at most 10."],
    caveats: [],
  },
};

function markup(build: LocalSimulatorBuildReview): string {
  return renderToStaticMarkup(
    <ForeverSimulatorReviewedWorkspace
      src="/forever-sim/unit/rogue/"
      title="Unit guide"
      builds={[build]}
    />,
  );
}

describe("reviewed rotation guide markup", (): void => {
  it("shows pre-pull actions before combat priorities", (): void => {
    const html = markup(preview);
    expect(html).toContain("Before the pull");
    expect(html).toContain("Blade Flurry");
    expect(html).toContain("During combat");
    expect(html.indexOf("Blade Flurry")).toBeLessThan(html.indexOf("Thistle Tea"));
    expect(html.indexOf("During combat")).toBeLessThan(html.indexOf("Thistle Tea"));
  });

  it("keeps an existing guide without pre-pull actions unchanged", (): void => {
    const { prepull, ...guide } = preview.rotationGuidance!;
    expect(prepull).toHaveLength(1);
    const html = markup({ ...preview, rotationGuidance: guide });
    expect(html).not.toContain("Before the pull");
    expect(html).not.toContain("During combat");
    expect(html).toContain("Thistle Tea");
  });

  it("does not render an empty pre-pull section", (): void => {
    const html = markup({
      ...preview,
      rotationGuidance: { ...preview.rotationGuidance!, prepull: [] },
    });
    expect(html).not.toContain("Before the pull");
    expect(html).toContain("Thistle Tea");
  });
});
