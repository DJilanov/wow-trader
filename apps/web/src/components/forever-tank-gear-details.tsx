import type { TankTierEntry } from "../lib/forever-tank-tier-list";
import board from "./forever-dps-tier-list.module.css";

const slots = [
  "Head",
  "Neck",
  "Shoulder",
  "Back",
  "Chest",
  "Wrist",
  "Hands",
  "Waist",
  "Legs",
  "Feet",
  "Ring 1",
  "Ring 2",
  "Trinket 1",
  "Trinket 2",
  "Main hand",
  "Off hand",
  "Ranged / relic",
] as const;
interface ForeverTankGearDetailsProps {
  readonly entry: Extract<TankTierEntry, { objective: "threat" | "mitigation" }>;
}
export function ForeverTankGearDetails({ entry }: ForeverTankGearDetailsProps): React.JSX.Element {
  return (
    <details className={board.evidence}>
      <summary>
        {entry.objective === "threat" ? "Threat" : "Mitigation"} gear — every item and enchant
      </summary>
      <p>
        These items were selected together for this objective. Switching the ranking measure also
        switches the measured setup. Historical sources still need Forever availability
        confirmation.
      </p>
      <div className={board.rankings}>
        <div className={board.tableScroll}>
          <table>
            <caption>
              {entry.title} {entry.className}: {entry.objective} setup
            </caption>
            <thead>
              <tr>
                <th scope="col">Slot</th>
                <th scope="col">Item</th>
                <th scope="col">Enchant</th>
              </tr>
            </thead>
            <tbody>
              {entry.gear.map((item) => (
                <tr key={item.slot}>
                  <th scope="row">{slots[item.slot]}</th>
                  <td>
                    {item.id ? (
                      <a href={`https://www.wowhead.com/forever/item=${item.id}`}>{item.name}</a>
                    ) : (
                      "Empty"
                    )}
                    {item.provisionalSource ? (
                      <small>Historical source · unverified in Forever</small>
                    ) : null}
                  </td>
                  <td>{item.enchant ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {entry.warnings.length ? (
        <ul>
          {entry.warnings.map((warning): React.JSX.Element => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <p>
        Conservative enchants are used for rankings. Optional provisional proc variants are
        available in the simulator and require explicit consent.
      </p>
    </details>
  );
}
