import type { Metadata } from "next";
import { TraderGoldPlan } from "../../../../components/trader-gold-plan";
import { getMarketWorkspace } from "../../../../lib/market-workspace-data";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My gold plan · WoW Forever",
  robots: { index: false, follow: false },
};
export default async function Page(): Promise<React.JSX.Element> {
  try {
    const workspace = await getMarketWorkspace({
      clientProduct: "wow_classic_beta",
      marketOnly: true,
    });
    return (
      <TraderGoldPlan
        product="wow_classic_beta"
        initialMarket={workspace.scan?.market ?? ""}
        markets={workspace.markets}
      />
    );
  } catch {
    return (
      <article>
        <h1>My gold plan</h1>
        <p role="alert">Market data is temporarily unavailable. Reload this page to retry.</p>
      </article>
    );
  }
}
