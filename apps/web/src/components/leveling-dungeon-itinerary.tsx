import {
  dungeonItineraryStages,
  getDungeonQuest,
  itineraryQuestTitle,
  type CharacterProfile,
  type DungeonRouteOption,
  type PersonalDungeonPlan,
} from "@wow-trader/leveling";
import styles from "./leveling-dungeon-options.module.css";

export function LevelingDungeonItinerary({
  option,
  profile,
  plan,
}: {
  readonly option: DungeonRouteOption;
  readonly profile: CharacterProfile;
  readonly plan: PersonalDungeonPlan;
}): React.JSX.Element {
  return (
    <ol className={styles.itinerary} aria-label={`${option.visit.name} quest itinerary`}>
      {dungeonItineraryStages(option, profile, plan).map((stage) => (
        <li key={stage.id}>
          <strong>{stage.title}</strong>
          <p>{stage.description}</p>
          {stage.questIds.length > 0 && (
            <ul>
              {stage.questIds.map((id) => {
                const quest = getDungeonQuest(id)!;
                return (
                  <li key={id}>
                    <a
                      href={`https://www.wowhead.com/forever/quest=${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {itineraryQuestTitle(id)} ↗
                    </a>
                    <small>
                      {stage.id === "prepare"
                        ? `${quest.pickup}${option.questIds.includes(id) ? "" : ` · ${quest.objective} · ${quest.turnin}`}`
                        : stage.id === "clear"
                          ? quest.objective
                          : quest.turnin}
                    </small>
                    {plan.questStates[String(id)] === "rewarded" && (
                      <small>Already rewarded · no XP counted again</small>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
