import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "./json-ld";
import { ForeverTankTierList } from "./forever-tank-tier-list";
import { ForeverRankingNavigation } from "./forever-ranking-navigation";
import { readTankTierSnapshot } from "../lib/forever-tank-tier-list-data";
import { rankTankTierEntries, type TankTierScenario } from "../lib/forever-tank-tier-list";
import { createBreadcrumbJsonLd, createHelperMetadata, helperAbsoluteUrl } from "../lib/seo";
import styles from "../app/forever/tier-list/page.module.css";

export async function tankTierMetadata(scenario: TankTierScenario): Promise<Metadata> {
  const label = scenario === "solo" ? "Solo & Dungeon" : "Raid";
  return createHelperMetadata({
    title: `WoW Forever ${label} Tank Tier List — Threat & Damage Taken`,
    description: `Compare WoW Forever ${label.toLowerCase()} tanks with 5,000 simulations per starter build. Explore threat, physical damage taken and exact reproducible setups.`,
    path: scenario === "solo" ? "/forever/tier-list/tanks/solo" : "/forever/tier-list/tanks",
    keywords: [
      "WoW Forever tank tier list",
      "WoW Forever best tank",
      "WoW Forever Protection Warrior",
      "WoW Forever Feral tank",
      "WoW Forever Protection Paladin",
      "WoW Forever dungeon tanks",
    ],
    noIndex: !(await readTankTierSnapshot(scenario)),
  });
}
interface ForeverTankTierPageProps {
  readonly scenario: TankTierScenario;
}
export async function ForeverTankTierPage({
  scenario,
}: ForeverTankTierPageProps): Promise<React.JSX.Element> {
  const snapshot = await readTankTierSnapshot(scenario);
  const entries = snapshot ? rankTankTierEntries(snapshot) : [];
  const top = entries[0];
  const label = scenario === "solo" ? "Solo / dungeon" : "Raid";
  const path = scenario === "solo" ? "/forever/tier-list/tanks/solo" : "/forever/tier-list/tanks";
  const measuredAt = entries.reduce(
    (latest, entry): string => (entry.capturedAt > latest ? entry.capturedAt : latest),
    "",
  );
  return (
    <article className={`forever-reference-page ${styles.page}`} data-tank-scenario={scenario}>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "Forever Helper", path: "/forever" },
          { name: `${label} tank tier list`, path },
        ])}
      />
      {snapshot ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `WoW Forever ${label} Tank Tier List`,
            url: helperAbsoluteUrl(path),
            dateModified: measuredAt,
            description:
              "Measured blue-PvP-starter comparison by threat and physical damage taken under an explicit encounter policy.",
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
        <span className="eyebrow">Level 60 · Tank comparison · Forever beta</span>
        <h1>WoW Forever {label.toLowerCase()} tank tier list</h1>
        <p>
          Hold threat. Take less damage. Compare the trade-offs, inspect each build and try the
          exact setup yourself.
        </p>
        <div className={styles.links}>
          <a href="#tank-rankings">Explore the rankings ↓</a>
          <a href="#methodology">How we measure</a>
          <Link href="/forever/simulator">Open the simulator →</Link>
        </div>
      </header>
      <ForeverRankingNavigation
        active={scenario === "solo" ? "solo-tank" : "raid-tank"}
        label="Tank benchmark scenario"
      />
      {snapshot && top ? (
        <>
          <div className={styles.stats}>
            <div>
              <span>Highest measured threat</span>
              <strong>
                {top.title} {top.className}
              </strong>
              <small>{top.metrics.threat.avg.toFixed(1)} TPS</small>
            </div>
            <div>
              <span>Measured starters</span>
              <strong>{entries.length}</strong>
              <small>Warrior · Druid · Paladin</small>
            </div>
            <div>
              <span>Encounter</span>
              <strong>{scenario === "solo" ? "3 enemies · 1 minute" : "1 boss · 5 minutes"}</strong>
              <small>{scenario === "solo" ? "Level-62 dungeon pull" : "Level-63 raid boss"}</small>
            </div>
            <div>
              <span>Last measured</span>
              <strong>{measuredAt.slice(0, 10)}</strong>
              <small>5,000 fights per build · UTC</small>
            </div>
          </div>
          <p className={styles.notice}>
            {scenario === "solo"
              ? "Solo / dungeon uses your own buffs against three enemies, without outside raid support. A fixed healer keeps incoming attacks comparable; this is not a test of clearing a dungeon alone."
              : "Raid uses shared buffs and boss debuffs against one physical attacker. World buffs, Salvation and external mana or damage cooldowns are excluded."}{" "}
            Choose threat generation or damage taken below. These are comparisons of starter builds,
            not an overall class verdict. Threat coefficients include inherited model assumptions;
            inspect each build’s threat breakdown before treating its tier as a class
            recommendation.
          </p>
          <ForeverTankTierList snapshot={snapshot} />
        </>
      ) : (
        <section className="panel" role="status">
          <h2>Tank rankings are being refreshed</h2>
          <p>
            The selected tank engine or starter has changed. Updated measurements are required
            before scores can be shown.
          </p>
          <Link href="/forever/simulator">Explore the tank workspaces →</Link>
        </section>
      )}
      <section id="methodology" className={styles.method}>
        <span className="eyebrow">Reproducible comparison</span>
        <h2>How the tank tier list works</h2>
        <div className={styles.methodGrid}>
          <div>
            <h3>Two useful measures</h3>
            <p>
              Threat generation ranks total threat per second, highest first. Damage taken ranks
              physical damage received per second, lowest first. The other measure and DPS remain
              visible, so a threat advantage never hides a mitigation trade-off.
            </p>
          </div>
          <div>
            <h3>Explicit incoming damage</h3>
            <p>
              {scenario === "solo"
                ? "Three level-62 enemies, 60 seconds, each with 1,200 minimum melee damage."
                : "One level-63 enemy, 300 seconds, with 3,000 minimum melee damage."}{" "}
              Attackers have 3,731 armor, swing every two seconds and are assigned to the tank.
              Damage spread is 33.33%; parry haste is disabled. This is a synthetic physical
              benchmark, not a named boss encounter.
            </p>
          </div>
          <div>
            <h3>Same starter foundation</h3>
            <p>
              Each class keeps its published blue PvP starter, enchants, race, talents and rotation
              across both modes. Raid Windfury replaces Warrior and Paladin weapon coatings. These
              loadouts have not undergone the DPS builds’ full gear and talent optimization; no
              best-in-slot claim is made.
            </p>
          </div>
          <div>
            <h3>Controlled healing and support</h3>
            <p>
              Both modes supply a fixed 2,000 healing per second, delivered every two seconds. Raid
              adds the shared full-v2 buff package and documented debuffs; redundant self-cast
              Shout, Sunder/Expose Armor and Faerie Fire are not stacked. Dungeon uses own
              maintained buffs; Paladin receives its own Devotion Aura and one blessing, Wisdom.
              Righteous Fury is enabled in both Paladin setups. Healer skill and encounter mechanics
              are outside the score.
            </p>
          </div>
        </div>
        <p>
          Each build runs 5,000 fights with seed 61723001 in the published tank engine. Exact
          imports include the complete benchmark configuration. Sampling margins describe run-to-run
          variation; they do not measure the uncertainty in beta mechanics.
        </p>
        <p>
          Incoming rage, scripted effects and some beta tank mechanics remain provisional. Magic
          damage, burst survival, cooldown timing, utility, movement, target swaps and pull-by-pull
          threat control are not ranked here. All dungeon enemies are assigned to the tank; total
          TPS alone does not prove every enemy stays controlled.
        </p>
        <Link href="/forever/simulator/data">Inspect model and item coverage →</Link>
      </section>
      <section className={styles.method} aria-labelledby="tank-faq">
        <h2 id="tank-faq">Choosing a WoW Forever tank</h2>
        <details>
          <summary>What is the best tank in WoW Forever?</summary>
          <p>
            {top
              ? `${top.title} ${top.className} leads threat generation in this snapshot. `
              : "The current snapshot is being refreshed. "}
            Use the damage-taken view to compare mitigation. Neither view includes every part of
            tanking; your group, equipment and encounter can change the better choice.
          </p>
        </details>
        <details>
          <summary>Does Solo mean I can clear a dungeon alone?</summary>
          <p>
            No. This page uses “Solo / dungeon” for a smaller pull with your own class support. A
            fixed external healer is still configured. Solo survival and full dungeon clears are
            different tests.
          </p>
        </details>
        <details>
          <summary>How is Protection Paladin calculated?</summary>
          <p>
            Paladin is included under the same model-estimate policy as Warrior and Bear. Righteous
            Fury multiplies Holy threat by 1.9; physical weapon attacks do not receive that
            multiplier. The measured starter uses Seal of Righteousness. Seal of Fury is also
            implemented in the engine, with provisional shield assumptions; no optimized seal choice
            is claimed by this comparison.
          </p>
        </details>
        <details>
          <summary>Why can Bear generate more threat per point of damage?</summary>
          <p>
            Feral Instinct no longer increases Bear threat in Forever. Threat comes from the form,
            individual abilities and fixed-threat effects as well as damage. In this model, Bear
            Form multiplies threat by 1.5, while Primal Bite, Lacerate, Maul and Swipe have
            additional multipliers. Primal Bite’s absolute coefficient and Swipe’s inherited
            reference remain assumptions. Select Bear and open “How this build generates threat” to
            see the actual contribution of each action.
          </p>
          <a href="https://worldofwarcraft.blizzard.com/en-us/news/24301515/world-of-warcraft-forever-class-deep-dives-hunter-and-druid">
            Official Druid changes ↗
          </a>
        </details>
      </section>
    </article>
  );
}
