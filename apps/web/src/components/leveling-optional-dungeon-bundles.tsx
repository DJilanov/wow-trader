"use client";

import {
  GUARANTEED_DUNGEON_IDS,
  PREMADE_STOPS,
  getDungeonBundle,
  type DungeonBundle,
  type PremadeProgress,
  type QuestRewardFact,
} from "@wow-trader/leveling";
import { LevelingDungeonBundle } from "./leveling-dungeon-bundle";

interface OptionalDungeonBundlesProps {
  readonly progress: PremadeProgress;
  readonly disabled: boolean;
  readonly rewardFacts: readonly QuestRewardFact[];
  readonly onChange: (bundle: DungeonBundle) => void;
}

export function LevelingOptionalDungeonBundles({
  progress,
  disabled,
  rewardFacts,
  onChange,
}: OptionalDungeonBundlesProps): React.JSX.Element {
  return (
    <details>
      <summary>Optional new dungeons · include, skip or adjust quest slots</summary>
      <p>
        All four slots are selected by default. Excluding a dungeon removes its planned rewards and
        entry target, not your saved quest history. Re-enable it here at any time.
      </p>
      {GUARANTEED_DUNGEON_IDS.filter(
        (id) => PREMADE_STOPS.find((stop) => stop.id === id)?.dataStatus === "guaranteed-bundle",
      ).map((id) => (
        <LevelingDungeonBundle
          key={id}
          bundle={getDungeonBundle(id, "alliance", progress.guaranteedBundles)!}
          dungeonName={PREMADE_STOPS.find((stop) => stop.id === id)!.name}
          disabled={disabled}
          rewardFacts={rewardFacts}
          onChange={onChange}
        />
      ))}
    </details>
  );
}
