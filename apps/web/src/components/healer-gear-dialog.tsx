"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { HealerItem, HealerLibrary } from "@wow-trader/forever-data/healing-simulator";
import { HealerIcon } from "./healer-icon";
import { HealerItemStats } from "./healer-item-stats";
import style from "./healer-simulator-workspace.module.css";

interface HealerGearDialogProps {
  readonly library: Pick<HealerLibrary, "items">;
  readonly slot: number;
  readonly slotName: string;
  readonly currentId: number;
  readonly faction: "Alliance" | "Horde";
  readonly onSelect: (itemId: number) => void;
  readonly onClose: () => void;
}
export function HealerGearDialog({
  library,
  slot,
  slotName,
  currentId,
  faction,
  onSelect,
  onClose,
}: HealerGearDialogProps): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null),
    titleId = useId();
  const [query, setQuery] = useState(""),
    [preview, setPreview] = useState(currentId);
  const choices = library.items.filter(
    (item) =>
      item.slots.includes(slot) &&
      (!item.faction || item.faction === faction) &&
      item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
  );
  const inspected = library.items.find((item) => item.id === preview);
  useEffect((): (() => void) => {
    const element = dialog.current!,
      previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    search.current?.focus();
    return (): void => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  function summary(item: HealerItem): string {
    return item.stats
      .filter((stat) =>
        /healing|spell power|intellect|spirit|mana per|spell crit/i.test(stat.label),
      )
      .slice(0, 3)
      .map((stat) => "+" + Number(stat.value.toFixed(2)) + " " + stat.label)
      .join(" · ");
  }
  return (
    <dialog
      ref={dialog}
      className={style.dialog}
      aria-labelledby={titleId}
      onCancel={(event): void => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event): void => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={style.dialogPanel}>
        <header className={style.dialogHeader}>
          <div>
            <span className="eyebrow">Pre-raid equipment</span>
            <h2 id={titleId}>Choose {slotName.toLowerCase()}</h2>
          </div>
          <button
            type="button"
            className={style.close}
            aria-label="Close item selection"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <label className={style.search}>
          Search items
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event): void => setQuery(event.currentTarget.value)}
            placeholder="Search by item name…"
          />
        </label>
        <div className={style.dialogBody}>
          <div className={style.itemChoices} aria-label={slotName + " items"}>
            {slot === 15 ? (
              <button type="button" className={style.itemChoice} onClick={(): void => onSelect(0)}>
                Leave off hand empty
              </button>
            ) : null}
            {choices.map((item) => (
              <button
                type="button"
                className={style.itemChoice}
                key={item.id}
                aria-pressed={currentId === item.id}
                onFocus={(): void => setPreview(item.id)}
                onMouseEnter={(): void => setPreview(item.id)}
                onClick={(): void => onSelect(item.id)}
              >
                <span className={style.itemIcon}>
                  <HealerIcon name={item.icon} />
                </span>
                <span>
                  <strong className={"quality-text-" + item.quality}>{item.name}</strong>
                  <small>{summary(item) || item.sourceLabel}</small>
                </span>
                <span aria-hidden="true">{currentId === item.id ? "✓" : "+"}</span>
              </button>
            ))}
            {!choices.length ? (
              <p className={style.empty}>
                No eligible {slotName.toLowerCase()} items match this name.
              </p>
            ) : null}
          </div>
          <aside className={style.itemPreview} aria-label="Item preview">
            {inspected ? (
              <>
                <HealerItemStats item={inspected} />
                <a
                  href={"https://www.wowhead.com/forever/item=" + inspected.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Wowhead ↗
                </a>
              </>
            ) : (
              <p>Focus or hover an item to inspect its stats.</p>
            )}
          </aside>
        </div>
        <p className={style.dialogFootnote}>
          {choices.length} eligible choices · Rank 14 PvP is allowed · Engineering and Tailoring
        </p>
      </div>
    </dialog>
  );
}
