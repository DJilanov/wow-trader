"use client";

import type { Spellbook, SpellDescription, TalentClass } from "@wow-trader/forever-data";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ForeverIcon } from "./forever-icon";

interface ForeverSpellbookProps {
  readonly className: string;
  readonly classData: TalentClass;
  readonly color: string;
  readonly descriptions: Readonly<Record<string, SpellDescription>>;
  readonly icons: Readonly<Record<string, string>>;
  readonly snapshotChecksum: string;
  readonly spellbook: Spellbook;
}

type SpellEntry = Spellbook["general"][number];

interface BookTab {
  readonly name: string;
  readonly icon: string;
  readonly spells: readonly SpellEntry[];
}

interface SelectedSpell {
  readonly entry: SpellEntry;
  readonly anchor: SpellAnchor;
  readonly touch: boolean;
}

interface SpellAnchor {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const SPELLS_PER_PAGE = 12;

export function ForeverSpellbook({
  className,
  classData,
  color,
  descriptions,
  icons,
  snapshotChecksum,
  spellbook,
}: ForeverSpellbookProps): React.JSX.Element {
  const tabs = useMemo<readonly BookTab[]>(
    () => [
      { name: "General", icon: classData.icon, spells: spellbook.general },
      ...spellbook.tabs.map((tab) => ({
        name: tab.name,
        icon:
          classData.trees.find((tree) => tree.name === tab.name.replace(/\s*\(.*\)$/, ""))?.icon ??
          classData.icon,
        spells: tab.spells,
      })),
    ],
    [classData, spellbook],
  );
  const [activeTab, setActiveTab] = useState(Math.min(1, tabs.length - 1));
  const [page, setPage] = useState(0);
  const [turning, setTurning] = useState(false);
  const [selected, setSelected] = useState<SelectedSpell | null>(null);
  const tab = tabs[activeTab] ?? tabs[0];
  const pageCount = tab ? Math.max(1, Math.ceil(tab.spells.length / SPELLS_PER_PAGE)) : 1;
  const visibleSpells = tab?.spells.slice(
    page * SPELLS_PER_PAGE,
    page * SPELLS_PER_PAGE + SPELLS_PER_PAGE,
  );

  function transition(change: () => void): void {
    if (turning) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      change();
      return;
    }
    setTurning(true);
    window.setTimeout(() => {
      change();
      window.setTimeout(() => setTurning(false), 180);
    }, 180);
  }

  function activateSpell(entry: SpellEntry, element: HTMLElement, touch: boolean): void {
    const rectangle = element.getBoundingClientRect();
    setSelected({
      entry,
      touch,
      anchor: {
        top: rectangle.top,
        right: rectangle.right,
        bottom: rectangle.bottom,
        left: rectangle.left,
      },
    });
  }

  return (
    <section
      className="forever-spellbook-section"
      style={{ "--forever-class": color } as React.CSSProperties}
    >
      <header className="forever-section-heading">
        <div>
          <span className="eyebrow">Captured spellbook</span>
          <h2>
            Level {spellbook.level} {spellbook.race} {className}
          </h2>
        </div>
        <p>{spellbook.seen}</p>
      </header>

      <div className="forever-book">
        <div className="forever-book-cover">
          <div className="forever-book-page">
            <span className="forever-book-spine" aria-hidden="true" />
            <div className={`forever-book-face${turning ? " turning" : ""}`}>
              <header>
                <h3>{tab?.name ?? "Spellbook"}</h3>
                <span>{tab?.spells.length ?? 0} observed spells</span>
              </header>
              <ol className="forever-spell-grid">
                {visibleSpells?.map((entry, index) => {
                  const [name, rank] = entry;
                  const trainingLevels = spellbook.levels?.[name];
                  const icon = icons[name] ?? classData.icon;
                  return (
                    <li key={`${name}:${rank}:${index}`}>
                      <button
                        onBlur={() => setSelected(null)}
                        onClick={(event) =>
                          activateSpell(
                            entry,
                            event.currentTarget,
                            window.matchMedia("(hover: none)").matches,
                          )
                        }
                        onFocus={(event) => activateSpell(entry, event.currentTarget, false)}
                        onMouseEnter={(event) => activateSpell(entry, event.currentTarget, false)}
                        onMouseLeave={() => setSelected(null)}
                        type="button"
                      >
                        <span className="forever-spell-icon-frame">
                          <ForeverIcon alt="" iconKey={icon} snapshotChecksum={snapshotChecksum} />
                        </span>
                        <span className="forever-spell-copy">
                          <strong>{name}</strong>
                          <small>{rank || "Ability"}</small>
                          {trainingLevels ? (
                            <span className="forever-training-levels" aria-label="Training levels">
                              {trainingLevels.map((trainingLevel, rankIndex) => (
                                <i
                                  className={
                                    rank === `Rank ${rankIndex + 1}` ? "current" : undefined
                                  }
                                  key={`${name}:${rankIndex}`}
                                >
                                  {trainingLevel ?? "?"}
                                </i>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <footer className="forever-book-pagination">
                <button
                  disabled={page === 0}
                  onClick={() => transition(() => setPage((value) => value - 1))}
                  type="button"
                >
                  ← Previous
                </button>
                <span>
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  disabled={page >= pageCount - 1}
                  onClick={() => transition(() => setPage((value) => value + 1))}
                  type="button"
                >
                  Next →
                </button>
              </footer>
            </div>
          </div>

          <div className="forever-book-tabs" role="tablist" aria-label={`${className} spell tabs`}>
            {tabs.map((candidate, index) => (
              <button
                aria-selected={index === activeTab}
                className={index === activeTab ? "active" : undefined}
                key={candidate.name}
                onClick={() =>
                  transition(() => {
                    setActiveTab(index);
                    setPage(0);
                    setSelected(null);
                  })
                }
                role="tab"
                type="button"
              >
                <ForeverIcon alt="" iconKey={candidate.icon} snapshotChecksum={snapshotChecksum} />
                <span>{candidate.name.replace(/\s*\(.*\)$/, "")}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {spellbook.notes.length > 0 ? (
        <details className="forever-spellbook-notes">
          <summary>Captured spellbook notes and known gaps</summary>
          <ul>
            {spellbook.notes.map((note) => (
              <li key={note}>{plainText(note)}</li>
            ))}
          </ul>
          {spellbook.missing.length > 0 ? (
            <p>Missing tabs: {spellbook.missing.join(", ")}.</p>
          ) : null}
        </details>
      ) : null}

      {selected && typeof document !== "undefined"
        ? createPortal(
            <SpellPanel
              className={className}
              descriptions={descriptions}
              onClose={() => setSelected(null)}
              selected={selected}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

function SpellPanel({
  className,
  descriptions,
  onClose,
  selected,
}: {
  readonly className: string;
  readonly descriptions: Readonly<Record<string, SpellDescription>>;
  readonly onClose: () => void;
  readonly selected: SelectedSpell;
}): React.JSX.Element {
  const [name, rank] = selected.entry;
  const description = descriptions[`${className}|${name}|${rank}`];
  const position = spellPanelPosition(selected.anchor);
  return (
    <aside
      aria-label={`${name} details`}
      className={`forever-spell-panel${selected.touch ? " forever-spell-sheet" : ""}`}
      style={selected.touch ? undefined : position}
    >
      <header>
        <strong>{name}</strong>
        <span>{rank}</span>
        {selected.touch ? (
          <button aria-label="Close spell details" onClick={onClose} type="button">
            ×
          </button>
        ) : null}
      </header>
      {description ? (
        <>
          <div className="forever-spell-facts">
            {description.l.map(([left, right], index) => (
              <p key={`${left}:${right}:${index}`}>
                <span>{left}</span>
                <span>{right}</span>
              </p>
            ))}
          </div>
          {description.d ? <p className="forever-spell-description">{description.d}</p> : null}
          {description.cs && description.cs !== "same" ? (
            <div className="forever-spell-classic">
              <strong>
                {description.cs === "new" ? "New in Forever" : "Changed from Classic"}
              </strong>
              {description.cd ? <p>{description.cd}</p> : null}
            </div>
          ) : null}
          <span
            className={`forever-evidence ${description.s === "demo" ? "demo_transcribed" : "classic_fallback"}`}
          >
            {description.s === "demo"
              ? "Observed in Forever demo footage"
              : "Classic fallback — not yet observed in Forever"}
          </span>
          {description.src ? (
            <small className="forever-spell-source">{description.src}</small>
          ) : null}
        </>
      ) : (
        <p className="forever-spell-missing">No tooltip was captured for this spell.</p>
      )}
    </aside>
  );
}

function spellPanelPosition(anchor: SpellAnchor): React.CSSProperties {
  const width = 330;
  const gap = 12;
  const left =
    anchor.right + width + gap <= window.innerWidth
      ? anchor.right + gap
      : Math.max(8, anchor.left - width - gap);
  const top = Math.min(Math.max(8, anchor.top - 30), Math.max(8, window.innerHeight - 430));
  return { left, top, width };
}

function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
