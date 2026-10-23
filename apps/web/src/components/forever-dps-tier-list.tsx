"use client";

import { useId, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  filterDpsTierEntries,
  type DpsTierEntry,
  type DpsTierScenario,
  type DpsTier,
} from "../lib/forever-dps-tier-list";
import { dpsTierArtwork } from "../lib/forever-dps-tier-artwork";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./forever-dps-tier-list.module.css";

interface ForeverDpsTierListProps {
  readonly entries: readonly DpsTierEntry[];
  readonly scenario?: DpsTierScenario;
}
const tiers: readonly DpsTier[] = ["S", "A", "B", "C", "D"];

export function ForeverDpsTierList({
  entries,
  scenario = "raid",
}: ForeverDpsTierListProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const id = useId();
  const visible = filterDpsTierEntries(entries, query, classSlug);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const classes = [
    ...new Map(
      entries.map((entry): [string, string] => [entry.classSlug, entry.className]),
    ).entries(),
  ].sort((left, right): number => left[1].localeCompare(right[1]));
  const label = scenario === "solo" ? "Solo" : "Raid";
  const selectedArtwork = selected ? dpsTierArtwork(selected) : null;

  return (
    <section aria-labelledby="dps-rankings" className={styles.board}>
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">Level 60 · Pre-raid · Single target</span>
          <h2 id="dps-rankings">{label} DPS rankings</h2>
        </div>
        <span>{entries.length} measured builds</span>
      </header>
      <div className={styles.filters}>
        <div>
          <label htmlFor={`${id}-search`}>Find a spec or class</label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            maxLength={100}
            placeholder="Try Shadow Priest"
            onChange={(event): void => setQuery(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-class`}>Class</label>
          <select
            id={`${id}-class`}
            value={classSlug}
            onChange={(event): void => setClassSlug(event.target.value)}
          >
            <option value="">All classes</option>
            {classes.map(([slug, name]) => (
              <option value={slug} key={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className={styles.caption} role="status">
        {visible.length} of {entries.length} builds · Select a spec to inspect its exact setup.
      </p>
      <div className={styles.tierBoard} role="group" aria-label="DPS tier board">
        {tiers.map((tier) => {
          const builds = visible.filter((entry) => entry.tier === tier);
          return (
            <section
              key={tier}
              className={styles.tierRow}
              data-tier={tier}
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
                {builds.map((entry) => {
                  const artwork = dpsTierArtwork(entry);
                  return (
                    <li key={entry.id} className={styles.entry}>
                      <button
                        type="button"
                        className={styles.tile}
                        data-tier-build={entry.id}
                        style={{ "--class-color": entry.color } as CSSProperties}
                        aria-label={`${entry.title} ${entry.className}: ${entry.dps.toFixed(1)} DPS, tier ${tier}`}
                        aria-pressed={selected?.id === entry.id}
                        aria-controls={`${id}-build-preview`}
                        title={`${entry.title} · ${entry.className}\n${entry.dps.toFixed(1)} DPS · #${entry.rank}`}
                        onClick={(): void => setSelectedId(entry.id)}
                      >
                        <span className={styles.art}>
                          <Image
                            src={withHelperBasePath(artwork.specIcon)}
                            width={80}
                            height={80}
                            alt=""
                            unoptimized
                          />
                          <Image
                            src={withHelperBasePath(artwork.classIcon)}
                            width={22}
                            height={22}
                            alt=""
                            className={styles.classBadge}
                            unoptimized
                          />
                          <span className={styles.tileDps}>
                            <strong>{entry.dps.toFixed(1)}</strong>
                            <small>DPS</small>
                          </span>
                        </span>
                        <span className={styles.tileName}>{entry.title}</span>
                        {artwork.variant ? (
                          <small className={styles.variant}>{artwork.variant}</small>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {!builds.length ? (
                  <li className={styles.tierEmpty}>
                    {query || classSlug ? "No matching builds" : "No measured builds"}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      {selected && selectedArtwork ? (
        <div
          className={styles.preview}
          id={`${id}-build-preview`}
          data-selected-build={selected.id}
          style={{ "--class-color": selected.color } as CSSProperties}
        >
          <div className={styles.previewTop}>
            <div className={styles.identity}>
              <Image
                src={withHelperBasePath(selectedArtwork.classIcon)}
                width={38}
                height={38}
                alt=""
                unoptimized
              />
              <div aria-live="polite" aria-atomic="true">
                <strong>{selected.title}</strong>
                <small>
                  {selected.className} · #{selected.rank} ·{" "}
                  {selected.talents
                    .split("-")
                    .map((tree) => [...tree].reduce((sum, point): number => sum + Number(point), 0))
                    .join(" / ")}
                </small>
              </div>
            </div>
            <div className={styles.score} aria-live="polite" aria-atomic="true">
              <strong>
                {selected.dps.toFixed(2)} <small>DPS</small>
              </strong>
              <small>
                ± {selected.uncertainty95.toFixed(2)} · {selected.capturedAt.slice(0, 10)} UTC
              </small>
            </div>
            <a className={styles.exactSetup} href={withHelperBasePath(selected.benchmarkHref)}>
              Simulate {label} setup ↗
            </a>
          </div>
          <details className={styles.evidence}>
            <summary>Build details and measurement</summary>
            <p>
              Approximate 95% sampling margin: ±{selected.uncertainty95.toFixed(2)} DPS.
              {selected.closeToNext
                ? " The next build is within sampling uncertainty; treat their order as a near tie."
                : ""}
            </p>
            <dl>
              <div>
                <dt>Talents</dt>
                <dd>{selected.talents}</dd>
              </div>
              <div>
                <dt>Race</dt>
                <dd>{selected.race.replace(/^Race/, "").replace(/([a-z])([A-Z])/g, "$1 $2")}</dd>
              </div>
              <div>
                <dt>Measured fights</dt>
                <dd>{selected.iterations.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Measured</dt>
                <dd>{selected.capturedAt.slice(0, 10)} UTC</dd>
              </div>
            </dl>
            <Link href={selected.simulatorHref} prefetch={false}>
              Original reviewed build →
            </Link>
          </details>
          <p className={styles.caption}>
            Save your current simulator character before loading. The exact import also loads 5,000
            iterations and seed 58723001. Original study references can use different support.
          </p>
        </div>
      ) : (
        <div className={styles.empty}>
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
      {visible.length ? (
        <details className={styles.rankings}>
          <summary>
            Detailed DPS rankings <span aria-hidden="true">⌄</span>
          </summary>
          <div className={styles.tableScroll}>
            <table>
              <caption>
                {label} modeled DPS. Plus/minus is approximate 95% sampling error only.
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Build / class</th>
                  <th scope="col">DPS</th>
                  <th scope="col">Tier</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.rank}</td>
                    <th scope="row">
                      <a href={withHelperBasePath(entry.benchmarkHref)}>
                        {entry.title}
                        <small>{entry.className}</small>
                      </a>
                      <span className={styles.track} aria-hidden="true">
                        <span style={{ width: `${entry.share}%`, background: entry.color }} />
                      </span>
                      <small>{entry.share.toFixed(1)}% of leader</small>
                      <Link
                        href={entry.simulatorHref}
                        prefetch={false}
                        className={styles.originalLink}
                      >
                        Original reviewed build →
                      </Link>
                    </th>
                    <td>
                      <strong>{entry.dps.toFixed(1)}</strong>
                      <small>± {entry.uncertainty95.toFixed(1)}</small>
                    </td>
                    <td>
                      <span className={styles.tierLetter} data-tier={entry.tier}>
                        {entry.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      <p className={styles.caption}>
        Tiers are relative to the highest measured DPS: S ≥95%, A ≥85%, B ≥70%, C ≥55%, D &lt;55%.
        This compares damage, not healing, survivability or raid utility.
      </p>
    </section>
  );
}
