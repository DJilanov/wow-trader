import Link from "next/link";
import { FOREVER_CLIENT_PRODUCT } from "../lib/game-versions";
import {
  getExternalItemReference,
  getExternalQuestReference,
  getExternalSpellReference,
} from "../lib/item-reference";
import styles from "./leveling-experience.module.css";

interface LevelingEntityLinksProps {
  readonly kind: "quest" | "item" | "spell";
  readonly id: number;
}

export function LevelingEntityLinks({
  kind,
  id,
}: LevelingEntityLinksProps): React.JSX.Element | null {
  const external =
    kind === "quest"
      ? getExternalQuestReference(FOREVER_CLIENT_PRODUCT, id)
      : kind === "item"
        ? getExternalItemReference(FOREVER_CLIENT_PRODUCT, id)
        : getExternalSpellReference(FOREVER_CLIENT_PRODUCT, id);
  if (!external) return null;
  const label = `${kind[0]?.toUpperCase()}${kind.slice(1)} ${id}`;
  return (
    <div className={styles.entityLinks}>
      <a
        href={external.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} on Wowhead (opens in a new tab)`}
      >
        {label} · Wowhead ↗
      </a>
      {kind !== "spell" && (
        <Link href={`/forever/encyclopedia/${kind === "quest" ? "quests" : "items"}/${id}`}>
          Our {kind} library
        </Link>
      )}
    </div>
  );
}
