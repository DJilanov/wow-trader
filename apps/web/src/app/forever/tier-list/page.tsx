import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../../../components/json-ld";
import { ForeverDpsTierList } from "../../../components/forever-dps-tier-list";
import { readDpsTierSnapshot } from "../../../lib/forever-dps-tier-list-data";
import { rankDpsTierEntries } from "../../../lib/forever-dps-tier-list";
import { createBreadcrumbJsonLd, createHelperMetadata, helperAbsoluteUrl } from "../../../lib/seo";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return createHelperMetadata({
    title: "WoW Forever DPS Tier List — Simulated Pre-Raid Rankings",
    description:
      "Compare WoW Forever DPS specs with 5,000 simulations per reviewed build: one level-63 boss, full raid buffs, pre-raid gear, talents and rotation links.",
    path: "/forever/tier-list",
    keywords: [
      "WoW Forever DPS tier list",
      "WoW Forever best DPS",
      "WoW Forever class rankings",
      "WoW Forever pre-raid builds",
    ],
    noIndex: !(await readDpsTierSnapshot()),
  });
}
export default async function ForeverDpsTierListPage(): Promise<React.JSX.Element> {
  const snapshot = await readDpsTierSnapshot();
  const entries = snapshot ? rankDpsTierEntries(snapshot) : [];
  const top = entries[0];
  const measuredAt = entries.reduce(
    (latest, entry): string => (entry.capturedAt > latest ? entry.capturedAt : latest),
    "",
  );
  return (
    <article className={`forever-reference-page ${styles.page}`}>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "Forever Helper", path: "/forever" },
          { name: "DPS tier list", path: "/forever/tier-list" },
        ])}
      />
      {snapshot ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "WoW Forever DPS Tier List",
            url: helperAbsoluteUrl("/forever/tier-list"),
            dateModified: measuredAt,
            description:
              "Measured pre-raid build comparison under a shared 300-second single-target support policy, not a live raid-log ranking.",
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: entries.length,
              itemListElement: entries.map((entry) => ({
                "@type": "ListItem",
                position: entry.rank,
                name: `${entry.title} ${entry.className}`,
                url: helperAbsoluteUrl(entry.simulatorHref),
              })),
            },
          }}
        />
      ) : null}
      <header className="forever-reference-hero">
        <Link className="helper-back-link" href="/forever">
          ← Forever Helper
        </Link>
        <span className="eyebrow">Pre-raid builds · Single-target damage · Forever beta</span>
        <h1>WoW Forever DPS tier list</h1>
        <p>
          Find your next spec. Compare measured damage, inspect the gear and talents, and try the
          exact setup yourself.
        </p>
        <div className={styles.links}>
          <a href="#dps-rankings">Explore the rankings ↓</a>
          <a href="#methodology">How we measure</a>
          <Link href="/forever/simulator">Open the simulator →</Link>
        </div>
      </header>
      {top ? (
        <>
          <div className={styles.stats}>
            <div>
              <span>Highest measured build</span>
              <strong>
                {top.title} {top.className}
              </strong>
              <small>
                {top.dps.toLocaleString("en-US", { maximumFractionDigits: 0 })} simulated DPS
              </small>
            </div>
            <div>
              <span>Reviewed builds</span>
              <strong>{entries.length}</strong>
              <small>
                {new Set(entries.map((entry): string => entry.classSlug)).size} classes · standard
                enchants
              </small>
            </div>
            <div>
              <span>Fight</span>
              <strong>5 minutes</strong>
              <small>Level 60 vs. one level-63 boss</small>
            </div>
            <div>
              <span>Last measured</span>
              <strong>{measuredAt.slice(0, 10)}</strong>
              <small>5,000 fights per build · UTC</small>
            </div>
          </div>
          <p className={styles.notice}>
            A snapshot of these builds—not a promise of your raid DPS. Everyone receives the same
            full raid support, with no externally supplied boss debuffs. Class-applied effects still
            work. Gear, race and consumables stay specific to each reviewed build.
          </p>
          <ForeverDpsTierList entries={entries} />
        </>
      ) : (
        <section className="panel" role="status">
          <h2>Rankings are being refreshed</h2>
          <p>
            A reviewed build has changed or its evidence is unavailable. We will show the new
            ranking after it has been measured, rather than reuse an older score.
          </p>
          <Link href="/forever/simulator">Explore the available builds →</Link>
        </section>
      )}
      <section id="methodology" className={styles.method}>
        <span className="eyebrow">Reproducible, not a popularity vote</span>
        <h2>How this tier list is measured</h2>
        <p>
          Each row starts with a published, reviewed pre-raid build. We keep its equipment,
          enchants, talents, race, professions, consumables and rotation, then run 5,000 fights
          through that build’s versioned Forever engine.
        </p>
        <div className={styles.methodGrid}>
          <div>
            <h3>The same fight</h3>
            <p>
              300 seconds, no duration variation, one stationary level-63 Dragonkin, and no
              health-based early ending. Melee and ranged builds retain their reviewed positioning.
            </p>
          </div>
          <div>
            <h3>The same support</h3>
            <p>
              Full-v2 raid support includes Moonkin Aura, Leader of the Pack, Trueshot Aura,
              improved stat buffs, Kings, Might, Wisdom and Windfury. World buffs, external Power
              Infusion and Innervate are not supplied.
            </p>
          </div>
          <div>
            <h3>No free boss debuffs</h3>
            <p>
              We do not give one class a favourable external debuff allocation. Effects applied by
              the character or pet remain part of its rotation. This is not a fully debuffed raid
              forecast.
            </p>
          </div>
          <div>
            <h3>A repeatable comparison</h3>
            <p>
              The fixed seed is 58723001. Expand a row to inspect its sampling margin, original
              build or shared benchmark setup. Rankings refresh only after the current reviewed
              builds are measured again.
            </p>
          </div>
        </div>
        <p>
          These are beta-model estimates, not live combat logs or proof of best-in-slot gear.
          Item-granted weapon skill is ignored, while item stats, effects, talents and racials keep
          their modeled behaviour. Changing a fight’s length, target count, raid support or your
          gear can change the order.
        </p>
        <Link href="/forever/simulator/data">Inspect engine and item coverage →</Link>
      </section>
      <section className={styles.method} aria-labelledby="tier-faq">
        <h2 id="tier-faq">Choosing a WoW Forever DPS spec</h2>
        <details>
          <summary>What is the best DPS class in WoW Forever?</summary>
          <p>
            {top
              ? `${top.title} ${top.className} leads this measured snapshot. `
              : "The ranking is currently being refreshed. "}
            That answer applies to the published pre-raid builds and fight above. A different raid
            composition, rotation or encounter can favour another spec. Choose a class you enjoy and
            simulate your own setup.
          </p>
        </details>
        <details>
          <summary>Does a lower tier mean my spec is bad?</summary>
          <p>
            No. This page measures single-target damage only. Healing, survivability, crowd control,
            movement, buffs and raid utility are not part of the score. Small numerical gaps can
            also be within sampling uncertainty.
          </p>
        </details>
        <details>
          <summary>Why are some specs missing?</summary>
          <p>
            A supported simulator profile is not automatically a reviewed ranking. Retribution,
            Shockadin and Destruction are not ranked in this snapshot. Tanks and healers need
            different performance measures. Provisional proc-enchant variants are excluded from the
            standard board.
          </p>
        </details>
        <details>
          <summary>Can I use the exact gear and rotation?</summary>
          <p>
            Yes. Expand a spec and choose “View gear &amp; rotation” to open its reviewed build, or
            “Open benchmark setup” for the shared encounter and buffs. Loading a build in the
            simulator can replace that character’s current settings, so save your own build first.
          </p>
        </details>
        <details>
          <summary>Is this a leveling or dungeon tier list?</summary>
          <p>
            No. It is a level-60 pre-raid, single-target comparison. Short fights, cleave, dungeon
            pulls and leveling have different requirements. Use the simulator to explore those
            encounters, or follow our <Link href="/forever/leveling">Forever leveling guide</Link>.
          </p>
        </details>
      </section>
    </article>
  );
}
