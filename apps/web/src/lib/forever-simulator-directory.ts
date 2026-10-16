import { SIMULATOR_SPECS, type SimulatorSpec } from "@wow-trader/forever-data/simulator";
import { FOREVER_CLASS_APPEARANCES, type ForeverClassAppearance } from "./forever-classes";

export interface SimulatorClassEntry extends ForeverClassAppearance {
  readonly profiles: readonly SimulatorSpec[];
  readonly description: string;
  readonly href: string;
}

const multiBuildDescriptions: Readonly<Record<string, string>> = {
  Hunter: "Beast Mastery · Marksmanship · Survival",
  Rogue: "Assassination · Combat · Subtlety",
  Mage: "Arcane · Fire · Frost",
  Warlock: "Affliction · Demonology · Destruction",
};

export function getSimulatorClassDirectory(): readonly SimulatorClassEntry[] {
  return FOREVER_CLASS_APPEARANCES.flatMap((appearance) => {
    const profiles = SIMULATOR_SPECS.filter((spec) => spec.className === appearance.name);
    if (!profiles.length) return [];
    return [
      {
        ...appearance,
        profiles,
        description:
          multiBuildDescriptions[appearance.name] ??
          profiles.map((profile) => profile.name).join(" · "),
        href:
          profiles.length === 1
            ? `/forever/simulator/${profiles[0]!.slug}`
            : `/forever/simulator?class=${appearance.slug}#simulator-profiles`,
      },
    ];
  });
}

export function getSimulatorClass(slug: string | undefined): SimulatorClassEntry | null {
  return getSimulatorClassDirectory().find((entry) => entry.slug === slug) ?? null;
}
