import type { TankTierEntry } from "../lib/forever-tank-tier-list";
import { TANK_MODEL_NOTES } from "../lib/forever-tank-model-notes";
import styles from "./forever-dps-tier-list.module.css";

interface ForeverTankThreatDetailsProps {
  readonly entry: TankTierEntry;
}
export function ForeverTankThreatDetails({
  entry,
}: ForeverTankThreatDetailsProps): React.JSX.Element {
  const note = TANK_MODEL_NOTES[entry.profile];
  return (
    <details className={styles.evidence}>
      <summary>How this build generates threat</summary>
      <p>{note.explanation}</p>
      <p>
        <strong>Model limits:</strong> {note.limitation}
      </p>
      <div className={styles.rankings}>
        <div className={styles.tableScroll}>
          <table>
            <caption>
              Measured action averages in this simulation. Damage and threat columns sum to the
              build totals.
            </caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">DPS</th>
                <th scope="col">TPS</th>
                <th scope="col">Threat / damage</th>
              </tr>
            </thead>
            <tbody>
              {entry.threatBreakdown.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.name}</th>
                  <td>{row.damagePerSecond.toFixed(1)}</td>
                  <td>{row.threatPerSecond.toFixed(1)}</td>
                  <td>
                    {row.damagePerSecond > 0
                      ? `${(row.threatPerSecond / row.damagePerSecond).toFixed(3)}×`
                      : "Threat without damage"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{entry.metrics.dps.avg.toFixed(1)}</td>
                <td>{entry.metrics.threat.avg.toFixed(1)}</td>
                <td>{(entry.metrics.threat.avg / entry.metrics.dps.avg).toFixed(3)}×</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <a href={note.source}>Inspect the pinned threat implementation ↗</a>
    </details>
  );
}
