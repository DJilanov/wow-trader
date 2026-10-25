import type { HealerItem } from "@wow-trader/forever-data/healing-simulator";

export function HealerItemStats({ item }: { readonly item: HealerItem }): React.JSX.Element {
  return (
    <section className="wow-tooltip" aria-label={item.name + " modeled item stats"}>
      <p className={"wow-tooltip-name quality-text-" + item.quality}>{item.name}</p>
      {item.itemLevel > 0 ? <p className="wow-tooltip-muted">Item level {item.itemLevel}</p> : null}
      {item.twoHanded ? <p>Two-handed</p> : null}
      {item.stats.map((stat) => (
        <p key={stat.label}>
          +{Number(stat.value.toFixed(2))} {stat.label}
        </p>
      ))}
      {item.effectLines.map((line) => (
        <p className="wow-tooltip-effect" key={line}>
          {line}
        </p>
      ))}
      <p className="wow-tooltip-muted">{item.sourceLabel}</p>
      {item.historicalSource ? (
        <p className="wow-tooltip-muted">Forever availability remains provisional.</p>
      ) : null}
    </section>
  );
}
