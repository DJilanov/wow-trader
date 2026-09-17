import type { Metadata } from "next";

import { ManualCraftingCalculator } from "../../../components/manual-crafting-calculator";
import { createHelperMetadata } from "../../../lib/seo";

export const metadata: Metadata = createHelperMetadata({
  title: "Legacy Crafting Calculator",
  description: "Legacy KFC Helper crafting calculator route.",
  path: "/calculator/crafting",
  noIndex: true,
});

export default function CraftingCalculatorPage(): React.JSX.Element {
  return (
    <article className="detail-page">
      <header className="page-intro">
        <div>
          <span className="eyebrow">Scenario lab</span>
          <h1>Crafting calculator</h1>
          <p>Stress-test a craft in exact copper before trusting a headline margin.</p>
        </div>
      </header>
      <ManualCraftingCalculator />
    </article>
  );
}
