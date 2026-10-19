import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForeverSimulatorReviewedWorkspace } from "../components/forever-simulator-reviewed-workspace";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const build: LocalSimulatorBuildReview = {
  id: "rogue-subtlety-guide-test",
  spec: "rogue/subtlety",
  faction: "alliance",
  scenario: "single-target",
  stage: "first-pass",
  status: "reviewed",
  href: null,
  referenceDps: null,
  requiresProvisionalEnchantOptIn: false,
  warnings: [],
  rotationGuidance: {
    talents: "20/0/31",
    scenario: "Level60,300-second fight",
    instruction:
      "Check actions from top to bottom; use the first available action, not a fixed sequence.",
    priorities: ["At3+ points, use the eligible finisher."],
    caveats: ["Scenario-specific guidance."],
  },
};

function renderWorkspace(review: LocalSimulatorBuildReview): string {
  return renderToStaticMarkup(
    createElement(ForeverSimulatorReviewedWorkspace, {
      src: "/forever-sim/test/rogue/",
      title: "Rogue simulator",
      builds: [review],
    }),
  );
}

describe("reviewed rotation guide introduction", () => {
  it("renders the priority-order instruction between the scenario and actions", () => {
    const html = renderWorkspace(build),
      introduction = html.indexOf("Check actions from top to bottom"),
      scenario = html.indexOf("Level 60, 300-second fight"),
      priorities = html.indexOf("<ol>");
    expect(introduction).toBeGreaterThan(scenario);
    expect(priorities).toBeGreaterThan(introduction);
    expect(html).toContain("use the first available action, not a fixed sequence.");
    expect(html).toContain("At 3+ points, use the eligible finisher.");
  });

  it("preserves older guides that have no instruction", () => {
    const html = renderWorkspace({
      ...build,
      rotationGuidance: {
        talents: "30/21/0",
        scenario: "Level60,300-second fight",
        priorities: ["Use the eligible finisher."],
        caveats: ["Scenario-specific guidance."],
      },
    });
    expect(html).toContain("Rotation guide · 30/21/0");
    expect(html).toContain("<ol><li>Use the eligible finisher.</li></ol>");
    expect(html).not.toContain("Check actions from top to bottom");
    expect(html).not.toContain("<p></p>");
  });

  it("does not create an empty guide for builds without guidance", () => {
    const { rotationGuidance, ...withoutGuidance } = build;
    expect(rotationGuidance).toBeDefined();
    expect(renderWorkspace(withoutGuidance)).not.toContain("Rotation guide");
  });
});
