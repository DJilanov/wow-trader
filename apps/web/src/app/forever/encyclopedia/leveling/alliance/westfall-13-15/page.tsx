import type { Metadata } from "next";
import Link from "next/link";
import {
  BETA_NOTES_SOURCE,
  DUNGEON_LEVEL_SOURCE,
  LEVELING_EVIDENCE,
  WESTFALL_ROUTE,
} from "@wow-trader/leveling";

import { ForeverEncyclopediaNav } from "../../../../../../components/forever-encyclopedia-nav";
import { ForeverLevelingPlanner } from "../../../../../../components/forever-leveling-planner";
import { JsonLd } from "../../../../../../components/json-ld";
import {
  createBreadcrumbJsonLd,
  createHelperMetadata,
  HELPER_SITE_URL,
} from "../../../../../../lib/seo";
import styles from "../../page.module.css";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Alliance Westfall 13–15 Guide & XP Calculator",
  description:
    "Compare crowded Westfall quests with Hall of Thanes at level 14. Preserve Defias prerequisites, count shared XP once and include the full dungeon trip in this free route preview.",
  path: WESTFALL_ROUTE.path,
  keywords: [
    "WoW Forever Westfall leveling",
    "Hall of Thanes level 14",
    "WoW Forever dungeon XP calculator",
  ],
});

export default function WestfallLevelingPage(): React.JSX.Element {
  return (
    <article className="forever-reference-page">
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "Forever Encyclopedia", path: "/forever/encyclopedia" },
          { name: "Leveling", path: "/forever/encyclopedia/leveling" },
          { name: "Alliance Westfall 13–15", path: WESTFALL_ROUTE.path },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          "@id": `${HELPER_SITE_URL}${WESTFALL_ROUTE.path}#article`,
          headline: "WoW Forever: Alliance Westfall 13–15 route preview and dungeon comparison",
          description: metadata.description,
          datePublished: WESTFALL_ROUTE.reviewedAt,
          dateModified: WESTFALL_ROUTE.reviewedAt,
          author: { "@type": "Organization", name: "KFC Guild", url: "https://kfcguild.online" },
          publisher: { "@type": "Organization", name: "KFC Helper", url: HELPER_SITE_URL },
          mainEntityOfPage: `${HELPER_SITE_URL}${WESTFALL_ROUTE.path}`,
        }}
      />
      <header className="forever-reference-hero">
        <Link className="helper-back-link" href="/forever/encyclopedia/leveling">
          ← Leveling routes & dungeon levels
        </Link>
        <span className="eyebrow">
          Alliance · class-neutral route preview · build {WESTFALL_ROUTE.clientBuild}
        </span>
        <h1>
          Westfall 13–15.
          <br />
          Keep moving.
        </h1>
        <p>
          Watchers, oats and shared drops can slow a crowded route. Use this original Westfall
          companion to preserve important unlocks and compare a Hall of Thanes visit around level
          14.
        </p>
      </header>
      <ForeverEncyclopediaNav active="leveling" />
      <div className={styles.notice}>
        Reviewed October 4, 2026 · KFC Guild · version {WESTFALL_ROUTE.version}. This is an authored
        route preview awaiting a current-beta playthrough. Quest rewards must come from your
        character; the extracted XP curve still needs live confirmation. Coverage ends at level 15.
      </div>
      <section className={styles.section}>
        <h2>When to take the dungeon branch</h2>
        <p>
          Hall of Thanes has a reference “At level” target of 14. Start with Important Heirlooms and
          An Ancient Grudge. Adding The Restless Dead or Old Ironforge Incursion moves the bundle to
          15; adding The Treaty of Understanding moves it to 16, beyond this route slice.
        </p>
        <p>
          Deadmines has an “At level” target of 19. Preserve its Defias chain while travelling
          through Westfall, then compare the clear later. An early quest pickup level does not make
          a level-13 clear the default plan.
        </p>
        <p>
          Enter the reward actually shown at your turn-in level. The October 1 beta changes reduced
          extra dungeon quest XP, so an old reward or a blanket multiplier cannot establish today’s
          best route.
        </p>
        <a className={styles.button} href="#planner">
          Compare my remaining work ↓
        </a>
      </section>
      <section className={styles.section} aria-labelledby="route-heading">
        <h2 id="route-heading">The ordered route</h2>
        <p>
          The six crowded objectives are optional alternatives, not automatic skips. Keep oil,
          murloc work or bandanas needed by a quest you retain. The same kills and travel belong to
          one comparison block.
        </p>
        <ol className={styles.steps}>
          {WESTFALL_ROUTE.steps.map((step) => (
            <li id={`route-${step.id}`} key={step.id}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <small>
                {step.optional ? "Optional outdoor task · " : ""}
                {step.position
                  ? `${step.position.zone} · ${step.position.x}, ${step.position.y}`
                  : step.action === "checkpoint"
                    ? `Level ${step.level} checkpoint`
                    : ""}
              </small>
              {step.questId !== null ? (
                <Link href={`/forever/encyclopedia/quests/${step.questId}`}>
                  Quest {step.questId} reference →
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <ForeverLevelingPlanner route={WESTFALL_ROUTE} />
      <section className={styles.section}>
        <h2>Keep the unlocks you intend to use</h2>
        <p>
          The final Defias dungeon reward needs the preparation 65 → 132 → 135 → 141 → 142 → 155.
          Keep Red Leather Bandanas (153) conservatively if planning Red Silk Bandanas; its current
          server gate is still under review.
        </p>
        <p>
          The explosives reward has its own Toxic Soil work: 92742 → 92744 → 92745 → 92747 → 92748 →
          92749 → 92750 → 92751 → 92752, followed by the dungeon task 92753. Count its added time
          and XP only if your original route did not already include it. The dungeon quest itself
          and later follow-ups are not prerequisites.
        </p>
        <div className={styles.notice}>
          <strong>Rejoin point:</strong> {WESTFALL_ROUTE.rejoin}
        </div>
      </section>
      <section className={styles.section}>
        <h2>How the comparison is calculated</h2>
        <p>
          Remaining outdoor XP includes the selected turn-ins and the kills or exploration you would
          omit. Additional XP includes new dungeon rewards, extra kills and new prerequisite work.
          Completed quests and rewards already planned on the original route add no extra XP.
        </p>
        <p>
          The calculator subtracts the full detour and catch-up time from the crowded outdoor block.
          A positive total does not override an unreachable entry checkpoint. Later rewards cannot
          pay for the level needed to enter, and the browser applies a branch only when its
          requirements are satisfied within this slice.
        </p>
        <p>
          The level curve was extracted from {LEVELING_EVIDENCE.curveSource} in client{" "}
          {WESTFALL_ROUTE.clientBuild}. Level 13 needs 11,400 XP to reach 14; level 14 needs 12,900
          XP to reach 15. These are client values pending a runtime check.
        </p>
      </section>
      <section className={styles.section}>
        <h2>RestedXP edition</h2>
        <p>
          The original route and the Hall of Thanes alternative compile into a separate KFC guide
          addon using the same release and step IDs. The maintainer package needs an in-game pickup,
          tracking and return-route test before a supporter download can be offered. Free browser
          access remains available throughout.
        </p>
        <p>
          A €9.99 contribution will support our small team and include access to the tested
          supporter guide once its advertised coverage and delivery are ready. Checkout is not open
          for this preview.
        </p>
      </section>
      <footer className={styles.sources}>
        <strong>Evidence and corrections</strong>
        <span>
          Dungeon levels and pickup references:{" "}
          <a href={DUNGEON_LEVEL_SOURCE} target="_blank" rel="noopener noreferrer">
            Wowhead guide, updated October 2
          </a>
          .
        </span>
        <span>
          Availability and changed rewards:{" "}
          <a href={BETA_NOTES_SOURCE} target="_blank" rel="noopener noreferrer">
            Blizzard October 1 beta notes
          </a>
          .
        </span>
        <span>
          The installed Journal reports earlier Hall pickup levels than the guide; the planner uses
          the later guide values until checked in game. Individual rewards and prerequisite bindings
          were not present in the client quest identity table.
        </span>
        <span>
          Report a missing or incorrect fact through the{" "}
          <a href="https://www.wowforeverdiscord.online/research/world">
            community research review
          </a>
          , including the quest ID, client build and your turn-in level.
        </span>
      </footer>
    </article>
  );
}
