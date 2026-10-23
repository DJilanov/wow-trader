"use client";

import { useId, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  rankTankTierEntries,
  type TankTierMetric,
  type TankTierSnapshot,
} from "../lib/forever-tank-tier-list";
import { withHelperBasePath } from "../lib/site-path";
import { ForeverTierBoard } from "./forever-tier-board";
import { ForeverTankGearDetails } from "./forever-tank-gear-details";
import { ForeverTankThreatDetails } from "./forever-tank-threat-details";
import board from "./forever-dps-tier-list.module.css";
import styles from "./forever-tank-tier-list.module.css";

interface ForeverTankTierListProps {
  readonly snapshot: TankTierSnapshot;
}
export function ForeverTankTierList({ snapshot }: ForeverTankTierListProps): React.JSX.Element {
  const [metric, setMetric] = useState<TankTierMetric>("threat");
  const [selectedId, setSelectedId] = useState("");
  const id = useId();
  const entries = rankTankTierEntries(snapshot, metric);
  const selected = entries.find((entry): boolean => entry.id === selectedId) ?? entries[0];
  const optimized = snapshot.schema === "kfc-forever-tank-tier-list.v3";
  const unit = metric === "threat" ? "TPS" : "DTPS";
  const label = snapshot.policy.scenario === "raid" ? "Raid" : "Solo / dungeon";
  return (
    <section
      className={board.board}
      aria-labelledby="tank-rankings"
      data-tank-snapshot={snapshot.schema}
    >
      <header className={board.heading}>
        <div>
          <span className="eyebrow">
            Level 60 · {optimized ? "Pre-raid item search" : "Blue PvP starters"}
          </span>
          <h2 id="tank-rankings">{label} tank rankings</h2>
        </div>
        <span>{entries.length} measured builds</span>
      </header>
      <div className={styles.controls} role="group" aria-label="Rank tanks by">
        <button
          type="button"
          aria-pressed={metric === "threat"}
          onClick={(): void => setMetric("threat")}
        >
          Threat generation
        </button>
        <button
          type="button"
          aria-pressed={metric === "dtps"}
          onClick={(): void => setMetric("dtps")}
        >
          Damage taken
        </button>
      </div>
      <p className={board.caption} role="status">
        {metric === "threat"
          ? "More threat per second is better. Dungeon TPS totals all three enemies."
          : "Less physical damage taken per second is better. This compares mitigation in this fight, not overall survivability."}{" "}
        {optimized ? "Each view uses gear optimized for that objective. " : ""}Select a tank to
        inspect its setup.
      </p>
      <ForeverTierBoard
        id={id}
        label="Tank tier board"
        compactEmpty
        selectedId={selected?.id}
        onSelect={setSelectedId}
        entries={entries.map((entry) => ({ ...entry, value: entry.metrics[metric].avg, unit }))}
      />
      {selected ? (
        <div
          className={board.preview}
          id={`${id}-build-preview`}
          data-selected-build={selected.id}
          data-selected-objective={"objective" in selected ? selected.objective : undefined}
          style={{ "--class-color": selected.color } as CSSProperties}
        >
          <div className={board.previewTop}>
            <div className={board.identity}>
              <Image
                src={withHelperBasePath(selected.classIcon)}
                width={38}
                height={38}
                alt=""
                unoptimized
              />
              <div aria-live="polite" aria-atomic="true">
                <strong>
                  {selected.title} {selected.className}
                </strong>
                <small>
                  #{selected.rank} · {selected.race.replace(/^Race/, "")} ·{" "}
                  {selected.capturedAt.slice(0, 10)} UTC
                  {"objective" in selected
                    ? ` · ${selected.objective === "threat" ? "Threat" : "Physical mitigation"} gear`
                    : ""}
                </small>
              </div>
            </div>
            <div className={board.score} aria-live="polite" aria-atomic="true">
              <strong>
                {selected.metrics[metric].avg.toFixed(2)} <small>{unit}</small>
              </strong>
              <small>± {selected.uncertainty95.toFixed(2)} sampling margin</small>
            </div>
            <a className={board.exactSetup} href={withHelperBasePath(selected.benchmarkHref)}>
              Simulate {label} setup ↗
            </a>
          </div>
          <dl className={styles.metrics}>
            <div>
              <dt>Threat / second ↑</dt>
              <dd>{selected.metrics.threat.avg.toFixed(1)} TPS</dd>
            </div>
            <div>
              <dt>Damage taken / second ↓</dt>
              <dd>{selected.metrics.dtps.avg.toFixed(1)} DTPS</dd>
            </div>
            <div>
              <dt>Damage / second</dt>
              <dd>{selected.metrics.dps.avg.toFixed(1)} DPS</dd>
            </div>
            {"health" in selected ? (
              <>
                <div>
                  <dt>Health</dt>
                  <dd>{Math.round(selected.health).toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>Armor</dt>
                  <dd>{Math.round(selected.armor).toLocaleString("en-US")}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {"gear" in selected ? <ForeverTankGearDetails entry={selected} /> : null}
          <ForeverTankThreatDetails entry={selected} />
          <details className={board.evidence}>
            <summary>Build details and measurement</summary>
            <p>
              {selected.iterations.toLocaleString("en-US")} measured fights. Approximate 95%
              sampling margin: ±{selected.uncertainty95.toFixed(2)} {unit}.
              {selected.closeToNext
                ? " The next tank is within sampling uncertainty; treat the order as a near tie."
                : ""}
            </p>
            <dl>
              <div>
                <dt>Talents</dt>
                <dd>{selected.talents}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>{selected.release}</dd>
              </div>
              <div>
                <dt>Sampling {optimized ? "seeds" : "seed"}</dt>
                <dd>
                  {snapshot.schema === "kfc-forever-tank-tier-list.v3"
                    ? snapshot.policy.seeds.join(", ")
                    : snapshot.policy.seed}
                </dd>
              </div>
            </dl>
            <Link href={selected.simulatorHref} prefetch={false}>
              Open tank workspace →
            </Link>
          </details>
          <p className={board.caption}>
            Save your current character before loading. The exact import includes gear, talents,
            rotation, support, incoming attacks and healing.{" "}
            {optimized
              ? "The import runs 5,000 fights; reference scores pool 40,000 independent validation fights across two seeds."
              : "The import runs all 5,000 reference iterations."}
          </p>
        </div>
      ) : null}
      <details className={board.rankings}>
        <summary>
          Detailed tank rankings <span aria-hidden="true">⌄</span>
        </summary>
        <div className={board.tableScroll}>
          <table>
            <caption>{label}: threat is higher-is-better; damage taken is lower-is-better.</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Tank</th>
                <th scope="col">TPS ↑</th>
                <th scope="col">DTPS ↓</th>
                <th scope="col">DPS</th>
                <th scope="col">Tier</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.rank}</td>
                  <th scope="row">
                    <a href={withHelperBasePath(entry.benchmarkHref)}>
                      {entry.title}
                      <small>
                        {entry.className} · {entry.race.replace(/^Race/, "")}
                      </small>
                    </a>
                  </th>
                  <td>{entry.metrics.threat.avg.toFixed(1)}</td>
                  <td>{entry.metrics.dtps.avg.toFixed(1)}</td>
                  <td>{entry.metrics.dps.avg.toFixed(1)}</td>
                  <td>
                    <span className={board.tierLetter} data-tier={entry.tier}>
                      {entry.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className={board.caption}>
        Tiers compare the selected metric with the best measured result: S ≥95%, A ≥85%, B ≥70%, C
        ≥55%, D &lt;55%. For damage taken, the ratio is lowest DTPS ÷ tank DTPS. A tier reflects
        {optimized
          ? "the selected optimized gear and this encounter. Health is shown separately; the search does not impose a minimum-health requirement."
          : "these starter builds and this encounter."}
      </p>
    </section>
  );
}
