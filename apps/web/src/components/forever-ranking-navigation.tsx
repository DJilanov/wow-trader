import Link from "next/link";
import styles from "../app/forever/tier-list/page.module.css";

type RankingPage = "raid-dps" | "solo-dps" | "raid-tank" | "solo-tank" | "healers";
interface ForeverRankingNavigationProps {
  readonly active: RankingPage;
  readonly label: string;
}
const links: readonly { readonly id: RankingPage; readonly path: string; readonly name: string }[] =
  [
    { id: "raid-dps", path: "/forever/tier-list", name: "Raid DPS" },
    { id: "solo-dps", path: "/forever/tier-list/solo", name: "Solo DPS" },
    { id: "raid-tank", path: "/forever/tier-list/tanks", name: "Raid tanks" },
    { id: "solo-tank", path: "/forever/tier-list/tanks/solo", name: "Solo / dungeon tanks" },
    { id: "healers", path: "/forever/tier-list/healers", name: "Healers" },
  ];
export function ForeverRankingNavigation({
  active,
  label,
}: ForeverRankingNavigationProps): React.JSX.Element {
  return (
    <nav className={styles.links} aria-label={label}>
      {links.map((link) => (
        <Link key={link.id} href={link.path} aria-current={active === link.id ? "page" : undefined}>
          {link.name}
        </Link>
      ))}
    </nav>
  );
}
