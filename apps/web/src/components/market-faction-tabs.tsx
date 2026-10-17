import Link from "next/link";

import type { MarketFaction } from "../lib/market-selection";

export function MarketFactionTabs({
  selected,
  links,
}: {
  readonly selected: string | undefined;
  readonly links: Readonly<Record<MarketFaction, string>>;
}): React.JSX.Element {
  return (
    <nav className="market-faction-tabs" aria-label="Auction House faction">
      {(["alliance", "horde"] as const).map((faction) => (
        <Link
          key={faction}
          href={links[faction]}
          className={faction}
          aria-current={selected === faction ? "page" : undefined}
          prefetch={false}
        >
          {faction === "alliance" ? "Alliance" : "Horde"}
        </Link>
      ))}
    </nav>
  );
}
