import type { Metadata } from "next";
import Link from "next/link";
import { ForeverHealerTierList } from "../../../../components/forever-healer-tier-list";
import { ForeverRankingNavigation } from "../../../../components/forever-ranking-navigation";
import { JsonLd } from "../../../../components/json-ld";
import { readHealerTierSnapshot } from "../../../../lib/forever-healer-tier-list-data";
import {
  createHelperMetadata,
  createBreadcrumbJsonLd,
  helperAbsoluteUrl,
} from "../../../../lib/seo";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return createHelperMetadata({
    title: "WoW Forever Healer Tier List — Tank, Group & Burst Healing",
    description:
      "Compare current pre-raid Priest, Druid, Shaman and Paladin builds under shared healing assignments. Inspect useful HPS, survival, absorbs and mana.",
    path: "/forever/tier-list/healers",
    noIndex: !(await readHealerTierSnapshot()),
  });
}
export default async function HealerTierPage(): Promise<React.JSX.Element> {
  const snapshot = await readHealerTierSnapshot();
  return (
    <article className={`forever-reference-page ${styles.page}`} data-healer-tier-list>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "Forever Helper", path: "/forever" },
          { name: "Healer tier list", path: "/forever/tier-list/healers" },
        ])}
      />
      {snapshot ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "WoW Forever Healer Tier List",
            url: helperAbsoluteUrl("/forever/tier-list/healers"),
            dateModified: snapshot.capturedAt,
            description:
              "Shared three-minute tank, group and burst healing assignments with current pre-raid gear; full raid buffs and four injured recipients.",
          }}
        />
      ) : null}
      <header className="forever-reference-hero">
        <Link className="helper-back-link" href="/forever">
          ← Forever Helper
        </Link>
        <span className="eyebrow">Pre-raid builds · Healing assignments · Forever beta</span>
        <h1>WoW Forever healer tier list</h1>
        <p>
          Choose the healing your group needs. Compare actual useful healing, consumed shields,
          survival and mana across all four healer classes.
        </p>
        <div className={styles.links}>
          <a href="#healer-rankings">Explore the rankings ↓</a>
          <a href="#methodology">How we measure</a>
          <Link href="/forever/simulator">Open the simulator →</Link>
        </div>
      </header>
      <ForeverRankingNavigation active="healers" label="Class ranking categories" />
      {snapshot ? (
        <>
          <div className={styles.stats}>
            <div>
              <span>Healer classes</span>
              <strong>4</strong>
              <small>Priest · Druid · Shaman · Paladin</small>
            </div>
            <div>
              <span>Assignments</span>
              <strong>3</strong>
              <small>Tank · Group · Burst</small>
            </div>
            <div>
              <span>Fight</span>
              <strong>3 minutes</strong>
              <small>Four recipients · stacked · full raid support</small>
            </div>
            <div>
              <span>Last measured</span>
              <strong>{snapshot.capturedAt.slice(0, 10)}</strong>
              <small>512 fights per build and assignment · UTC</small>
            </div>
          </div>
          <p className={styles.notice}>
            These are shared five-person assignment tests with full raid buffs. They measure the
            captured beta model, including each build’s declared proc and spell-scaling assumptions.
            They do not predict an entire 40-player raid or replace encounter-specific utility and
            positioning decisions.
          </p>
          <ForeverHealerTierList snapshot={snapshot} />
        </>
      ) : (
        <section className="panel" role="status">
          <h2>Healer rankings are being refreshed</h2>
          <p>
            A selected build or model changed. Current comparison measurements are required before
            the scores can be shown.
          </p>
          <Link href="/forever/simulator">Explore healer builds →</Link>
        </section>
      )}
      <section id="methodology" className={styles.method}>
        <span className="eyebrow">One workload per assignment</span>
        <h2>How healer rankings work</h2>
        <div className={styles.methodGrid}>
          <div>
            <h3>Current builds, shared damage</h3>
            <p>
              Every supported archetype uses its current published pre-raid gear, talents, race,
              consumables and spell priorities. Each assignment supplies identical damage events,
              four 18,000-health recipients, stacked positions and a three-minute fight. Raid buffs
              are retained; builds are not reoptimized for this comparison. Self-damaging mana runes
              are excluded from every class in this shared test.
            </p>
          </div>
          <div>
            <h3>Useful healing and survival</h3>
            <p>
              Useful HPS is effective healing plus shields actually consumed by damage. Overhealing
              never adds score. Builds keeping all assigned recipients alive in at least 99% of
              fights rank first; others remain visible in D with their failure rate. Within that
              gate, higher useful HPS ranks first. Below it, survival ranks before throughput.
            </p>
          </div>
          <div>
            <h3>Independent sampling</h3>
            <p>
              Each build runs 256 fights at each of two independent seeds. The displayed margin uses
              the pooled standard deviation and 512 total fights. Near scores can be statistical
              ties. This is a bounded comparison of reviewed presets, not a new gear or rotation
              search.
            </p>
          </div>
          <div>
            <h3>Scenario-specific tiers</h3>
            <p>
              S starts at 95% of the assignment’s highest useful HPS, A at 85%, B at 70%, and C at
              55%, with the survival gate applied first. Low incoming damage can limit throughput.
              Healers must be judged within the selected assignment; tank TPS, DPS and HPS are never
              combined into one score.
            </p>
          </div>
        </div>
      </section>
    </article>
  );
}
