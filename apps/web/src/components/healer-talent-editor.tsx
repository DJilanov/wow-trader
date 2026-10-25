"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  healerTalentProblem,
  type HealerTalentTree,
} from "@wow-trader/forever-data/healing-simulator";
import { HealerIcon } from "./healer-icon";
import { withHelperBasePath } from "../lib/site-path";
import style from "./healer-simulator-workspace.module.css";

interface HealerTalentEditorProps {
  readonly trees: readonly HealerTalentTree[];
  readonly fields: Readonly<Record<string, number>>;
  readonly onChange: (fields: Record<string, number>) => void;
}
interface ActiveTalent {
  readonly tree: number;
  readonly field: string;
  readonly left: number;
  readonly top: number;
  readonly touch: boolean;
}
export function HealerTalentEditor({
  trees,
  fields,
  onChange,
}: HealerTalentEditorProps): React.JSX.Element {
  const [active, setActive] = useState<ActiveTalent | null>(null),
    [message, setMessage] = useState(
      "Click to learn; right-click or press Delete to remove a rank.",
    );
  const [mounted, setMounted] = useState(false),
    popupId = useId();
  useEffect((): (() => void) => {
    setMounted(true);
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", close);
    return (): void => window.removeEventListener("keydown", close);
  }, []);
  const selected = active
    ? trees[active.tree]?.talents.find((talent) => talent.field === active.field)
    : undefined;
  const total = Object.values(fields).reduce((sum, points) => sum + points, 0);
  function update(field: string, delta: number): void {
    const candidate = { ...fields, [field]: (fields[field] ?? 0) + delta },
      problem = healerTalentProblem(trees, candidate, false);
    if (problem) {
      setMessage(problem);
      return;
    }
    onChange(candidate);
    setMessage(
      (trees.flatMap((tree) => tree.talents).find((talent) => talent.field === field)?.name ??
        field) +
        " is now rank " +
        candidate[field] +
        ".",
    );
  }
  return (
    <section className={style.talents} aria-labelledby="healer-talents-heading">
      <header className={style.sectionHeading}>
        <div>
          <span className="eyebrow">Talent build</span>
          <h2 id="healer-talents-heading">Shape your healing</h2>
        </div>
        <span className={style.chip}>{total} / 51 points</span>
      </header>
      <p className={style.helper} aria-live="polite">
        {message}
      </p>
      <div className="forever-trees">
        {trees.map((tree, treeIndex) => {
          const points = tree.talents.reduce((sum, talent) => sum + (fields[talent.field] ?? 0), 0),
            rows = Math.max(...tree.talents.map((talent) => talent.row)) + 1;
          return (
            <article className="forever-tree" key={tree.name}>
              <header>
                <strong>{tree.name}</strong>
                <small>{points} points</small>
              </header>
              <div
                className="forever-tree-body"
                style={{
                  backgroundImage:
                    'linear-gradient(180deg,rgba(3,3,7,.25),rgba(3,3,7,.8)),url("' +
                    withHelperBasePath(
                      "/wow-assets/healer-talent-backgrounds/" + tree.background + ".jpg",
                    ) +
                    '")',
                }}
              >
                <div
                  className="forever-talent-grid"
                  style={{ gridTemplateRows: "repeat(" + rows + ",76px)" }}
                >
                  {tree.talents.map((talent) => {
                    const rank = fields[talent.field] ?? 0,
                      problem = healerTalentProblem(
                        trees,
                        { ...fields, [talent.field]: rank + 1 },
                        false,
                      ),
                      state =
                        rank === talent.max
                          ? "maxed"
                          : rank > 0
                            ? "partial"
                            : problem
                              ? "locked"
                              : "available";
                    function show(element: HTMLButtonElement, touch: boolean): void {
                      const rect = element.getBoundingClientRect();
                      setActive({
                        tree: treeIndex,
                        field: talent.field,
                        left: Math.max(12, Math.min(window.innerWidth - 352, rect.right + 10)),
                        top: Math.max(12, Math.min(window.innerHeight - 280, rect.top)),
                        touch,
                      });
                    }
                    return (
                      <button
                        type="button"
                        key={talent.field}
                        className={"forever-talent-node " + state}
                        aria-label={talent.name + ", rank " + rank + " of " + talent.max}
                        aria-describedby={active?.field === talent.field ? popupId : undefined}
                        style={{ gridColumn: talent.column + 1, gridRow: talent.row + 1 }}
                        onClick={(event): void => {
                          if (window.matchMedia("(hover: none)").matches)
                            show(event.currentTarget, true);
                          else update(talent.field, 1);
                        }}
                        onContextMenu={(event): void => {
                          event.preventDefault();
                          update(talent.field, -1);
                        }}
                        onKeyDown={(event): void => {
                          if (event.key === "Delete" || event.key === "Backspace") {
                            event.preventDefault();
                            update(talent.field, -1);
                          }
                        }}
                        onFocus={(event): void => show(event.currentTarget, false)}
                        onBlur={(): void => setActive((value) => (value?.touch ? value : null))}
                        onMouseEnter={(event): void => {
                          if (window.matchMedia("(hover: hover)").matches)
                            show(event.currentTarget, false);
                        }}
                        onMouseLeave={(): void =>
                          setActive((value) => (value?.touch ? value : null))
                        }
                      >
                        <HealerIcon name={talent.icon} />
                        <span className="forever-talent-rank">
                          {rank}/{talent.max}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {mounted && active && selected
        ? createPortal(
            <section
              id={popupId}
              role={active.touch ? "dialog" : "tooltip"}
              aria-label={selected.name}
              className={style.talentPopup}
              style={{
                left: active.touch ? 12 : active.left,
                top: active.touch ? undefined : active.top,
                bottom: active.touch ? 12 : undefined,
              }}
            >
              <strong>{selected.name}</strong>
              <small>
                Rank {fields[selected.field] ?? 0} / {selected.max}
              </small>
              <p>
                {selected.descriptions[Math.max(0, (fields[selected.field] ?? 0) - 1)] ??
                  selected.descriptions[0]}
              </p>
              {selected.prerequisite ? (
                <small>
                  Requires{" "}
                  {
                    trees[active.tree]?.talents.find(
                      (talent) => talent.field === selected.prerequisite,
                    )?.name
                  }
                </small>
              ) : null}
              {active.touch ? (
                <div>
                  <button type="button" onClick={(): void => update(selected.field, 1)}>
                    Learn rank
                  </button>
                  <button type="button" onClick={(): void => update(selected.field, -1)}>
                    Remove rank
                  </button>
                  <button type="button" onClick={(): void => setActive(null)}>
                    Close
                  </button>
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
    </section>
  );
}
