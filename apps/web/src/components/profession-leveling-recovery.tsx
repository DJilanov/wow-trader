"use client";

import { useState } from "react";
import { copperToGold, goldToCopper } from "../lib/profession-leveling-settings";
import type { ProfessionLevelingOptions } from "../lib/profession-leveling-types";
import styles from "./profession-leveling.module.css";

export function ProfessionLevelingRecovery({
  options,
  onChange,
}: {
  readonly options: ProfessionLevelingOptions;
  readonly onChange: (options: ProfessionLevelingOptions) => void;
}): React.JSX.Element {
  const [feeInput, setFeeInput] = useState<string | null>(null);
  return (
    <div className={styles.recoveryControls}>
      <label>
        Value of crafted items
        <select
          value={options.recoveryMode ?? "vendor"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "none" || value === "vendor" || value === "best")
              onChange({ ...options, recoveryMode: value });
          }}
        >
          <option value="vendor">Deduct vendor returns</option>
          <option value="best">Best of vendor / disenchant · estimated</option>
          <option value="none">Do not deduct returns</option>
        </select>
      </label>
      {options.recoveryMode === "best" ? (
        <div className={styles.fields}>
          <label>
            Who disenchants?
            <select
              value={options.disenchantAccess ?? "other"}
              onChange={(event) =>
                onChange({
                  ...options,
                  disenchantAccess: event.target.value === "self" ? "self" : "other",
                })
              }
            >
              <option value="other">Alt or another player · tradeable items</option>
              <option value="self">This character · includes bound items</option>
            </select>
          </label>
          <label>
            Available Enchanting skill
            <input
              type="number"
              min={1}
              max={300}
              required
              value={options.enchantingSkill ?? 1}
              onChange={(event) =>
                onChange({ ...options, enchantingSkill: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Disenchant fee per item (gold)
            <input
              type="text"
              inputMode="decimal"
              required
              value={feeInput ?? copperToGold(options.disenchantFeeCopper ?? "0")}
              onChange={(event) => {
                setFeeInput(event.target.value);
                const fee = goldToCopper(event.target.value);
                event.target.setCustomValidity(
                  fee === null ? "Enter a gold amount with up to four decimal places." : "",
                );
                if (fee !== null) onChange({ ...options, disenchantFeeCopper: fee });
              }}
            />
          </label>
        </div>
      ) : null}
      <p className={styles.note}>
        Only leftover crafted items count. Materials reused in later crafts are kept. Disenchant
        returns use Classic yield estimates and this market’s material prices after AH cut; missing
        prices or unsupported items fall back to vendor value. Sales are not guaranteed.
      </p>
    </div>
  );
}
