"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { TierBand } from "../lib/forever-tier-ranking";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./forever-dps-tier-list.module.css";

export interface TierBoardTile {
  readonly id: string;
  readonly title: string;
  readonly className: string;
  readonly color: string;
  readonly tier: TierBand;
  readonly rank: number;
  readonly value: number;
  readonly unit: string;
  readonly specIcon: string;
  readonly classIcon: string;
  readonly variant?: string;
}
interface ForeverTierBoardProps {
  readonly entries: readonly TierBoardTile[];
  readonly id: string;
  readonly label: string;
  readonly selectedId: string | undefined;
  readonly filtered?: boolean;
  readonly compactEmpty?: boolean;
  readonly onSelect: (id: string) => void;
}
const tiers: readonly TierBand[] = ["S", "A", "B", "C", "D"];

export function ForeverTierBoard({
  entries,
  id,
  label,
  selectedId,
  filtered = false,
  compactEmpty = false,
  onSelect,
}: ForeverTierBoardProps): React.JSX.Element {
  return (
    <div className={styles.tierBoard} role="group" aria-label={label}>
      {tiers.map((tier) => {
        const builds = entries.filter((entry): boolean => entry.tier === tier);
        return (
          <section
            key={tier}
            className={styles.tierRow}
            data-tier={tier}
            data-empty={compactEmpty && !builds.length ? "true" : undefined}
            aria-labelledby={`${id}-tier-${tier}`}
          >
            <div className={styles.tierLabel}>
              <strong id={`${id}-tier-${tier}`}>
                <span className="sr-only">Tier </span>
                {tier}
              </strong>
              <small>{builds.length}</small>
            </div>
            <ul className={styles.tiles} aria-label={`${tier} tier builds`}>
              {builds.map((entry) => (
                <li key={entry.id} className={styles.entry}>
                  <button
                    type="button"
                    className={styles.tile}
                    data-tier-build={entry.id}
                    style={{ "--class-color": entry.color } as CSSProperties}
                    aria-label={`${entry.title} ${entry.className}: ${entry.value.toFixed(1)} ${entry.unit}, tier ${tier}`}
                    aria-pressed={selectedId === entry.id}
                    aria-controls={`${id}-build-preview`}
                    title={`${entry.title} · ${entry.className}\n${entry.value.toFixed(1)} ${entry.unit} · #${entry.rank}`}
                    onClick={(): void => onSelect(entry.id)}
                  >
                    <span className={styles.art}>
                      <Image
                        src={withHelperBasePath(entry.specIcon)}
                        width={80}
                        height={80}
                        alt=""
                        unoptimized
                      />
                      <Image
                        src={withHelperBasePath(entry.classIcon)}
                        width={22}
                        height={22}
                        alt=""
                        className={styles.classBadge}
                        unoptimized
                      />
                      <span className={styles.tileDps}>
                        <strong>{entry.value.toFixed(1)}</strong>
                        <small>{entry.unit}</small>
                      </span>
                    </span>
                    <span className={styles.tileName}>{entry.title}</span>
                    {entry.variant ? (
                      <small className={styles.variant}>{entry.variant}</small>
                    ) : null}
                  </button>
                </li>
              ))}
              {!builds.length ? (
                <li className={styles.tierEmpty}>
                  {filtered ? "No matching builds" : "No builds in this tier"}
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
