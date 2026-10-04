import type { Metadata } from "next";
import Link from "next/link";
import {
  DUNGEON_LEVELS,
  DUNGEON_LEVEL_SOURCE,
  LEVELING_EVIDENCE,
  WESTFALL_ROUTE,
} from "@wow-trader/leveling";

import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { JsonLd } from "../../../../components/json-ld";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../../lib/seo";
import styles from "./page.module.css";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Leveling Guide & Dungeon XP Planner",
  description:
    "Plan a WoW Forever dungeon visit around recommended levels, quest prerequisites, remaining XP and the full travel cost. Start with the free Alliance Westfall 13–15 preview.",
  path: "/forever/encyclopedia/leveling",
  keywords: ["WoW Forever leveling", "WoW Forever dungeon levels", "WoW Forever XP calculator"],
});

export default function LevelingDirectoryPage(): React.JSX.Element {
  return (
    <article className="forever-reference-page">
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "WoW Forever", path: "/forever" },
          { name: "Encyclopedia", path: "/forever/encyclopedia" },
          { name: "Leveling", path: "/forever/encyclopedia/leveling" },
        ])}
      />
      <header className="forever-reference-hero">
        <span className="eyebrow">Free browser guide & calculator</span>
        <h1>Find a better way to level.</h1>
        <p>
          When a quest area is crowded, compare its remaining work with a dungeon visit at the right
          level. Count the trip, the quest preparation and the XP you still need.
        </p>
      </header>
      <ForeverEncyclopediaNav active="leveling" />
      <section className={styles.routeCard} aria-labelledby="first-route-heading">
        <div>
          <span className="eyebrow">Alliance · levels 13–15 · route preview</span>
          <h2 id="first-route-heading">Westfall without the queue.</h2>
          <p>
            An original crowd-aware route with a Hall of Thanes comparison, protected Defias
            preparation and an explicit return point. Current reward XP and a beta playthrough still
            need verification.
          </p>
          <Link className={styles.button} href={WESTFALL_ROUTE.path}>
            Open the Westfall guide & calculator →
          </Link>
        </div>
        <div className={styles.scope}>
          <strong>13–15</strong>
          <span>First route slice</span>
          <small>
            Client build {LEVELING_EVIDENCE.clientBuild}
            <br />
            Class-neutral quest and travel guidance
            <br />
            Horde and later zones are not covered yet
          </small>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="visit-levels-heading">
        <span className="eyebrow">Choose when to go</span>
        <h2 id="visit-levels-heading">Dungeon difficulty at your level</h2>
        <p>
          “At level” is the default visit target. A quest bundle can move that target later when one
          of its pickups needs a higher level. The Hard and Medium bands describe earlier, more
          demanding visits; they are not entry requirements.
        </p>
        <div className={styles.tableScroll} tabIndex={0} aria-label="Dungeon level reference">
          <table className={styles.table}>
            <caption>
              Reference difficulty bands, reviewed October 4. The current beta level cap is{" "}
              {LEVELING_EVIDENCE.betaLevelCap}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Dungeon</th>
                <th scope="col">Hard</th>
                <th scope="col">Medium</th>
                <th scope="col">At level</th>
                <th scope="col">Easy</th>
                <th scope="col">Planning status</th>
              </tr>
            </thead>
            <tbody>
              {DUNGEON_LEVELS.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">{entry.name}</th>
                  <td>{entry.hard}</td>
                  <td>{entry.medium}</td>
                  <td className={styles.anchor}>{entry.atLevel}</td>
                  <td>{entry.easy}</td>
                  <td>
                    {entry.atLevel > LEVELING_EVIDENCE.betaLevelCap
                      ? "Default visit above beta cap"
                      : entry.id === "thanes"
                        ? "Westfall alternative"
                        : entry.id === "deadmines"
                          ? "Prepare early, compare at 19"
                          : "Level reference; route not authored"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>
          Source:{" "}
          <a href={DUNGEON_LEVEL_SOURCE} target="_blank" rel="noopener noreferrer">
            Wowhead’s dungeon quest and level guide
          </a>
          , updated October 2. The guide identifies beta uncertainties; these are reference
          recommendations, not KFC playthrough results. Scarlet Monastery’s row covers all wings
          together. Availability and level suitability are separate.
        </p>
      </section>
      <section className={styles.section}>
        <h2>A good detour has three checks</h2>
        <ol className={styles.principles}>
          <li>
            <strong>Reach it first.</strong> Confirm the planned visit level before using any
            rewards earned inside.
          </li>
          <li>
            <strong>Compare the whole block.</strong> Count shared kills and travel once, then add
            the clear, pickups, wait, prerequisites, turn-ins and return.
          </li>
          <li>
            <strong>Rejoin without losing unlocks.</strong> Keep required quest chains, class
            training and travel connections. Include catch-up work for lost XP.
          </li>
        </ol>
        <p>
          Free browser routes and calculations will remain available. A RestedXP supporter edition
          is in preparation; contribution checkout will open after the guide and delivery have
          passed their release checks.
        </p>
      </section>
    </article>
  );
}
