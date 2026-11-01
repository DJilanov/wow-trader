import {
  compositionForecast,
  compositionProfiles,
  compositionMainTank,
  DEFAULT_BOSS_DPS,
  type CompositionCatalog,
  type CompositionDraft,
  type TankIncomingModel,
} from "./forever-raid-composition";

export interface SurvivalSamples {
  readonly iterations: number;
  readonly deaths: number;
  readonly probability: number;
  readonly lower95: number;
  readonly upper95: number;
}
export interface TankSurvivalEstimate {
  readonly tankSeat: number | null;
  readonly bossDps: number;
  readonly incomingDps: number | null;
  readonly health: number | null;
  readonly tankHealingHps: number | null;
  readonly healingPercent: number;
  readonly healingIntervalSeconds: number;
  readonly noHealingSeconds: number | null;
  readonly samples: SurvivalSamples | null;
  readonly unavailableReason: string | null;
}

/** A bounded illustrative model, not a replay of the combat engine's tank timeline. */
export function sampleTankSurvival(input: {
  readonly model: TankIncomingModel;
  readonly rawBossDps: number;
  readonly healingHps: number;
  readonly healingIntervalSeconds: number;
  readonly durationSeconds: number;
}): SurvivalSamples | null {
  const { model, rawBossDps, healingHps, healingIntervalSeconds, durationSeconds } = input;
  if (
    ![
      model.health,
      model.rawDps,
      model.swingSeconds,
      healingIntervalSeconds,
      durationSeconds,
    ].every((value) => Number.isFinite(value) && value > 0) ||
    ![rawBossDps, healingHps].every((value) => Number.isFinite(value) && value >= 0) ||
    durationSeconds > 3600
  )
    return null;
  const probabilities = model.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  if (
    !model.outcomes.length ||
    Math.abs(probabilities - 1) > 1e-8 ||
    model.outcomes.some(
      (outcome) =>
        !Number.isFinite(outcome.probability) ||
        outcome.probability < 0 ||
        !Number.isFinite(outcome.damage) ||
        outcome.damage < 0,
    )
  )
    return null;
  const estimatedEvents =
    Math.ceil(durationSeconds / model.swingSeconds) +
    Math.ceil(durationSeconds / healingIntervalSeconds) +
    2;
  const iterations = Math.min(2048, Math.floor(2_000_000 / estimatedEvents));
  if (iterations < 128) return null;
  const scale = rawBossDps / model.rawDps;
  let deaths = 0;
  for (let trial = 0; trial < iterations; trial += 1) {
    let seed = (0x5f3759df ^ Math.imul(trial + 1, 1664525)) >>> 0;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };
    let health = model.health,
      attackAt = random() * model.swingSeconds,
      healAt = healingIntervalSeconds;
    while (Math.min(attackAt, healAt) <= durationSeconds) {
      if (attackAt <= healAt) {
        const roll = random();
        let cumulative = 0;
        for (const outcome of model.outcomes) {
          cumulative += outcome.probability;
          if (roll <= cumulative) {
            health -= outcome.damage * scale;
            break;
          }
        }
        if (health <= 0) {
          deaths += 1;
          break;
        }
        attackAt += model.swingSeconds;
      } else {
        health = Math.min(model.health, health + healingHps * healingIntervalSeconds);
        healAt += healingIntervalSeconds;
      }
    }
  }
  const probability = deaths / iterations,
    z2 = 1.96 ** 2;
  const denominator = 1 + z2 / iterations;
  const center = (probability + z2 / (2 * iterations)) / denominator;
  const margin =
    (1.96 *
      Math.sqrt((probability * (1 - probability)) / iterations + z2 / (4 * iterations ** 2))) /
    denominator;
  return {
    iterations,
    deaths,
    probability,
    lower95: probability === 0 ? 0 : Math.max(0, center - margin),
    upper95: probability === 1 ? 1 : Math.min(1, center + margin),
  };
}

export function estimateCompositionSurvival(
  draft: CompositionDraft,
  catalog: CompositionCatalog,
): TankSurvivalEstimate {
  const profiles = compositionProfiles(catalog),
    selected = draft.seats.map((seat) => profiles.get(seat.profileId));
  const mainTank = compositionMainTank(draft, catalog);
  const tankSeat = mainTank?.seat ?? null;
  const tank = mainTank?.profile;
  const model = tank?.incoming;
  const bossDps = draft.bossDps ?? DEFAULT_BOSS_DPS[draft.size];
  const healingPercent = draft.tankHealingPercent ?? 50,
    healingIntervalSeconds = draft.healingIntervalSeconds ?? 2;
  const healers = selected.filter((profile) => profile?.role === "healer");
  const tankHealingHps = healers.every((profile) => profile?.tankHealing)
    ? (healers.reduce((sum, profile) => sum + profile!.tankHealing!.hps, 0) * healingPercent) / 100
    : null;
  const incomingDps = model ? (model.dtps * bossDps) / model.rawDps : null;
  const duration = compositionForecast(draft, catalog).killSeconds;
  const samples =
    model && tankHealingHps !== null && duration !== null
      ? sampleTankSurvival({
          model,
          rawBossDps: bossDps,
          healingHps: tankHealingHps,
          healingIntervalSeconds,
          durationSeconds: duration,
        })
      : null;
  const unavailableReason = !model
    ? "Choose a tank with a bound incoming-damage reference."
    : tankHealingHps === null
      ? "Single-target healing evidence is missing for a selected healer."
      : duration === null
        ? "A complete DPS estimate is needed for the fight duration."
        : !samples
          ? "This input is outside the bounded survival model (maximum one-hour fight)."
          : null;
  return {
    tankSeat,
    bossDps,
    incomingDps,
    health: model?.health ?? null,
    tankHealingHps,
    healingPercent,
    healingIntervalSeconds,
    noHealingSeconds:
      model && incomingDps !== null && incomingDps > 0 ? model.health / incomingDps : null,
    samples,
    unavailableReason,
  };
}
