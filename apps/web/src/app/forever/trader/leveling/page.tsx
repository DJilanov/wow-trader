import Link from "next/link";
import { ProfessionLevelingPlanner } from "../../../../components/profession-leveling-planner";
import { getProfessionLevelingData } from "../../../../lib/profession-leveling-data";
import { createHelperMetadata } from "../../../../lib/seo";
import { withHelperBasePath } from "../../../../lib/site-path";

export const dynamic = "force-dynamic";
export const metadata = createHelperMetadata({
  title: "WoW Forever Profession Leveling Cost Calculator",
  description:
    "Compare profession leveling routes using Auction House prices, whole stacks and one-time recipe costs. Get a crafting order and shopping list for your skill target.",
  path: "/forever/trader/leveling",
});

interface PageProps {
  readonly searchParams: Promise<{
    readonly profession?: string | string[];
    readonly market?: string | string[];
  }>;
}

export default async function Page({ searchParams }: PageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  try {
    const data = await getProfessionLevelingData(
      typeof raw.profession === "string" ? raw.profession.slice(0, 80) : "blacksmithing",
      typeof raw.market === "string" ? raw.market.slice(0, 200) : "",
    );
    return (
      <article className="detail-page">
        <header className="detail-hero">
          <div>
            <span className="eyebrow">WoW Forever · professions</span>
            <h1>Level your profession for less</h1>
            <p>
              Compare materials and recipe costs together. Follow a crafting order with a priced
              shopping list.
            </p>
          </div>
          {data.scan ? (
            <div className="build-stamp">
              <span>AH scan · build {data.scan.build}</span>
              <strong>{data.scan.fresh ? "Fresh prices" : "Reference prices"}</strong>
              <small>
                {new Date(data.scan.at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
              </small>
            </div>
          ) : null}
        </header>
        <form
          action={withHelperBasePath("/forever/trader/leveling")}
          method="get"
          className="workspace-toolbar"
        >
          <label>
            Profession
            <select name="profession" defaultValue={data.profession}>
              {data.professions.map((profession) => (
                <option key={profession.id} value={profession.slug}>
                  {profession.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Auction House
            <select name="market" defaultValue={data.market}>
              {data.markets.map((market) => (
                <option key={market.value} value={market.value}>
                  {market.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Load market</button>
        </form>
        {data.limitation ? (
          <section className="empty-state" role="status">
            <h2>Pricing is not ready</h2>
            <p>{data.limitation}</p>
            <Link href="/forever/addon">Set up Collector and Companion →</Link>
          </section>
        ) : null}
        <ProfessionLevelingPlanner key={`${data.market}:${data.profession}`} data={data} />
      </article>
    );
  } catch {
    return (
      <article className="detail-page">
        <h1>Profession leveling</h1>
        <p role="alert">Market data is temporarily unavailable. Reload this page to retry.</p>
        <Link href="/forever/trader">Back to Trader →</Link>
      </article>
    );
  }
}
