import Link from "next/link";

type ForeverEncyclopediaSection =
  | "abilities"
  | "bosses"
  | "catalog"
  | "changes"
  | "home"
  | "instances"
  | "legacy"
  | "leveling"
  | "maps"
  | "quests"
  | "racials"
  | "spellbooks"
  | "talents"
  | "zones";

interface ForeverEncyclopediaNavProps {
  readonly active: ForeverEncyclopediaSection;
  readonly classSlug?: string;
}

type NavigationGroup = "catalog" | "character" | "changes" | "leveling" | "overview" | "world";

const groupLinks: readonly {
  readonly key: NavigationGroup;
  readonly label: string;
  readonly href: string;
}[] = [
  { key: "overview", label: "Overview", href: "/forever/encyclopedia" },
  { key: "catalog", label: "Items & recipes", href: "/forever/encyclopedia/catalog" },
  { key: "character", label: "Character", href: "/forever/encyclopedia/talents/warrior" },
  { key: "world", label: "World", href: "/forever/encyclopedia/maps" },
  { key: "leveling", label: "Leveling ↗", href: "/forever/leveling" },
  { key: "changes", label: "Changes", href: "/forever/encyclopedia/changes" },
];

const characterLinks = [
  ["talents", "Talent trees", "/forever/encyclopedia/talents/warrior"],
  ["spellbooks", "Spellbooks", "/forever/encyclopedia/spellbooks/warrior"],
  ["racials", "Racials", "/forever/encyclopedia/racials"],
  ["abilities", "Class abilities", "/forever/encyclopedia/abilities"],
  ["legacy", "Legacy", "/forever/encyclopedia/legacy"],
  ["simulator", "Simulator ↗", "/forever/simulator"],
] as const;

const worldLinks = [
  ["maps", "Maps", "/forever/encyclopedia/maps"],
  ["instances", "Instances", "/forever/encyclopedia/instances"],
  ["bosses", "Bosses", "/forever/encyclopedia/bosses"],
  ["quests", "Quests", "/forever/encyclopedia/quests"],
] as const;

export function ForeverEncyclopediaNav({
  active,
  classSlug,
}: ForeverEncyclopediaNavProps): React.JSX.Element {
  const activeGroup = getNavigationGroup(active);
  const secondaryLinks = activeGroup === "character" ? characterLinks : worldLinks;

  return (
    <nav className="forever-encyclopedia-nav" aria-label="Forever Encyclopedia sections">
      <div className="forever-nav-primary">
        {groupLinks.map((link) => (
          <Link
            className={activeGroup === link.key ? "active" : undefined}
            href={link.href}
            key={link.key}
          >
            {link.label}
          </Link>
        ))}
      </div>
      {activeGroup === "character" || activeGroup === "world" ? (
        <div className="forever-nav-secondary" aria-label={`${activeGroup} collections`}>
          {secondaryLinks.map(([key, label, defaultHref]) => {
            const href =
              classSlug && key === "talents"
                ? `/forever/encyclopedia/talents/${classSlug}`
                : classSlug && key === "spellbooks"
                  ? `/forever/encyclopedia/spellbooks/${classSlug}`
                  : defaultHref;
            const isActive = active === key || (active === "zones" && key === "maps");
            return (
              <Link className={isActive ? "active" : undefined} href={href} key={key}>
                {label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}

function getNavigationGroup(section: ForeverEncyclopediaSection): NavigationGroup {
  if (section === "home") return "overview";
  if (section === "catalog") return "catalog";
  if (section === "changes") return "changes";
  if (section === "leveling") return "leveling";
  if (["abilities", "legacy", "racials", "spellbooks", "talents"].includes(section)) {
    return "character";
  }
  return "world";
}
