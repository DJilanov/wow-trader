"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HealerItem } from "@wow-trader/forever-data/healing-simulator";
import {
  paladinHealingDisplayMetrics,
  paladinHealingJobSchema,
  paladinHealingReplySchema,
  type PaladinHealingJob,
  type PaladinHealingResult,
  type PaladinHealingWorkload,
} from "@wow-trader/forever-data/paladin-healing-simulator";
import {
  parsePaladinHealerGroupPayload,
  type PaladinHealerGroupPayload,
  type PaladinHealerLibraryIndex,
} from "@wow-trader/forever-data/paladin-healer-library-payloads";
import {
  configurationForPaladinHealerBuild,
  type PaladinHealerConfiguration,
} from "@wow-trader/forever-data/paladin-healer-workspace";
import type { PaladinHealerPresentation } from "@wow-trader/forever-data/paladin-healer-release";
import {
  decodePaladinConfiguration,
  encodePaladinConfiguration,
  isOriginalPaladinConfiguration,
  paladinConfigurationProblem,
  paladinConfigurationStorageKey,
  paladinConsumeMenus,
  paladinTalentsString,
} from "../lib/paladin-healer-configuration";
import { withHelperBasePath } from "../lib/site-path";
import { getItemHoverPlacement } from "../lib/item-hover-placement";
import { HealerGearDialog } from "./healer-gear-dialog";
import { HealerIcon } from "./healer-icon";
import { HealerItemStats } from "./healer-item-stats";
import { HealerTalentEditor } from "./healer-talent-editor";
import style from "./healer-simulator-workspace.module.css";

interface PaladinWorkspaceProps {
  readonly index: PaladinHealerLibraryIndex;
  readonly presentation: PaladinHealerPresentation;
  readonly initialGroup: PaladinHealerGroupPayload;
  readonly release: string;
  readonly initialSharedBuild?: string;
}
type RunState =
  | { readonly kind: "idle" | "loading" | "running" | "stopped" }
  | { readonly kind: "complete"; readonly result: PaladinHealingResult }
  | { readonly kind: "error"; readonly message: string };
interface HoveredItem {
  readonly item: HealerItem;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}
const slots = [
  "Head",
  "Neck",
  "Shoulders",
  "Back",
  "Chest",
  "Wrists",
  "Hands",
  "Waist",
  "Legs",
  "Feet",
  "Ring 1",
  "Ring 2",
  "Trinket 1",
  "Trinket 2",
  "Main hand",
  "Off hand",
  "Libram",
];
const assignmentLabels = { tank: "Tank healing", group: "Group healing", burst: "Burst recovery" };
const resourceLabels: Readonly<Record<number, string>> = {
  13444: "Major Mana Potion",
  12662: "Demonic Rune",
  272439: "Serenity Field",
  4381: "Minor Recombobulator",
  18637: "Major Recombobulator",
  4262: "Gem-studded Leather Belt",
  8346: "Gauntlets of the Sea",
  15604: "Second Wind",
  1302205: "Mindtap Talisman",
  17252: "Mark of the Dragon Lord",
};
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function PaladinHealerWorkspace({
  index,
  presentation,
  initialGroup,
  release,
  initialSharedBuild,
}: PaladinWorkspaceProps): React.JSX.Element {
  const [group, setGroup] = useState(initialGroup);
  const [config, setConfig] = useState(() =>
    configurationForPaladinHealerBuild(index, initialGroup, release),
  );
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [message, setMessage] = useState("");
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [selection, setSelection] = useState(initialGroup.group);
  const [selectedScenario, setSelectedScenario] = useState("reference");
  const [mounted, setMounted] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [hovered, setHovered] = useState<HoveredItem | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(280);
  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const requestGeneration = useRef(0);
  const groupRequest = useRef<AbortController | null>(null);
  const groupCache = useRef(new Map([[initialGroup.group.id, initialGroup]]));
  const restoredIdentity = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const asset = useCallback(
    (name: string): string =>
      withHelperBasePath("/healing-sim/classes/healing-paladin/" + release + "/" + name),
    [release],
  );
  const dispose = useCallback((): void => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  const problem = useMemo(
    () => paladinConfigurationProblem(index, group, presentation, config, release),
    [index, group, presentation, config, release],
  );
  const original = useMemo(
    () => isOriginalPaladinConfiguration(index, group, config),
    [index, group, config],
  );
  const race = presentation.races.find((entry) => entry.id === config.race)!;
  const source = group.configurations.find((entry) => entry.id === config.sourceConfigurationId)!;
  const reference = original ? source.reference : null;
  const busy = run.kind === "loading" || run.kind === "running";
  const result = run.kind === "complete" ? run.result : null;
  const metrics = result
    ? paladinHealingDisplayMetrics(result)
    : reference
      ? {
          supportHps: reference.hps,
          meanMissingHealth: reference.meanMissingHealth,
          survivalRate: Math.min(...reference.summaries.map((row) => row.survivalRate)),
          manaRemaining:
            reference.summaries.reduce(
              (sum, row, n) => sum + row.manaRemainingMean * reference.rounds[n]!.iterations,
              0,
            ) / reference.iterations,
        }
      : null;

  const fetchGroup = useCallback(
    async (groupId: string, signal: AbortSignal): Promise<PaladinHealerGroupPayload> => {
      const cached = groupCache.current.get(groupId);
      if (cached) return cached;
      const descriptor = index.groups.find((entry) => entry.group.id === groupId);
      if (!descriptor) throw new Error("This Paladin build is not in this release.");
      const response = await fetch(asset(descriptor.asset.file), { signal });
      if (!response.ok) throw new Error("The build could not load. Please retry.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== descriptor.asset.bytes)
        throw new Error("The build download is incomplete.");
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== descriptor.asset.byteSha256)
        throw new Error("The build download could not be verified.");
      const loaded = parsePaladinHealerGroupPayload(
        index,
        JSON.parse(new TextDecoder().decode(bytes)),
      );
      groupCache.current.set(groupId, loaded);
      return loaded;
    },
    [asset, index],
  );

  useEffect(
    (): (() => void) => () => {
      dispose();
      requestGeneration.current++;
      groupRequest.current?.abort();
      restoredIdentity.current = null;
    },
    [dispose],
  );
  useEffect((): void => {
    setMounted(true);
    const identity = JSON.stringify([release, initialSharedBuild ?? null]);
    if (restoredIdentity.current === identity) return;
    restoredIdentity.current = identity;
    const token = ++requestGeneration.current;
    groupRequest.current?.abort();
    const controller = new AbortController();
    groupRequest.current = controller;
    async function restore(): Promise<void> {
      try {
        const saved =
          initialSharedBuild ?? localStorage.getItem(paladinConfigurationStorageKey(release));
        if (!saved) return;
        const candidate = decodePaladinConfiguration(saved);
        if (candidate.release !== release || candidate.modelIdentity !== index.modelIdentity)
          throw new Error("This saved build belongs to another healing release.");
        setLoadingGroup(true);
        const loaded = await fetchGroup(candidate.groupId, controller.signal);
        const invalid = paladinConfigurationProblem(
          index,
          loaded,
          presentation,
          candidate,
          release,
          false,
        );
        if (invalid) throw new Error(invalid);
        if (requestGeneration.current !== token) return;
        dispose();
        setRun({ kind: "idle" });
        setGroup(loaded);
        setConfig(candidate);
        setSelection(loaded.group);
        setSelectedScenario(candidate.scenarioId);
        setMessage(initialSharedBuild ? "Shared build loaded." : "Your saved build was restored.");
      } catch (error: unknown) {
        if (requestGeneration.current === token && !controller.signal.aborted)
          setMessage(
            (error instanceof Error ? error.message : "The saved build could not be restored.") +
              " The reference preset is loaded.",
          );
      } finally {
        if (requestGeneration.current === token) setLoadingGroup(false);
      }
    }
    void restore();
  }, [dispose, fetchGroup, index, initialSharedBuild, presentation, release]);
  useEffect((): (() => void) => {
    const hide = (): void => setHovered(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return (): void => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  useEffect((): void => {
    if (tooltipRef.current) setTooltipHeight(tooltipRef.current.scrollHeight);
  }, [hovered]);

  function change(next: PaladinHealerConfiguration): void {
    dispose();
    setRun({ kind: "idle" });
    setConfig(next);
    setMessage("");
  }
  async function loadPreset(groupId: string, scenarioId = selectedScenario): Promise<void> {
    const token = ++requestGeneration.current;
    groupRequest.current?.abort();
    const controller = new AbortController();
    groupRequest.current = controller;
    dispose();
    setRun({ kind: "idle" });
    setLoadingGroup(true);
    const descriptor = index.groups.find((entry) => entry.group.id === groupId);
    if (descriptor) setSelection(descriptor.group);
    setSelectedScenario(scenarioId);
    setEditingSlot(null);
    setHovered(null);
    try {
      const loaded = await fetchGroup(groupId, controller.signal);
      const next = configurationForPaladinHealerBuild(index, loaded, release, scenarioId);
      const invalid = paladinConfigurationProblem(index, loaded, presentation, next, release);
      if (invalid) throw new Error(invalid);
      if (token !== requestGeneration.current) return;
      setGroup(loaded);
      setConfig(next);
      setSelection(loaded.group);
      setMessage("Loaded " + loaded.group.title + " with its gear, talents and casting plan.");
    } catch (error: unknown) {
      if (token === requestGeneration.current && !controller.signal.aborted) {
        setSelection(group.group);
        setSelectedScenario(config.scenarioId);
        setMessage(
          error instanceof Error ? error.message : "The build could not load. Please retry.",
        );
      }
    } finally {
      if (token === requestGeneration.current) setLoadingGroup(false);
    }
  }
  function selectGroup(
    archetype = selection.archetype,
    assignment = selection.assignment,
    raceId = selection.context.raceId,
  ): void {
    const descriptor = index.groups.find(
      ({ group: entry }) =>
        entry.archetype === archetype &&
        entry.assignment === assignment &&
        entry.context.raceId === raceId,
    );
    if (descriptor) void loadPreset(descriptor.group.id);
  }
  function updateWorkload(updates: Partial<PaladinHealingWorkload>): void {
    change({ ...config, workload: { ...config.workload, ...updates } });
  }
  function updatePriority(
    position: number,
    updates: Partial<PaladinHealingWorkload["priorities"][number]>,
  ): void {
    updateWorkload({
      priorities: config.workload.priorities.map((row, index) =>
        index === position ? { ...row, ...updates } : row,
      ),
    });
  }
  const resourceChoices = [
    { id: 13444, itemId: 13444, available: config.consumes.defaultPotion === 5 },
    { id: 12662, itemId: 12662, available: config.consumes.defaultConjured === 2 },
    ...[4381, 18637, 4262, 8346, 272439].map((itemId) => ({
      id: itemId,
      itemId,
      available: config.gear.some((item) => item.id === itemId),
    })),
    ...[
      [15604, 11819],
      [1302205, 18371],
      [17252, 13143],
    ].map(([spellId, itemId]) => ({
      id: spellId!,
      spellId: spellId!,
      available: config.gear.some((item) => item.id === itemId),
    })),
  ].filter(
    (choice) =>
      choice.available &&
      !config.workload.cooldowns.some((entry) => (entry.itemId ?? entry.spellId) === choice.id),
  );
  function chooseItem(itemId: number): void {
    if (editingSlot === null) return;
    const gear = structuredClone(config.gear),
      previous = gear[editingSlot]!,
      item = presentation.items.find((entry) => entry.id === itemId);
    gear[editingSlot] = {
      id: itemId,
      ...(previous.enchant && item?.enchantIds.includes(previous.enchant)
        ? { enchant: previous.enchant }
        : {}),
    };
    if (editingSlot === 14 && item?.twoHanded) gear[15] = { id: 0 };
    change({ ...config, gear });
    setEditingSlot(null);
    setHovered(null);
  }
  function preview(item: HealerItem, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    setHovered({ item, top: rect.top, bottom: rect.bottom, left: rect.left });
  }
  async function simulate(): Promise<void> {
    if (problem || loadingGroup) return;
    dispose();
    const token = generation.current;
    setRun({ kind: "loading" });
    setHovered(null);
    function fail(message: string): void {
      if (generation.current !== token) return;
      dispose();
      setRun({ kind: "error", message });
    }
    timer.current = setTimeout(
      (): void =>
        fail("The healing engine could not finish loading. Retry to start a fresh worker."),
      30_000,
    );
    try {
      const imported: unknown = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ asset("request-codec.js")
      );
      if (generation.current !== token) return;
      const codec = object(imported);
      if (typeof codec?.createJob !== "function")
        throw new Error("The healing request builder could not load.");
      const createJob = codec.createJob as (input: unknown) => unknown;
      const rawJob = createJob({
        id: "paladin-" + crypto.randomUUID(),
        sourceRequestBase64: config.sourceRequestBase64,
        gear: config.gear,
        talentsString: config.talentsString,
        race: config.race,
        consumes: config.consumes,
        workload: config.workload,
        iterations: config.iterations,
        seed: 109743,
      });
      paladinHealingJobSchema.parse(rawJob);
      const job = rawJob as PaladinHealingJob;
      const worker = new Worker(asset("healing-worker.js"), { name: "KFC Paladin healing" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<unknown>): void => {
        if (generation.current !== token || workerRef.current !== worker) return;
        try {
          const data = object(event.data);
          if (data?.type === "ready") {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(
              (): void => fail("The simulation is taking too long. Try fewer fights."),
              180_000,
            );
            setRun({ kind: "running" });
            worker.postMessage({ type: "run", job });
          } else if (data?.type === "result") {
            const reply = paladinHealingReplySchema.parse(data.reply);
            if (reply.id !== job.id) throw new Error("The engine returned a different simulation.");
            if (reply.status === "error") fail(reply.error.message);
            else {
              if (
                reply.result.name !== config.workload.name ||
                reply.result.iterations !== config.iterations
              )
                throw new Error("The engine returned a different healing assignment.");
              dispose();
              setRun({ kind: "complete", result: reply.result });
            }
          } else if (data?.type === "fatal")
            fail(
              typeof data.error === "string"
                ? data.error
                : "The healing engine stopped unexpectedly.",
            );
        } catch (error: unknown) {
          fail(error instanceof Error ? error.message : "The healing response could not be read.");
        }
      };
      worker.onerror = (event: ErrorEvent): void => {
        event.preventDefault();
        fail("The healing engine could not run. Retry to start a fresh worker.");
      };
    } catch (error: unknown) {
      fail(error instanceof Error ? error.message : "The healing engine could not start.");
    }
  }
  function save(): void {
    try {
      localStorage.setItem(
        paladinConfigurationStorageKey(release),
        encodePaladinConfiguration(config),
      );
      setMessage("Build saved in this browser.");
    } catch {
      setMessage(
        "This browser could not save the build. Your edits remain here; copy a share link to keep them.",
      );
    }
  }
  async function share(): Promise<void> {
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("release", release);
      url.searchParams.set("build", encodePaladinConfiguration(config));
      try {
        await navigator.clipboard.writeText(url.toString());
        setMessage("Build link copied.");
      } catch {
        setMessage("Copy this build link: " + url.toString());
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "The build link could not be created.");
    }
  }
  const placement =
    hovered && mounted
      ? getItemHoverPlacement({
          anchorTop: hovered.top,
          anchorBottom: hovered.bottom,
          tooltipHeight,
          viewportHeight: window.innerHeight,
        })
      : null;
  return (
    <div className={style.workspace} aria-busy={!mounted || loadingGroup} inert={!mounted}>
      <section
        className={style.library + " " + style.paladinLibrary}
        aria-labelledby={id + "-library"}
      >
        <header className={style.sectionHeading}>
          <div>
            <span className="eyebrow">Pre-raid · Three-minute assignments</span>
            <h2 id={id + "-library"}>Build library</h2>
          </div>
          <span className={style.chip}>Paladin · Level 60</span>
        </header>
        <div className={style.archetypes}>
          {[
            ...new Map(index.groups.map(({ group }) => [group.archetype, group.title])).entries(),
          ].map(([archetype, title]) => (
            <button
              type="button"
              key={archetype}
              aria-pressed={selection.archetype === archetype}
              onClick={(): void => selectGroup(archetype)}
            >
              {title}
            </button>
          ))}
        </div>
        <div className={style.selectors}>
          <label>
            Assignment
            <select
              value={selection.assignment}
              onChange={(event): void =>
                selectGroup(
                  selection.archetype,
                  event.currentTarget.value as typeof group.group.assignment,
                )
              }
            >
              {Object.entries(assignmentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Race
            <select
              value={selection.context.raceId}
              onChange={(event): void =>
                selectGroup(
                  selection.archetype,
                  selection.assignment,
                  Number(event.currentTarget.value),
                )
              }
            >
              {presentation.races.map((race) => (
                <option key={race.id} value={race.id}>
                  {race.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mechanics scenario
            <select
              value={selectedScenario}
              onChange={(event): void => {
                void loadPreset(selection.id, event.currentTarget.value);
              }}
            >
              {presentation.scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={style.helper}>
          {loadingGroup
            ? "Loading the selected build…"
            : presentation.scenarios.find((entry) => entry.id === config.scenarioId)?.description}
        </p>
        <p className={style.helper}>
          Selecting a preset replaces its gear, talents, consumables and casting plan together. Save
          your edits before switching.
        </p>
        <p className={style.helper}>
          3 minutes · stationary, stacked assignment · Engineering and Tailoring · full improved
          raid support. These references compare missing friendly health under a fixed damage
          pattern; HPS is limited by that demand.
        </p>
        <p className={style.helper}>
          Preview library: full Paladin recommendations are still under review.
        </p>
      </section>
      <div className={style.runBar}>
        <div>
          <strong>
            {run.kind === "loading"
              ? "Loading the healing engine…"
              : run.kind === "running"
                ? "Simulating " + config.iterations.toLocaleString() + " fights…"
                : run.kind === "complete"
                  ? "Simulation complete"
                  : run.kind === "stopped"
                    ? "Simulation stopped"
                    : original
                      ? "Measured preset loaded"
                      : "Custom build"}
          </strong>
          <small>{problem ?? "Three-minute healing assignment · improved raid support"}</small>
        </div>
        <div className={style.runActions}>
          <label className={style.iterations}>
            Fights
            <select
              value={config.iterations}
              disabled={loadingGroup}
              onChange={(event): void =>
                change({ ...config, iterations: Number(event.currentTarget.value) })
              }
            >
              {[128, 512, 2000, 10000].map((count) => (
                <option key={count} value={count}>
                  {count.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={style.primary}
            disabled={!mounted || busy || loadingGroup || Boolean(problem)}
            onClick={(): void => {
              void simulate();
            }}
          >
            Simulate
          </button>
          <button
            type="button"
            disabled={!busy}
            onClick={(): void => {
              dispose();
              setRun({ kind: "stopped" });
            }}
          >
            Stop
          </button>
        </div>
        {busy || loadingGroup ? (
          <progress
            aria-label={loadingGroup ? "Loading build" : "Healing simulation in progress"}
            className={style.progress}
          />
        ) : null}
      </div>
      {run.kind === "error" ? (
        <p role="alert" className={style.error}>
          {run.message}{" "}
          <button
            type="button"
            onClick={(): void => {
              void simulate();
            }}
          >
            Retry simulation
          </button>
        </p>
      ) : null}
      {message ? (
        <p role="status" className={style.message}>
          {message}
        </p>
      ) : null}
      <section className={style.results} aria-label="Healing results" aria-live="polite">
        <header className={style.sectionHeading}>
          <div>
            <span className="eyebrow">
              {result
                ? "Your simulation"
                : reference
                  ? "Measured preset reference"
                  : "Your character"}
            </span>
            <h2>Healing coverage</h2>
          </div>
          {result || reference ? (
            <span className={style.chip}>
              {(result?.iterations ?? reference!.iterations).toLocaleString()} fights
            </span>
          ) : null}
        </header>
        {result && result.survivalRate < 1 ? (
          <p role="alert" className={style.error}>
            Assignment failed: a friendly target died. Compare survival and missing health before
            HPS.
          </p>
        ) : null}
        {metrics ? (
          <>
            <dl className={style.metrics}>
              {[
                ["Healing + absorbs", metrics.supportHps.toFixed(1) + " HPS"],
                ["Average missing health", Math.round(metrics.meanMissingHealth).toLocaleString()],
                ["Survival", (metrics.survivalRate * 100).toFixed(1) + "%"],
                ["Mana remaining", Math.round(metrics.manaRemaining).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className={style.helper}>
              Lower missing health is better. External assignment healing excludes self-damage from
              mana items. A 2% practical comparison applies to the missing-health objective, not
              maximum HPS.
            </p>
          </>
        ) : (
          <p className={style.empty}>
            Your edits need a fresh simulation. The preset reference is shown only for its original
            complete configuration.
          </p>
        )}
      </section>
      <fieldset className={style.editable} disabled={loadingGroup}>
        <legend className="sr-only">Customize your Paladin</legend>
        <div className={style.columns}>
          <section className={style.gear} aria-labelledby={id + "-gear"}>
            <header className={style.sectionHeading}>
              <div>
                <span className="eyebrow">Every slot · Compatible enchants</span>
                <h2 id={id + "-gear"}>Equipment</h2>
              </div>
              <button
                type="button"
                onClick={(): void => {
                  void loadPreset(group.group.id);
                }}
              >
                Reset preset
              </button>
            </header>
            {config.gear.map((spec, slot) => {
              const item = presentation.items.find((entry) => entry.id === spec.id);
              const twoHanded = presentation.items.find(
                (entry) => entry.id === config.gear[14]?.id,
              )?.twoHanded;
              const enchants = presentation.enchants.filter((entry) =>
                item?.enchantIds.includes(entry.id),
              );
              return (
                <div className={style.gearRow} key={slot}>
                  <button
                    type="button"
                    className={style.gearButton}
                    disabled={slot === 15 && twoHanded}
                    aria-label={"Change " + slots[slot] + (item ? ": " + item.name : "")}
                    aria-describedby={hovered?.item.id === item?.id ? id + "-tooltip" : undefined}
                    onClick={(): void => {
                      setEditingSlot(slot);
                      setHovered(null);
                    }}
                    onFocus={(event): void => {
                      if (item) preview(item, event.currentTarget);
                    }}
                    onBlur={(): void => setHovered(null)}
                    onMouseEnter={(event): void => {
                      if (item) preview(item, event.currentTarget);
                    }}
                    onMouseLeave={(): void => setHovered(null)}
                  >
                    <span className={style.itemIcon}>
                      {item ? <HealerIcon name={item.icon} /> : "—"}
                    </span>
                    <span>
                      <small>{slots[slot]}</small>
                      <strong className={item ? "quality-text-" + item.quality : undefined}>
                        {item?.name ??
                          (slot === 15 && twoHanded ? "Two-handed weapon equipped" : "Empty")}
                      </strong>
                    </span>
                    <span className={style.change} aria-hidden="true">
                      Change
                    </span>
                  </button>
                  {enchants.length ? (
                    <label className={style.enchant}>
                      <span className="sr-only">{slots[slot]} enchant</span>
                      <select
                        value={spec.enchant ?? 0}
                        onChange={(event): void => {
                          const gear = structuredClone(config.gear),
                            enchant = Number(event.currentTarget.value);
                          gear[slot] = { id: spec.id, ...(enchant ? { enchant } : {}) };
                          change({ ...config, gear });
                        }}
                      >
                        <option value={0}>No enchant</option>
                        {enchants.map((enchant) => (
                          <option key={enchant.id} value={enchant.id}>
                            {enchant.name.replace(/^Enchant [^-]+ - /, "")}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </section>
          <div className={style.sidebar}>
            <section className={style.panel} aria-labelledby={id + "-casting"}>
              <header className={style.sectionHeading}>
                <div>
                  <span className="eyebrow">Reactive healing</span>
                  <h2 id={id + "-casting"}>Casting plan</h2>
                </div>
              </header>
              <p className={style.helper}>
                Work down this list. Cast the first available spell when its target and
                missing-health conditions are met.
              </p>
              <ol className={style.priorities}>
                {config.workload.priorities.map((priority, position) => {
                  const spell = presentation.spells.find((entry) => entry.id === priority.spellId);
                  return (
                    <li key={position}>
                      <strong>
                        {spell?.name} <small>Rank {spell?.rank}</small>
                      </strong>
                      <span>
                        {priority.raidIndex === -1
                          ? "Most injured eligible ally"
                          : priority.raidIndex === 0
                            ? "Your character"
                            : "Ally " + priority.raidIndex}{" "}
                        · {priority.minimumMissingHealth.toLocaleString()}+ health missing
                        {priority.maintainVigil ? " · maintain Light's Vigil" : ""}
                        {priority.requireVigil ? " · requires Vigil" : ""}
                        {priority.minimumPartyTargets
                          ? " · " + priority.minimumPartyTargets + " injured targets"
                          : ""}
                        {priority.minimumPartyMissingHealth
                          ? " · " +
                            priority.minimumPartyMissingHealth.toLocaleString() +
                            "+ party health missing"
                          : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <details className={style.details}>
                <summary>Edit spell priorities and ranks</summary>
                {config.workload.priorities.map((priority, position) => (
                  <div className={style.priorityEditor} key={position}>
                    <label>
                      Spell
                      <select
                        value={priority.spellId}
                        onChange={(event): void => {
                          const spellId = Number(event.currentTarget.value);
                          updatePriority(position, {
                            spellId,
                            maintainVigil:
                              presentation.spells.find((entry) => entry.id === spellId)?.family ===
                                "lights-vigil" && Boolean(priority.maintainVigil),
                          });
                        }}
                      >
                        {presentation.spells
                          .filter(
                            (spell) =>
                              !spell.requiredTalentField ||
                              config.fields[spell.requiredTalentField],
                          )
                          .map((spell) => (
                            <option key={spell.id} value={spell.id}>
                              {spell.name} · Rank {spell.rank}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Health missing
                      <input
                        type="number"
                        min={0}
                        max={1_000_000_000}
                        value={priority.minimumMissingHealth}
                        onChange={(event): void =>
                          updatePriority(position, {
                            minimumMissingHealth: Math.max(0, Number(event.currentTarget.value)),
                          })
                        }
                      />
                    </label>
                    <label>
                      Target
                      <select
                        value={priority.raidIndex}
                        onChange={(event): void =>
                          updatePriority(position, { raidIndex: Number(event.currentTarget.value) })
                        }
                      >
                        <option value={-1}>Most injured eligible ally</option>
                        <option value={0}>Your character</option>
                        {[1, 2, 3, 4].map((target) => (
                          <option key={target} value={target}>
                            Ally {target}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Injured targets
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={priority.minimumPartyTargets ?? 0}
                        onChange={(event): void =>
                          updatePriority(position, {
                            minimumPartyTargets: Math.max(
                              0,
                              Math.min(5, Math.trunc(Number(event.currentTarget.value))),
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Party health missing
                      <input
                        type="number"
                        min={0}
                        max={5_000_000}
                        value={priority.minimumPartyMissingHealth ?? 0}
                        onChange={(event): void =>
                          updatePriority(position, {
                            minimumPartyMissingHealth: Math.max(
                              0,
                              Number(event.currentTarget.value),
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Vigil condition
                      <select
                        value={
                          priority.maintainVigil
                            ? "maintain"
                            : priority.requireVigil
                              ? "require"
                              : "none"
                        }
                        onChange={(event): void =>
                          updatePriority(position, {
                            maintainVigil: event.currentTarget.value === "maintain",
                            requireVigil: event.currentTarget.value === "require",
                          })
                        }
                      >
                        <option value="none">None</option>
                        <option value="require">Require Vigil</option>
                        {presentation.spells.find((entry) => entry.id === priority.spellId)
                          ?.family === "lights-vigil" ? (
                          <option value="maintain">Maintain Vigil</option>
                        ) : null}
                      </select>
                    </label>
                    <div className={style.priorityButtons}>
                      <button
                        type="button"
                        disabled={position === 0}
                        onClick={(): void => {
                          const priorities = [...config.workload.priorities];
                          [priorities[position - 1], priorities[position]] = [
                            priorities[position]!,
                            priorities[position - 1]!,
                          ];
                          updateWorkload({ priorities });
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={config.workload.priorities.length === 1}
                        onClick={(): void =>
                          updateWorkload({
                            priorities: config.workload.priorities.filter(
                              (_, index) => index !== position,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={config.workload.priorities.length >= 32}
                  onClick={(): void =>
                    updateWorkload({
                      priorities: [
                        ...config.workload.priorities,
                        { spellId: 19943, raidIndex: -1, minimumMissingHealth: 400 },
                      ],
                    })
                  }
                >
                  Add spell priority
                </button>
              </details>
              <details className={style.details}>
                <summary>Divine Favor and resource items</summary>
                <div className={style.consumeGrid}>
                  <label>
                    Divine Favor
                    <select
                      value={config.workload.useDivineFavor ? "on" : "off"}
                      onChange={(event): void =>
                        updateWorkload({
                          useDivineFavor: event.currentTarget.value === "on",
                          divineFavorMinimumBaseCost: event.currentTarget.value === "on" ? 300 : 0,
                        })
                      }
                    >
                      <option value="on">Use when eligible</option>
                      <option value="off">Disabled</option>
                    </select>
                  </label>
                  {config.workload.useDivineFavor ? (
                    <label>
                      Minimum base mana cost
                      <input
                        type="number"
                        min={0}
                        max={1_000_000}
                        value={config.workload.divineFavorMinimumBaseCost}
                        onChange={(event): void =>
                          updateWorkload({
                            divineFavorMinimumBaseCost: Math.max(
                              0,
                              Number(event.currentTarget.value),
                            ),
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {config.workload.cooldowns.map((entry, position) => (
                    <div className={style.consumeGrid} key={position}>
                      <label>
                        {resourceLabels[entry.itemId ?? entry.spellId ?? 0] ?? "Resource item"} ·
                        minimum mana missing
                        <input
                          type="number"
                          min={0}
                          max={1_000_000}
                          value={entry.minimumMissingMana ?? 0}
                          onChange={(event): void =>
                            updateWorkload({
                              cooldowns: config.workload.cooldowns.map((row, index) =>
                                index === position
                                  ? {
                                      ...row,
                                      minimumMissingMana: Math.max(
                                        0,
                                        Number(event.currentTarget.value),
                                      ),
                                    }
                                  : row,
                              ),
                            })
                          }
                        />
                      </label>
                      {entry.itemId && [4381, 18637, 4262, 8346].includes(entry.itemId) ? (
                        <>
                          <label>
                            Item target
                            <select
                              value={entry.targetRaidIndex ?? -1}
                              onChange={(event): void =>
                                updateWorkload({
                                  cooldowns: config.workload.cooldowns.map((row, index) =>
                                    index === position
                                      ? {
                                          ...row,
                                          targetRaidIndex: Number(event.currentTarget.value),
                                        }
                                      : row,
                                  ),
                                })
                              }
                            >
                              {entry.itemId !== 4262 ? (
                                <option value={-1}>Most injured eligible ally</option>
                              ) : null}
                              <option value={0}>Your character</option>
                              {entry.itemId !== 4262
                                ? [1, 2, 3, 4].map((target) => (
                                    <option key={target} value={target}>
                                      Ally {target}
                                    </option>
                                  ))
                                : null}
                            </select>
                          </label>
                          <label>
                            Item minimum health missing
                            <input
                              type="number"
                              min={0}
                              max={1_000_000}
                              value={entry.minimumMissingHealth ?? 0}
                              onChange={(event): void =>
                                updateWorkload({
                                  cooldowns: config.workload.cooldowns.map((row, index) =>
                                    index === position
                                      ? {
                                          ...row,
                                          minimumMissingHealth: Math.max(
                                            0,
                                            Number(event.currentTarget.value),
                                          ),
                                        }
                                      : row,
                                  ),
                                })
                              }
                            />
                          </label>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={(): void =>
                          updateWorkload({
                            cooldowns: config.workload.cooldowns.filter(
                              (_, index) => index !== position,
                            ),
                          })
                        }
                      >
                        Remove{" "}
                        {resourceLabels[entry.itemId ?? entry.spellId ?? 0] ?? "resource item"}
                      </button>
                    </div>
                  ))}
                  {resourceChoices.length ? (
                    <label>
                      Add equipped resource or consumable
                      <select
                        value=""
                        onChange={(event): void => {
                          const choice = resourceChoices.find(
                            (entry) => entry.id === Number(event.currentTarget.value),
                          );
                          if (!choice) return;
                          const friendly =
                            "itemId" in choice && [4381, 18637, 4262, 8346].includes(choice.itemId);
                          updateWorkload({
                            cooldowns: [
                              ...config.workload.cooldowns,
                              {
                                ...("itemId" in choice
                                  ? { itemId: choice.itemId }
                                  : { spellId: choice.spellId }),
                                minimumMissingMana:
                                  choice.id === 13444 ? 3000 : choice.id === 12662 ? 1500 : 0,
                                requireHealingDemand: true,
                                ...(friendly
                                  ? {
                                      targetRaidIndex: choice.id === 4262 ? 0 : -1,
                                      minimumMissingHealth: 0,
                                    }
                                  : {}),
                              },
                            ],
                          });
                        }}
                      >
                        <option value="">Choose an item…</option>
                        {resourceChoices.map((choice) => (
                          <option key={choice.id} value={choice.id}>
                            {resourceLabels[choice.id]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <p className={style.helper}>
                  The preset's encoded resource timings are retained. Unequipped items and disabled
                  potions or runes are ignored. Changing a threshold makes this a custom build.
                  Configure the health and mana thresholds when adding a custom item activation.
                </p>
              </details>
            </section>
            <section className={style.panel} aria-labelledby={id + "-consumes"}>
              <h2 id={id + "-consumes"}>Consumables</h2>
              <div className={style.consumeGrid}>
                {paladinConsumeMenus.map((menu) => (
                  <label key={menu.key}>
                    {menu.label}
                    <select
                      value={config.consumes[menu.key]}
                      onChange={(event): void =>
                        change({
                          ...config,
                          consumes: {
                            ...config.consumes,
                            [menu.key]: Number(event.currentTarget.value),
                          },
                        })
                      }
                    >
                      {menu.choices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className={style.saveActions}>
                <button type="button" onClick={save}>
                  Save build
                </button>
                <button
                  type="button"
                  onClick={(): void => {
                    void share();
                  }}
                >
                  Copy build link
                </button>
              </div>
            </section>
          </div>
        </div>
        <HealerTalentEditor
          trees={presentation.talents}
          fields={config.fields}
          onChange={(fields): void =>
            change({
              ...config,
              fields,
              talentsString: paladinTalentsString(presentation.talents, fields),
            })
          }
        />
      </fieldset>
      <details className={style.assumptions}>
        <summary>Model assumptions and coverage</summary>
        <ul>
          {presentation.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
          <li>
            These three-minute stacked references do not establish five-minute, spread-group or
            full-class qualification.
          </li>
        </ul>
      </details>
      {editingSlot !== null ? (
        <HealerGearDialog
          library={presentation}
          slot={editingSlot}
          slotName={slots[editingSlot]!}
          currentId={config.gear[editingSlot]!.id}
          faction={race.faction}
          onSelect={chooseItem}
          onClose={(): void => setEditingSlot(null)}
        />
      ) : null}
      {hovered && placement && mounted
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id + "-tooltip"}
              role="tooltip"
              className={style.itemPopup}
              style={{
                left: Math.max(8, Math.min(window.innerWidth - 336, hovered.left)),
                top: placement.placement === "above" ? undefined : hovered.bottom + 8,
                bottom:
                  placement.placement === "above"
                    ? window.innerHeight - hovered.top + 8
                    : undefined,
                maxHeight: placement.maxHeight,
              }}
            >
              <HealerItemStats item={hovered.item} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
