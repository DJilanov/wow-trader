"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ForeverTierBoard } from "./forever-tier-board";
import {
  rankHealerTierEntries,
  type HealerTierAssignment,
  type HealerTierSnapshot,
} from "../lib/forever-healer-tier-list";
import styles from "./forever-dps-tier-list.module.css";
import controls from "./forever-tank-tier-list.module.css";

const assignments: readonly { id: HealerTierAssignment; label: string; description: string }[] = [
  {
    id: "group",
    label: "Group healing",
    description: "Four injured recipients take 200 damage each per second.",
  },
  {
    id: "tank",
    label: "Tank healing",
    description:
      "One recipient takes 800 damage per second. This is the heavy single-target stress test.",
  },
  {
    id: "burst",
    label: "Burst recovery",
    description: "Four recipients each take 2,500 damage every 15 seconds.",
  },
];
export function ForeverHealerTierList({
  snapshot,
}: {
  readonly snapshot: HealerTierSnapshot;
}): React.JSX.Element {
  const [assignment, setAssignment] = useState<HealerTierAssignment>("group");
  const [selectedId, setSelectedId] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const id = useId();
  const entries = rankHealerTierEntries(snapshot, assignment);
  const visible = entries.filter((entry) => !classSlug || entry.classSlug === classSlug);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const current = assignments.find((entry) => entry.id === assignment)!;
  return (
    <section className={styles.board} aria-labelledby="healer-rankings">
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">Level 60 · Current pre-raid builds</span>
          <h2 id="healer-rankings">Healer rankings</h2>
        </div>
        <span>{entries.length} measured builds per assignment</span>
      </header>
      <div className={controls.controls} role="group" aria-label="Healing assignment">
        {assignments.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={assignment === entry.id}
            onClick={(): void => setAssignment(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className={styles.filters}>
        <div>
          <label htmlFor={id + "-class"}>Class</label>
          <select
            id={id + "-class"}
            value={classSlug}
            onChange={(event): void => setClassSlug(event.currentTarget.value)}
          >
            <option value="">All healers</option>
            {["priest", "druid", "shaman", "paladin"].map((slug) => (
              <option key={slug} value={slug}>
                {slug[0]!.toUpperCase() + slug.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className={styles.caption} role="status">
        {current.description} Same 3-minute fight, health pools and stacked positions for every
        class. Builds passing 99% survival rank first, then useful HPS. Overhealing adds no score.
      </p>
      <ForeverTierBoard
        entries={visible.map((entry) => ({
          ...entry,
          value: entry.metrics.hps,
          unit: "HPS",
          ...(!entry.survivalPassed ? { variant: "Survival below 99%" } : {}),
        }))}
        id={id}
        label="Healer tier board"
        compactEmpty
        filtered={Boolean(classSlug)}
        selectedId={selected?.id}
        onSelect={setSelectedId}
      />
      {selected ? (
        <div
          className={styles.preview}
          id={id + "-build-preview"}
          data-selected-healer={selected.id}
        >
          <div className={styles.previewTop}>
            <div className={styles.identity}>
              <div aria-live="polite">
                <strong>
                  {selected.title} · {selected.className}
                </strong>
                <small>
                  {current.label} · {selected.metrics.iterations} measured fights
                </small>
              </div>
            </div>
            <div className={styles.score} aria-live="polite">
              <strong>
                {selected.metrics.hps.toFixed(1)} <small>useful HPS</small>
              </strong>
              <small>± {selected.uncertainty95.toFixed(2)} sampling margin</small>
            </div>
            <Link className={styles.exactSetup} href={selected.simulatorHref} prefetch={false}>
              Open this build →
            </Link>
          </div>
          <dl className={controls.metrics}>
            <div>
              <dt>Effective healing</dt>
              <dd>{selected.metrics.effectiveHealingHps.toFixed(1)} HPS</dd>
            </div>
            <div>
              <dt>Consumed absorbs</dt>
              <dd>{selected.metrics.absorbedHps.toFixed(1)} HPS</dd>
            </div>
            <div>
              <dt>Assignment survival</dt>
              <dd>{(selected.metrics.survivalRate * 100).toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Overhealing · excluded</dt>
              <dd>{selected.metrics.overhealingHps.toFixed(1)} HPS</dd>
            </div>
            <div>
              <dt>Mana remaining</dt>
              <dd>{selected.metrics.manaRemainingMean.toFixed(0)}</dd>
            </div>
            <div>
              <dt>Average missing health</dt>
              <dd>{(selected.metrics.missingHealthSecondsMean / 180).toFixed(0)}</dd>
            </div>
          </dl>
          {!selected.survivalPassed ? (
            <p className={styles.notice}>
              This build did not keep every assigned recipient alive in at least 99% of these
              fights. Its throughput is shown for diagnosis; it does not pass this workload.
            </p>
          ) : null}
          <p className={styles.caption}>
            This opens the measured gear and casting build. The shared comparison uses the incoming
            damage described above; personal simulator scenarios retain their own original workload.
          </p>
          <details className={styles.evidence}>
            <summary>Measurement and model</summary>
            <p>
              Two independent seeds: {snapshot.policy.seeds.join(", ")}; 256 fights each.
              Approximate 95% margins describe sampling uncertainty, not uncertainty in beta
              mechanics.
            </p>
            <dl>
              <div>
                <dt>Engine release</dt>
                <dd>{selected.release}</dd>
              </div>
              <div>
                <dt>Measured</dt>
                <dd>{selected.proofs[0]!.capturedAt.slice(0, 10)} UTC</dd>
              </div>
            </dl>
          </details>
        </div>
      ) : null}
      <details className={styles.rankings}>
        <summary>Detailed {current.label.toLowerCase()} results</summary>
        <div className={styles.tableScroll}>
          <table>
            <caption>
              Same assigned damage and recipients; useful HPS includes consumed absorbs.
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Build</th>
                <th scope="col">Useful HPS</th>
                <th scope="col">Survival</th>
                <th scope="col">Overheal HPS</th>
                <th scope="col">Tier</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.rank}</td>
                  <th scope="row">
                    <button type="button" onClick={(): void => setSelectedId(entry.id)}>
                      {entry.title} · {entry.className}
                    </button>
                  </th>
                  <td>
                    {entry.metrics.hps.toFixed(1)} ± {entry.uncertainty95.toFixed(1)}
                  </td>
                  <td>{(entry.metrics.survivalRate * 100).toFixed(1)}%</td>
                  <td>{entry.metrics.overhealingHps.toFixed(1)}</td>
                  <td>{entry.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
