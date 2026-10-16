export interface ForeverClassAppearance {
  readonly name: string;
  readonly slug: string;
  readonly color: string;
  readonly icon: string;
}

// Shared with the Encyclopedia so class ordering and colours stay consistent across tools.
export const FOREVER_CLASS_APPEARANCES: readonly ForeverClassAppearance[] = [
  { name: "Warrior", slug: "warrior", color: "#c69b6d", icon: "/wow-assets/classes/warrior.jpg" },
  { name: "Paladin", slug: "paladin", color: "#f48cba", icon: "/wow-assets/classes/paladin.jpg" },
  { name: "Hunter", slug: "hunter", color: "#aad372", icon: "/wow-assets/classes/hunter.jpg" },
  { name: "Rogue", slug: "rogue", color: "#fff468", icon: "/wow-assets/classes/rogue.jpg" },
  { name: "Priest", slug: "priest", color: "#ffffff", icon: "/wow-assets/classes/priest.jpg" },
  { name: "Shaman", slug: "shaman", color: "#0070dd", icon: "/wow-assets/classes/shaman.jpg" },
  { name: "Mage", slug: "mage", color: "#3fc7eb", icon: "/wow-assets/classes/mage.jpg" },
  { name: "Warlock", slug: "warlock", color: "#8788ee", icon: "/wow-assets/classes/warlock.jpg" },
  { name: "Druid", slug: "druid", color: "#ff7c0a", icon: "/wow-assets/classes/druid.jpg" },
];
