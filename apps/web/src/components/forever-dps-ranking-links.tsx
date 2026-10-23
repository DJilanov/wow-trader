import Link from "next/link";
import styles from "./forever-dps-ranking-links.module.css";

export function ForeverDpsRankingLinks(): React.JSX.Element {
  return (
    <nav className={styles.links} aria-label="Compare WoW Forever DPS">
      <Link href="/forever/tier-list/solo" prefetch={false}>
        <strong>WoW Forever Solo DPS rankings →</strong>
        <span>Your own support, with no outside buffs or mana grants.</span>
      </Link>
      <Link href="/forever/tier-list" prefetch={false}>
        <strong>WoW Forever Raid DPS rankings →</strong>
        <span>Shared raid buffs and documented boss debuffs.</span>
      </Link>
    </nav>
  );
}
