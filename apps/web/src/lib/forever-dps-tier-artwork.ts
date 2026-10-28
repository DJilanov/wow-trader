import type { DpsTierEntry } from "./forever-dps-tier-list";

interface BuildArtwork {
  readonly icon: string;
  readonly variant?: string;
}
const builds: Readonly<Record<string, BuildArtwork>> = {
  "two-hand-fury": { icon: "ability_whirlwind" },
  "fury-standard": { icon: "spell_nature_bloodlust" },
  "arms-standard": { icon: "ability_warrior_savageblow" },
  "warlock-ds-ruin-static": { icon: "class_warlock" },
  "warlock-destruction-static": { icon: "spell_fire_firebolt" },
  "paladin-retribution-static": { icon: "class_paladin" },
  "paladin-shockadin-static": { icon: "spell_holy_searinglightpriest" },
  "fury-horde": { icon: "spell_nature_bloodlust" },
  "arms-alliance": { icon: "ability_warrior_savageblow" },
  "two-hand-fury-static": { icon: "ability_whirlwind" },
  "rogue-combat-static": { icon: "ability_warrior_punishingblow" },
  "rogue-mutilate-static": { icon: "ability_rogue_deadlybrew" },
  "rogue-subtlety-static": { icon: "spell_shadow_possession" },
  "hunter-beast-mastery-static": { icon: "ability_druid_ferociousbite" },
  "hunter-marksmanship-static": { icon: "ability_trueshot" },
  "hunter-survival-static": { icon: "ability_hunter_pet_tallstrider" },
  "balance-static": { icon: "spell_nature_forceofnature" },
  "feral-cat-static": { icon: "ability_hunter_pet_cat" },
  "mage-frost-static": { icon: "spell_frost_frostbolt02" },
  "mage-fire-static": { icon: "spell_fire_firebolt" },
  "mage-arcane-static": { icon: "spell_arcane_blast" },
  "warlock-demonology-static": { icon: "spell_shadow_metamorphosis" },
  "warlock-affliction-static": { icon: "spell_shadow_unstableaffliction_2" },
  "priest-shadow-static": { icon: "spell_shadow_shadowform" },
  "priest-smite-static": { icon: "spell_holy_searinglightpriest" },
  "shaman-elemental-static": { icon: "spell_shaman_lavaburst", variant: "Melee-weave" },
  "shaman-stormcaller-static": { icon: "spell_nature_lightningoverload", variant: "Melee-weave" },
  "shaman-enhancement-static": { icon: "ability_shaman_stormstrike" },
};

export function dpsTierArtwork(entry: Pick<DpsTierEntry, "id" | "classSlug">): {
  readonly specIcon: string;
  readonly classIcon: string;
  readonly variant?: string;
} {
  const selected = builds[entry.id];
  const classIcon = `/wow-assets/simulation-icons/class_${entry.classSlug}.jpg`;
  return {
    specIcon: selected ? `/wow-assets/simulation-icons/${selected.icon}.jpg` : classIcon,
    classIcon,
    ...(selected?.variant ? { variant: selected.variant } : {}),
  };
}
