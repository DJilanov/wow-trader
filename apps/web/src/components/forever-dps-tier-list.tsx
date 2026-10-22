"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { filterDpsTierEntries, type DpsTierEntry } from "../lib/forever-dps-tier-list";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./forever-dps-tier-list.module.css";

interface ForeverDpsTierListProps {
  readonly entries: readonly DpsTierEntry[];
}
export function ForeverDpsTierList({ entries }: ForeverDpsTierListProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const visible = filterDpsTierEntries(entries, query, classSlug);
  const classes = [
    ...new Map(
      entries.map((entry): [string, string] => [entry.classSlug, entry.className]),
    ).entries(),
  ].sort((left, right): number => left[1].localeCompare(right[1]));
  return (
    <section aria-labelledby="dps-rankings" className={styles.board}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">One fight. One support policy.</span>
          <h2 id="dps-rankings">DPS rankings</h2>
        </div>
        <span>{entries.length} measured builds</span>
      </div>
      <div className={styles.filters}>
        <label>
          Find a spec or class
          <input
            type="search"
            value={query}
            maxLength={100}
            placeholder="Try Shadow Priest"
            onChange={(event): void => setQuery(event.target.value)}
          />
        </label>
        <label>
          Class
          <select value={classSlug} onChange={(event): void => setClassSlug(event.target.value)}>
            <option value="">All classes</option>
            {classes.map(([slug, name]) => (
              <option value={slug} key={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={styles.caption} aria-live="polite">
        {visible.length} of {entries.length} builds · DPS, not healing, survivability or raid
        utility
      </p>
      {visible.length ? (
        <ol className={styles.list}>
          {visible.map((entry) => (
            <li
              key={entry.id}
              value={entry.rank}
              className={styles.row}
              style={
                { "--class-color": entry.color, "--dps-width": `${entry.share}%` } as CSSProperties
              }
            >
              <details>
                <summary>
                  <span className={styles.rank}>#{entry.rank}</span>
                  <span
                    className={`${styles.tier} ${styles[`tier${entry.tier}`]}`}
                    aria-label={`Tier ${entry.tier}`}
                  >
                    {entry.tier}
                  </span>
                  <Image
                    src={withHelperBasePath(entry.icon)}
                    width={40}
                    height={40}
                    alt=""
                    className={styles.icon}
                  />
                  <span className={styles.identity}>
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.className}
                      {entry.id === "priest-smite-static" ||
                      entry.id === "shaman-stormcaller-static"
                        ? " · Hybrid"
                        : ""}
                    </small>
                  </span>
                  <span className={styles.score}>
                    <strong>
                      {entry.dps.toLocaleString("en-US", { maximumFractionDigits: 0 })}{" "}
                      <small>DPS</small>
                    </strong>
                    <small>{entry.share.toFixed(1)}% of top</small>
                  </span>
                  <span className={styles.expand} aria-hidden="true">
                    +
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span />
                  </span>
                </summary>
                <div className={styles.details}>
                  <p>
                    {entry.title} {entry.className} deals{" "}
                    <strong>{entry.dps.toFixed(2)} simulated DPS</strong> with this pre-raid
                    reference build. Approximate 95% sampling margin: ±
                    {entry.uncertainty95.toFixed(2)} DPS.
                    {entry.closeToNext
                      ? " The next build is within sampling uncertainty; treat their order as a near tie."
                      : ""}
                  </p>
                  <dl>
                    <div>
                      <dt>Talents</dt>
                      <dd>{entry.talents}</dd>
                    </div>
                    <div>
                      <dt>Race</dt>
                      <dd>{entry.race.replace(/^Race/, "").replace(/([a-z])([A-Z])/g, "$1 $2")}</dd>
                    </div>
                    <div>
                      <dt>Measured fights</dt>
                      <dd>{entry.iterations.toLocaleString("en-US")}</dd>
                    </div>
                    <div>
                      <dt>Measured</dt>
                      <dd>{entry.capturedAt.slice(0, 10)} UTC</dd>
                    </div>
                  </dl>
                  <div className={styles.actions}>
                    <Link href={entry.simulatorHref}>View gear &amp; rotation →</Link>
                    <a href={withHelperBasePath(entry.benchmarkHref)}>Open benchmark setup →</a>
                  </div>
                  <small>
                    The benchmark keeps the reviewed gear, talents, race and consumables. To repeat
                    its sampling, use 5,000 iterations and seed 58723001. It is a comparison of
                    these builds, not proof of each spec’s maximum.
                  </small>
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <div className="panel">
          <h3>No builds match</h3>
          <p>Try another class or clear your search.</p>
          <button
            type="button"
            onClick={(): void => {
              setQuery("");
              setClassSlug("");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <p className={styles.caption}>
        Tiers are relative to the highest measured DPS: S ≥95%, A ≥85%, B ≥70%, C ≥55%, D &lt;55%. A
        lower tier does not mean a class has no place in a raid.
      </p>
    </section>
  );
}
