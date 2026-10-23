import type { TankTierMeasurement } from "./forever-tank-tier-list";

interface TankModelNote {
  readonly explanation: string;
  readonly limitation: string;
  readonly source: string;
}
const pinnedSource =
  "https://github.com/gunba/wow-forever-sim/blob/9a27c3d6af91d1ca0dbcf94a124b8869ad522108/sim";
export const TANK_MODEL_NOTES: Readonly<Record<TankTierMeasurement["profile"], TankModelNote>> = {
  tank_warrior: {
    explanation:
      "This starter's Defensive Stance and Defiance give a ×1.495 baseline threat modifier. Revenge, Shield Slam, Sunder Armor and other actions have their own threat rules, including threat without damage.",
    limitation:
      "Incoming rage and some fixed threat amounts remain model assumptions. Gear, rotation and incoming attacks affect how often abilities can be used.",
    source: `${pinnedSource}/warrior/stances.go`,
  },
  feral_tank_druid: {
    explanation:
      "Feral Instinct increases Swipe damage, not Bear threat. The model combines Bear Form's ×1.5 with ability modifiers: Primal Bite ×3, Lacerate ×3.33, Maul ×1.75 and Swipe ×2. The resulting threat per damage can exceed the Warrior's without a threat talent.",
    limitation:
      "Primal Bite's absolute ×3 coefficient is inherited and unverified; the source applies a documented relative increase to an assumed starting value. Swipe's ×2 also comes from an inherited reference. These explain the model's output, not confirmed server coefficients.",
    source: `${pinnedSource}/druid/mangle.go`,
  },
  protection_paladin: {
    explanation:
      "Righteous Fury is enabled and multiplies Holy threat by ×1.9. Physical weapon damage does not receive that multiplier. Holy Shield and some other spells have additional modifiers. This published starter uses Seal of Righteousness; its exact import preserves that choice.",
    limitation:
      "The engine also registers Seal of Fury, but registration alone does not validate all shield, mana and timing assumptions. The current starter is compared as configured, without claiming an optimized seal or talent build.",
    source: `${pinnedSource}/paladin/righteous_fury.go`,
  },
};
