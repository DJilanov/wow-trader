"use client";

import {
  canRemoveTalentRank,
  createTalentKey,
  getAddBlockReason,
  getTalentRankText,
  isAllocationValid,
  summarizeAllocation,
  type Talent,
  type TalentAllocation,
  type TalentClass,
  type TalentTree,
} from "@wow-trader/forever-data";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { ForeverIcon } from "./forever-icon";

interface ForeverTalentCalculatorProps {
  readonly className: string;
  readonly classSlug: string;
  readonly color: string;
  readonly classData: TalentClass;
  readonly snapshotChecksum: string;
  readonly initialBuild?: string;
}

interface ActiveTalent {
  readonly treeIndex: number;
  readonly talentIndex: number;
  readonly anchor: AnchorRect;
  readonly touch: boolean;
}

interface AnchorRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface SavedBuild {
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;
  readonly level: number;
  readonly allocation: TalentAllocation;
}

interface BuildPayload {
  readonly version: 1;
  readonly snapshot: string;
  readonly level: number;
  readonly points: readonly (readonly [string, number])[];
}

export function ForeverTalentCalculator({
  className,
  classSlug,
  color,
  classData,
  snapshotChecksum,
  initialBuild,
}: ForeverTalentCalculatorProps): React.JSX.Element {
  const [level, setLevel] = useState(60);
  const [allocation, setAllocation] = useState<TalentAllocation>({});
  const [compare, setCompare] = useState(false);
  const [showEstimates, setShowEstimates] = useState(false);
  const [activeTalent, setActiveTalent] = useState<ActiveTalent | null>(null);
  const [message, setMessage] = useState("Choose a talent to begin your build.");
  const [saveName, setSaveName] = useState("");
  const [savedBuilds, setSavedBuilds] = useState<readonly SavedBuild[]>([]);
  const [mounted, setMounted] = useState(false);
  const storageKey = `kfc-forever-builds:${snapshotChecksum}:${classSlug}`;
  const summary = summarizeAllocation(classData, className, level, allocation);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setSavedBuilds(parseSavedBuilds(stored));
    } catch {
      setMessage("Saved builds are unavailable in this browser.");
    }
  }, [storageKey]);

  useEffect(() => {
    if (!initialBuild) return;
    try {
      const decoded = decodeBuild(initialBuild);
      if (decoded.snapshot !== snapshotChecksum) {
        setMessage("This link belongs to another data snapshot and cannot be silently migrated.");
        return;
      }
      const candidate = Object.fromEntries(decoded.points);
      if (!isAllocationValid(classData, className, decoded.level, candidate)) {
        setMessage("The shared build is not valid for this snapshot.");
        return;
      }
      setLevel(decoded.level);
      setAllocation(candidate);
      setMessage("Shared build loaded from its exact source snapshot.");
    } catch {
      setMessage("The shared build link is malformed or incomplete.");
    }
  }, [classData, className, initialBuild, snapshotChecksum]);

  const treeNames = classData.trees.map(({ name }) => name);
  const distribution = summary.treePoints.join(" / ");

  function addRank(treeIndex: number, talent: Talent): void {
    const tree = classData.trees[treeIndex];
    if (!tree) return;
    const reason = getAddBlockReason(classData, className, treeIndex, talent, level, allocation);
    if (reason) {
      setMessage(reason);
      return;
    }
    const key = createTalentKey(className, tree.name, talent.name);
    const nextRank = (allocation[key] ?? 0) + 1;
    setAllocation({ ...allocation, [key]: nextRank });
    setMessage(`${talent.name} is now rank ${nextRank} of ${talent.max}.`);
  }

  function removeRank(treeIndex: number, talent: Talent): void {
    const tree = classData.trees[treeIndex];
    if (!tree) return;
    const key = createTalentKey(className, tree.name, talent.name);
    const current = allocation[key] ?? 0;
    if (current === 0) {
      setMessage(`${talent.name} has no learned ranks.`);
      return;
    }
    if (!canRemoveTalentRank(classData, className, treeIndex, talent, level, allocation)) {
      setMessage(`${talent.name} is required by another learned talent or tier.`);
      return;
    }
    const next = { ...allocation, [key]: current - 1 };
    if (next[key] === 0) delete next[key];
    setAllocation(next);
    setMessage(`${talent.name} is now rank ${current - 1} of ${talent.max}.`);
  }

  function resetTree(tree: TalentTree): void {
    const next = { ...allocation };
    for (const talent of tree.talents) {
      delete next[createTalentKey(className, tree.name, talent.name)];
    }
    setAllocation(next);
    setMessage(`${tree.name} was reset.`);
  }

  function changeLevel(nextLevel: number): void {
    const minimumLevel = Math.max(10, summary.requiredLevel);
    if (nextLevel < minimumLevel) {
      setMessage(
        `This build needs level ${minimumLevel}. Remove points before lowering the level.`,
      );
      return;
    }
    setLevel(nextLevel);
    setMessage(`Character level set to ${nextLevel}.`);
  }

  function saveBuild(): void {
    if (summary.spent === 0) {
      setMessage("Spend at least one point before saving a build.");
      return;
    }
    const name = saveName.trim() || `${className} ${distribution}`;
    const next: SavedBuild = {
      id: crypto.randomUUID(),
      name,
      savedAt: new Date().toISOString(),
      level,
      allocation,
    };
    const updated = [next, ...savedBuilds].slice(0, 30);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setSavedBuilds(updated);
      setSaveName("");
      setMessage(`Saved “${name}” in this browser.`);
    } catch {
      setMessage("The browser could not save this build.");
    }
  }

  function loadBuild(id: string): void {
    const saved = savedBuilds.find((build) => build.id === id);
    if (!saved) return;
    if (!isAllocationValid(classData, className, saved.level, saved.allocation)) {
      setMessage("That saved build is not valid for this snapshot.");
      return;
    }
    setLevel(saved.level);
    setAllocation(saved.allocation);
    setMessage(`Loaded “${saved.name}”.`);
  }

  async function shareBuild(): Promise<void> {
    const encoded = encodeBuild({
      version: 1,
      snapshot: snapshotChecksum,
      level,
      points: Object.entries(allocation).filter((entry): entry is [string, number] => entry[1] > 0),
    });
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("build", encoded);
    try {
      await navigator.clipboard.writeText(url.toString());
      window.history.replaceState(null, "", url);
      setMessage("A snapshot-safe build link was copied.");
    } catch {
      setMessage(`Copy this build link: ${url.toString()}`);
    }
  }

  return (
    <section
      className="forever-calculator"
      style={{ "--forever-class": color } as React.CSSProperties}
    >
      <header className="forever-talent-toolbar">
        <div className="forever-level-control">
          <label htmlFor="forever-character-level">Character level</label>
          <select
            id="forever-character-level"
            onChange={(event) => changeLevel(Number(event.target.value))}
            value={level}
          >
            {Array.from({ length: 51 }, (_, index) => index + 10).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button
          aria-pressed={compare}
          className={compare ? "active" : undefined}
          onClick={() => setCompare((value) => !value)}
          type="button"
        >
          Compare to Classic
        </button>
        <label className="forever-estimate-toggle">
          <input
            checked={showEstimates}
            onChange={(event) => setShowEstimates(event.target.checked)}
            type="checkbox"
          />
          Show estimated ranks
        </label>
        <button
          onClick={() => {
            setAllocation({});
            setMessage("The build was reset.");
          }}
          type="button"
        >
          Reset all
        </button>
      </header>

      <div className="forever-build-status">
        <div>
          <ForeverIcon
            alt={`${className} class`}
            className="forever-build-class-icon"
            iconKey={classData.icon}
            snapshotChecksum={snapshotChecksum}
          />
          <span>
            <small>{className} talent build</small>
            <strong>
              {treeNames
                .map((name, index) => `${name} ${summary.treePoints[index] ?? 0}`)
                .join(" · ")}
            </strong>
          </span>
        </div>
        <dl>
          <div>
            <dt>Spent</dt>
            <dd>{summary.spent}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd className={summary.remaining < 0 ? "over" : undefined}>{summary.remaining}</dd>
          </div>
          <div>
            <dt>Required level</dt>
            <dd>{summary.requiredLevel}</dd>
          </div>
        </dl>
      </div>

      <p className="forever-calculator-message" aria-live="polite">
        {message}
      </p>

      <div className="forever-trees">
        {classData.trees.map((tree, treeIndex) => (
          <TalentTreeView
            allocation={allocation}
            classData={classData}
            className={className}
            compare={compare}
            key={tree.name}
            level={level}
            onActivate={(talentIndex, element, touch) => {
              const rectangle = element.getBoundingClientRect();
              setActiveTalent({
                treeIndex,
                talentIndex,
                anchor: {
                  top: rectangle.top,
                  right: rectangle.right,
                  bottom: rectangle.bottom,
                  left: rectangle.left,
                  width: rectangle.width,
                  height: rectangle.height,
                },
                touch,
              });
            }}
            onAdd={(talent) => addRank(treeIndex, talent)}
            onDeactivate={() => setActiveTalent(null)}
            onRemove={(talent) => removeRank(treeIndex, talent)}
            onReset={() => resetTree(tree)}
            points={summary.treePoints[treeIndex] ?? 0}
            snapshotChecksum={snapshotChecksum}
            tree={tree}
            treeIndex={treeIndex}
          />
        ))}
      </div>

      <section className="forever-build-actions" aria-label="Save and share build">
        <div>
          <label htmlFor="forever-save-name">Build name</label>
          <input
            id="forever-save-name"
            maxLength={60}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder={`${className} ${distribution}`}
            value={saveName}
          />
          <button onClick={saveBuild} type="button">
            Save locally
          </button>
          <button className="primary" onClick={() => void shareBuild()} type="button">
            Copy build link
          </button>
        </div>
        <label>
          <span>Saved builds</span>
          <select defaultValue="" onChange={(event) => loadBuild(event.target.value)}>
            <option value="">Choose a saved build</option>
            {savedBuilds.map((build) => (
              <option key={build.id} value={build.id}>
                {build.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {mounted && activeTalent
        ? createPortal(
            <TalentPanel
              allocation={allocation}
              className={className}
              classData={classData}
              compare={compare}
              level={level}
              onAdd={addRank}
              onClose={() => setActiveTalent(null)}
              onRemove={removeRank}
              selection={activeTalent}
              showEstimates={showEstimates}
              snapshotChecksum={snapshotChecksum}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

interface TalentTreeViewProps {
  readonly allocation: TalentAllocation;
  readonly classData: TalentClass;
  readonly className: string;
  readonly compare: boolean;
  readonly level: number;
  readonly onActivate: (talentIndex: number, element: HTMLButtonElement, touch: boolean) => void;
  readonly onAdd: (talent: Talent) => void;
  readonly onDeactivate: () => void;
  readonly onRemove: (talent: Talent) => void;
  readonly onReset: () => void;
  readonly points: number;
  readonly snapshotChecksum: string;
  readonly tree: TalentTree;
  readonly treeIndex: number;
}

function TalentTreeView({
  allocation,
  classData,
  className,
  compare,
  level,
  onActivate,
  onAdd,
  onDeactivate,
  onRemove,
  onReset,
  points,
  snapshotChecksum,
  tree,
  treeIndex,
}: TalentTreeViewProps): React.JSX.Element {
  const maximumRow = Math.max(1, ...tree.talents.map(({ row }) => row));
  const background = `/api/forever-assets/background/${tree.bg}?v=${snapshotChecksum.slice(0, 12)}`;
  return (
    <article className="forever-tree">
      <header>
        <ForeverIcon
          alt=""
          className="forever-tree-icon"
          iconKey={tree.icon}
          snapshotChecksum={snapshotChecksum}
        />
        <span>
          <strong>{tree.name}</strong>
          <small>{points} points spent</small>
        </span>
        <button aria-label={`Reset ${tree.name}`} onClick={onReset} type="button">
          Reset
        </button>
      </header>
      <div
        className="forever-tree-body"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(3, 3, 7, 0.28), rgba(3, 3, 7, 0.76)), url("${background}")`,
        }}
      >
        <TalentPrerequisites
          allocation={allocation}
          className={className}
          tree={tree}
          treeIndex={treeIndex}
        />
        <div
          className="forever-talent-grid"
          style={{ gridTemplateRows: `repeat(${maximumRow}, 76px)` }}
        >
          {tree.talents.map((talent, talentIndex) => {
            const key = createTalentKey(className, tree.name, talent.name);
            const rank = allocation[key] ?? 0;
            const blocked = getAddBlockReason(
              classData,
              className,
              treeIndex,
              talent,
              level,
              allocation,
            );
            const state =
              rank === talent.max
                ? "maxed"
                : rank > 0
                  ? "partial"
                  : blocked
                    ? "locked"
                    : "available";
            const uncertain =
              getTalentRankText(talent, Math.max(1, rank || 1)).evidence !== "demo_transcribed";
            return (
              <button
                aria-label={`${talent.name}, rank ${rank} of ${talent.max}${blocked ? `, ${blocked}` : ""}`}
                className={`forever-talent-node ${state}${uncertain ? " uncertain" : ""}`}
                key={key}
                onBlur={onDeactivate}
                onClick={(event) => {
                  if (window.matchMedia("(hover: none)").matches) {
                    onActivate(talentIndex, event.currentTarget, true);
                  } else {
                    onAdd(talent);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onRemove(talent);
                }}
                onFocus={(event) => onActivate(talentIndex, event.currentTarget, false)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" || event.key === "Delete") {
                    event.preventDefault();
                    onRemove(talent);
                  }
                }}
                onMouseEnter={(event) => onActivate(talentIndex, event.currentTarget, false)}
                onMouseLeave={onDeactivate}
                style={{ gridColumn: talent.col, gridRow: talent.row }}
                type="button"
              >
                <ForeverIcon alt="" iconKey={talent.icon} snapshotChecksum={snapshotChecksum} />
                <span className="forever-talent-rank">
                  {rank}/{talent.max}
                </span>
                {compare && talent.classic.status !== "same" ? (
                  <span className={`forever-compare-badge ${talent.classic.status}`}>
                    {talent.classic.status === "new"
                      ? "N"
                      : talent.classic.status === "moved"
                        ? "M"
                        : "C"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {compare && tree.removed.length > 0 ? (
          <div className="forever-removed-talents">
            <strong>Removed from the Classic tree</strong>
            <p>{tree.removed.map(({ name }) => name).join(" · ")}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TalentPrerequisites({
  allocation,
  className,
  tree,
  treeIndex,
}: {
  readonly allocation: TalentAllocation;
  readonly className: string;
  readonly tree: TalentTree;
  readonly treeIndex: number;
}): React.JSX.Element {
  const markerId = useId().replaceAll(":", "");
  const maximumRow = Math.max(1, ...tree.talents.map(({ row }) => row));
  const paths = tree.talents.flatMap((talent) => {
    if (!talent.req) return [];
    const prerequisite = tree.talents.find(({ name }) => name === talent.req);
    if (!prerequisite) return [];
    const startX = (prerequisite.col - 0.5) * 100;
    const startY = (prerequisite.row - 0.5) * 76 + 27;
    const endX = (talent.col - 0.5) * 100;
    const endY = (talent.row - 0.5) * 76 - 27;
    const middleY = (startY + endY) / 2;
    const active =
      (allocation[createTalentKey(className, tree.name, prerequisite.name)] ?? 0) >=
      prerequisite.max;
    return [
      {
        key: `${prerequisite.name}:${talent.name}`,
        active,
        path:
          startX === endX
            ? `M ${startX} ${startY} L ${endX} ${endY}`
            : `M ${startX} ${startY} L ${startX} ${middleY} L ${endX} ${middleY} L ${endX} ${endY}`,
      },
    ];
  });
  return (
    <svg
      aria-hidden="true"
      className="forever-prerequisites"
      preserveAspectRatio="none"
      style={{ height: maximumRow * 76 }}
      viewBox={`0 0 400 ${maximumRow * 76}`}
    >
      <defs>
        <marker
          id={`${markerId}-off`}
          markerHeight="7"
          markerWidth="7"
          orient="auto"
          refX="5"
          refY="3.5"
        >
          <path d="M0,0 L0,7 L7,3.5 z" />
        </marker>
        <marker
          id={`${markerId}-on`}
          markerHeight="7"
          markerWidth="7"
          orient="auto"
          refX="5"
          refY="3.5"
        >
          <path className="active" d="M0,0 L0,7 L7,3.5 z" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          className={path.active ? "active" : undefined}
          d={path.path}
          key={`${treeIndex}:${path.key}`}
          markerEnd={`url(#${markerId}-${path.active ? "on" : "off"})`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

interface TalentPanelProps {
  readonly allocation: TalentAllocation;
  readonly className: string;
  readonly classData: TalentClass;
  readonly compare: boolean;
  readonly level: number;
  readonly onAdd: (treeIndex: number, talent: Talent) => void;
  readonly onClose: () => void;
  readonly onRemove: (treeIndex: number, talent: Talent) => void;
  readonly selection: ActiveTalent;
  readonly showEstimates: boolean;
  readonly snapshotChecksum: string;
}

function TalentPanel({
  allocation,
  className,
  classData,
  compare,
  level,
  onAdd,
  onClose,
  onRemove,
  selection,
  showEstimates,
  snapshotChecksum,
}: TalentPanelProps): React.JSX.Element | null {
  const tree = classData.trees[selection.treeIndex];
  const talent = tree?.talents[selection.talentIndex];
  if (!tree || !talent) return null;
  const key = createTalentKey(className, tree.name, talent.name);
  const rank = allocation[key] ?? 0;
  const displayRank = Math.max(1, rank);
  const current = getTalentRankText(talent, displayRank);
  const next = rank < talent.max ? getTalentRankText(talent, rank + 1) : null;
  const blockReason = getAddBlockReason(
    classData,
    className,
    selection.treeIndex,
    talent,
    level,
    allocation,
  );
  const canRemove = canRemoveTalentRank(
    classData,
    className,
    selection.treeIndex,
    talent,
    level,
    allocation,
  );
  const position = floatingPosition(selection.anchor);
  const classes = selection.touch
    ? "forever-talent-panel forever-talent-sheet"
    : "forever-talent-panel";
  return (
    <aside
      aria-label={`${talent.name} details`}
      className={classes}
      style={selection.touch ? undefined : position}
    >
      <header>
        <ForeverIcon alt="" iconKey={talent.icon} snapshotChecksum={snapshotChecksum} />
        <span>
          <strong>{talent.name}</strong>
          <small>
            Rank {rank} of {talent.max}
            {talent.passive ? " · Passive" : ""}
            {talent.cost ? ` · ${talent.cost}` : ""}
          </small>
        </span>
        {selection.touch ? (
          <button aria-label="Close talent details" onClick={onClose} type="button">
            ×
          </button>
        ) : null}
      </header>
      <div className="forever-tooltip-copy">
        <small>{rank === 0 ? "First rank" : `Rank ${displayRank}`}</small>
        <p>
          {current.evidence === "derived_estimate" && !showEstimates
            ? "Estimated text is hidden. Enable estimated ranks to display it."
            : (current.text ?? "No description has been observed for this rank.")}
        </p>
        <EvidenceLabel evidence={current.evidence} />
      </div>
      {next && rank > 0 && rank < talent.max ? (
        <div className="forever-tooltip-next">
          <small>Next rank</small>
          <p>
            {next.evidence === "derived_estimate" && !showEstimates
              ? "Estimated text hidden."
              : (next.text ?? "No description observed.")}
          </p>
        </div>
      ) : null}
      {talent.note ? <p className="forever-tooltip-note">{talent.note}</p> : null}
      {talent.reqText ? <p className="forever-tooltip-requirement">{talent.reqText}</p> : null}
      {compare ? (
        <div className="forever-classic-comparison">
          <strong>{classicStatusLabel(talent.classic.status)}</strong>
          {talent.classic.renamed ? <small>Classic name: {talent.classic.renamed}</small> : null}
          {talent.classic.text ? <p>{talent.classic.text}</p> : null}
        </div>
      ) : null}
      {blockReason && blockReason !== "Maximum rank learned" ? (
        <p className="forever-tooltip-requirement">{blockReason}</p>
      ) : null}
      {selection.touch ? (
        <footer>
          <button
            disabled={!canRemove}
            onClick={() => onRemove(selection.treeIndex, talent)}
            type="button"
          >
            Unlearn
          </button>
          <button
            className="primary"
            disabled={Boolean(blockReason)}
            onClick={() => onAdd(selection.treeIndex, talent)}
            type="button"
          >
            Learn rank
          </button>
        </footer>
      ) : null}
    </aside>
  );
}

function EvidenceLabel({
  evidence,
}: {
  readonly evidence: ReturnType<typeof getTalentRankText>["evidence"];
}): React.JSX.Element {
  const labels = {
    demo_transcribed: "Observed demo text",
    source_complete_unverified: "Source marks this talent complete",
    derived_estimate: "Estimated value",
    unknown: "Evidence missing",
  } as const;
  return <span className={`forever-evidence ${evidence}`}>{labels[evidence]}</span>;
}

function classicStatusLabel(status: Talent["classic"]["status"]): string {
  if (status === "new") return "New in Forever";
  if (status === "moved") return "Moved from its Classic position";
  if (status === "same") return "Same as Classic";
  return "Changed from Classic";
}

function floatingPosition(rectangle: AnchorRect): React.CSSProperties {
  const width = 350;
  const gap = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left =
    rectangle.right + gap + width <= viewportWidth
      ? rectangle.right + gap
      : Math.max(8, rectangle.left - width - gap);
  const estimatedHeight = 390;
  const top = Math.min(
    Math.max(8, rectangle.top - 20),
    Math.max(8, viewportHeight - estimatedHeight - 8),
  );
  return { left, top, width };
}

function encodeBuild(payload: BuildPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `v1.${payload.snapshot}.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

function decodeBuild(value: string): BuildPayload {
  const [version, snapshot, encoded] = value.split(".");
  if (version !== "v1" || !snapshot || !encoded || !/^[a-f0-9]{64}$/.test(snapshot)) {
    throw new Error("Unsupported build format");
  }
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isBuildPayload(parsed) || parsed.snapshot !== snapshot)
    throw new Error("Invalid build payload");
  return parsed;
}

function isBuildPayload(value: unknown): value is BuildPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BuildPayload>;
  return (
    candidate.version === 1 &&
    typeof candidate.snapshot === "string" &&
    typeof candidate.level === "number" &&
    candidate.level >= 10 &&
    candidate.level <= 60 &&
    Array.isArray(candidate.points) &&
    candidate.points.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        Number.isInteger(entry[1]) &&
        entry[1] > 0,
    )
  );
}

function parseSavedBuilds(value: string): readonly SavedBuild[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate): SavedBuild[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const build = candidate as Partial<SavedBuild>;
    if (
      typeof build.id !== "string" ||
      typeof build.name !== "string" ||
      typeof build.savedAt !== "string" ||
      typeof build.level !== "number" ||
      !Number.isInteger(build.level) ||
      build.level < 10 ||
      build.level > 60 ||
      !build.allocation ||
      typeof build.allocation !== "object"
    ) {
      return [];
    }
    const allocation = Object.fromEntries(
      Object.entries(build.allocation).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isInteger(entry[1]) && entry[1] > 0,
      ),
    );
    return [
      { id: build.id, name: build.name, savedAt: build.savedAt, level: build.level, allocation },
    ];
  });
}
