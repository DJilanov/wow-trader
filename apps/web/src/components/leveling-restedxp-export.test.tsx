import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress } from "@wow-trader/leveling";
import { guideTestPlan } from "./leveling-guide.test-fixture";
import { LevelingRestedXpExport } from "./leveling-restedxp-export";

describe("review export presentation", () => {
  it("explains review status, scope, privacy and a BattleTag-free ZIP fallback", () => {
    const html = renderToStaticMarkup(
      <LevelingRestedXpExport plan={guideTestPlan()} progress={emptyPremadeProgress()} />,
    );
    for (const text of [
      "Local review",
      "not released",
      "70450",
      "v4.11.27",
      "Never sent to our server or saved",
      "ZIP does not need a BattleTag",
      "starter",
      "Create paste import",
      "Download addon ZIP",
    ])
      expect(html).toContain(text);
    expect(html).toMatch(/<label[^>]*for="[^"]+-account"/);
    expect(html).not.toContain("Copy import</button>");
    expect(html).not.toContain('name="battleTag"');
    expect(html).not.toContain('value="YourName#1234"');
  });
});
