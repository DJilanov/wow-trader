import Link from "next/link";
import styles from "./forever-dps-ranking-links.module.css";

export function ForeverTankRankingLinks(): React.JSX.Element {
  return (
    <nav className={styles.links} aria-label="Compare WoW Forever tanks">
      <Link href="/forever/tier-list/tanks/solo" prefetch={false}>
        <strong>WoW Forever Solo / dungeon tanks →</strong>
        <span>Three enemies, your own buffs, threat and physical damage taken.</span>
      </Link>
      <Link href="/forever/tier-list/tanks" prefetch={false}>
        <strong>WoW Forever Raid tank rankings →</strong>
        <span>One boss, shared raid support and exact simulator setups.</span>
      </Link>
    </nav>
  );
}
