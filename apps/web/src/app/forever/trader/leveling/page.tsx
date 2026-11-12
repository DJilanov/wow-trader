import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "../../../../components/json-ld";
import { ProfessionLevelingGuide } from "../../../../components/profession-leveling-guide";
import { ProfessionLevelingPlanner } from "../../../../components/profession-leveling-planner";
import { getProfessionLevelingData } from "../../../../lib/profession-leveling-data";
import {
  PROFESSION_LEVELING_METADATA,
  PROFESSION_LEVELING_PATH,
  PROFESSION_LEVELING_PROFESSIONS,
  PROFESSION_LEVELING_STRUCTURED_DATA,
} from "../../../../lib/profession-leveling-content";
import { createBreadcrumbJsonLd } from "../../../../lib/seo";
import { withHelperBasePath } from "../../../../lib/site-path";
import styles from "../../../../components/profession-leveling-page.module.css";

export const dynamic = "force-dynamic";
export const metadata = PROFESSION_LEVELING_METADATA;

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
    const profession = data.professions.find((entry) => entry.slug === data.profession);
    const icon = PROFESSION_LEVELING_PROFESSIONS.find((entry) => entry.slug === data.profession);
    return (
      <article className={styles.page}>
        <JsonLd data={PROFESSION_LEVELING_STRUCTURED_DATA} />
        <JsonLd
          data={createBreadcrumbJsonLd([
            { name: "WoW Forever", path: "/forever" },
            { name: "Trader", path: "/forever/trader" },
            { name: "Profession leveling", path: PROFESSION_LEVELING_PATH },
          ])}
        />
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/forever">WoW Forever</Link>
          <span aria-hidden="true">/</span>
          <Link href="/forever/trader">Trader</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Profession leveling</span>
        </nav>
        <header className={styles.hero}>
          <div>
            <span className="eyebrow">Crafting calculator · skill 1–300</span>
            <h1>
              WoW Forever <span>profession leveling</span>
            </h1>
            <p>
              More skill. Less wasted gold. Compare Auction House materials and the cost to learn
              each recipe, then follow a crafting order built around your budget.
            </p>
          </div>
          <div className={styles.heroCard}>
            <div>
              {icon ? (
                <Image
                  src={withHelperBasePath(`/wow-assets/professions/${icon.slug}.jpg`)}
                  alt=""
                  width={48}
                  height={48}
                />
              ) : null}
              <div>
                <strong>{profession?.name ?? "Your profession"}</strong>
                <small>Plan your next skill upgrade</small>
              </div>
            </div>
            <p>
              Materials + learning costs.
              <br />
              One plan, one shopping list.
            </p>
          </div>
        </header>
        <ol className={styles.workflow} aria-label="How to build your plan">
          <li>
            <span aria-hidden="true">01</span>Choose your profession &amp; market
          </li>
          <li>
            <span aria-hidden="true">02</span>Set your skills &amp; known recipes
          </li>
          <li>
            <span aria-hidden="true">03</span>Compare crafts &amp; copy your list
          </li>
        </ol>
        <div className={styles.market}>
          <div>
            <h2>Start with your market</h2>
            <p>Prices and stock come from your selected Auction House scan.</p>
          </div>
          {data.scan ? (
            <p className={styles.scan}>
              <strong>{data.scan.fresh ? "Fresh prices" : "Reference prices"}</strong>
              <time dateTime={data.scan.at}>
                {new Date(data.scan.at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
              </time>
              <br />
              Build {data.scan.build}
            </p>
          ) : null}
        </div>
        <form
          action={withHelperBasePath(PROFESSION_LEVELING_PATH)}
          method="get"
          className={styles.marketForm}
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
        <ProfessionLevelingGuide />
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
