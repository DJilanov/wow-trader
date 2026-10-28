"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HealerItem } from "@wow-trader/forever-data/healing-simulator";
import {
  parseShamanHealerGroupPayload,
  type ShamanHealerGroupPayload,
  type ShamanHealerLibraryIndex,
} from "@wow-trader/forever-data/shaman-healer-library";
import type { ShamanHealerPresentation } from "@wow-trader/forever-data/shaman-healer-release";
import {
  configurationForShamanHealerBuild,
  isOriginalShamanConfiguration,
  shamanHealerActiveItemIds,
  shamanHealerConfigurationProblem,
  shamanHealerSourceConfiguration,
  shamanHealerTalentsString,
  type ShamanHealerConfiguration,
} from "@wow-trader/forever-data/shaman-healer-workspace";
import {
  shamanHealingDisplayMetrics,
  shamanHealingEquipmentEffects,
  shamanHealingJobSchema,
  shamanHealingReplySchema,
  validateShamanHealingReply,
  type ShamanHealingResult,
} from "@wow-trader/forever-data/shaman-healing-simulator";
import {
  decodeShamanConfiguration,
  encodeShamanConfiguration,
  shamanConfigurationStorageKey,
} from "../lib/shaman-healer-configuration";
import { withHelperBasePath } from "../lib/site-path";
import { getItemHoverPlacement } from "../lib/item-hover-placement";
import { HealerGearDialog } from "./healer-gear-dialog";
import { HealerIcon } from "./healer-icon";
import { HealerItemStats } from "./healer-item-stats";
import { HealerTalentEditor } from "./healer-talent-editor";
import style from "./healer-simulator-workspace.module.css";

interface ShamanWorkspaceProps {
  readonly index: ShamanHealerLibraryIndex;
  readonly presentation: ShamanHealerPresentation;
  readonly initialGroup: ShamanHealerGroupPayload;
  readonly release: string;
  readonly initialSharedBuild?: string;
}
type RunState =
  | { readonly kind: "idle" | "loading" | "running" | "stopped" }
  | { readonly kind: "complete"; readonly result: ShamanHealingResult }
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
  "Relic",
];
const archetypes = [
  {
    id: "riptide-support",
    name: "Riptide support",
    description: "Riptide, Chain Heal and Mana Tide",
  },
  {
    id: "riptide-mobility",
    name: "Riptide mobility",
    description: "Riptide with Nature's Swiftness",
  },
  {
    id: "mental-quickness-wave",
    name: "Mental Quickness",
    description: "Healing Wave with Enhancement support",
  },
] as const;
const assignments = { tank: "Tank healing", group: "Group healing", burst: "Burst recovery" };
const consumes = [
  {
    key: "flask",
    label: "Flask",
    choices: [
      [0, "None"],
      [2, "Distilled Wisdom"],
      [1, "Flask of the Titans"],
    ],
  },
  {
    key: "food",
    label: "Food",
    choices: [
      [0, "None"],
      [4, "Runn Tum Tuber Surprise"],
      [3, "Nightfin Soup"],
      [10, "Smoked Sagefish"],
      [11, "Sagefish Delight"],
      [9, "Tender Wolf Steak"],
    ],
  },
  {
    key: "mainHandImbue",
    label: "Weapon oil",
    choices: [
      [0, "None"],
      [16, "Lesser Mana Oil"],
      [20, "Wizard Oil"],
    ],
  },
  {
    key: "defaultPotion",
    label: "Potion",
    choices: [
      [0, "None"],
      [5, "Major Mana Potion"],
    ],
  },
  {
    key: "defaultConjured",
    label: "Conjured item",
    choices: [
      [0, "None"],
      [2, "Demonic Rune"],
    ],
  },
  {
    key: "manaRegenElixir",
    label: "Mana elixir",
    choices: [
      [0, "None"],
      [2, "Greater Mageblood Elixir"],
    ],
  },
  {
    key: "healthElixir",
    label: "Health elixir",
    choices: [
      [0, "None"],
      [3, "Elixir of Fortitude · +200 health"],
      [4, "Elixir of Greater Fortitude · +400 health"],
    ],
  },
  {
    key: "zanzaBuff",
    label: "Blasted Lands consumable",
    choices: [
      [0, "None"],
      [6, "Cerebral Cortex Compound · Intellect"],
      [7, "Gizzard Gum · Spirit"],
    ],
  },
  {
    key: "alcohol",
    label: "Alcohol · model reference",
    choices: [
      [0, "None"],
      [5, "Kreeg's Stout Beatdown"],
      [1, "Rumsey Rum Black Label"],
    ],
  },
] as const;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The healing setup could not be loaded.";
}

export function ShamanHealerWorkspace({
  index,
  presentation,
  initialGroup,
  release,
  initialSharedBuild,
}: ShamanWorkspaceProps): React.JSX.Element {
  const [group, setGroup] = useState(initialGroup);
  const [config, setConfig] = useState(() =>
    configurationForShamanHealerBuild(index, initialGroup, release),
  );
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [message, setMessage] = useState("");
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [hovered, setHovered] = useState<HoveredItem | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(280);
  const workerRef = useRef<Worker | null>(null),
    generation = useRef(0),
    requestGeneration = useRef(0);
  const groupRequest = useRef<AbortController | null>(null);
  const cache = useRef(new Map([[initialGroup.group.id, initialGroup]]));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    tooltipRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const asset = useCallback(
    (name: string): string =>
      withHelperBasePath("/healing-sim/classes/healing-shaman/" + release + "/" + name),
    [release],
  );
  const dispose = useCallback((): void => {
    ++generation.current;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const fetchGroup = useCallback(
    async (groupId: string, signal: AbortSignal): Promise<ShamanHealerGroupPayload> => {
      const stored = cache.current.get(groupId);
      if (stored) return stored;
      const descriptor = index.groups.find((entry) => entry.group.id === groupId);
      if (!descriptor) throw new Error("Choose a supported Shaman build.");
      const response = await fetch(asset(descriptor.asset.file), { signal });
      if (!response.ok) throw new Error("The build could not load. Please retry.");
      const loaded = parseShamanHealerGroupPayload(index, await response.json());
      cache.current.set(groupId, loaded);
      return loaded;
    },
    [asset, index],
  );
  useEffect((): (() => void) => {
    setMounted(true);
    return (): void => {
      ++requestGeneration.current;
      groupRequest.current?.abort();
      dispose();
    };
  }, [dispose]);
  useEffect((): (() => void) => {
    const token = ++requestGeneration.current,
      controller = new AbortController();
    groupRequest.current = controller;
    async function restore(): Promise<void> {
      try {
        const saved =
          initialSharedBuild ?? localStorage.getItem(shamanConfigurationStorageKey(release));
        if (!saved) return;
        const next = decodeShamanConfiguration(saved);
        if (next.release !== release || next.modelIdentity !== index.modelIdentity)
          throw new Error("This saved build belongs to another healing release.");
        setLoadingGroup(true);
        const loaded = await fetchGroup(next.groupId, controller.signal);
        const invalid = shamanHealerConfigurationProblem(
          index,
          loaded,
          presentation,
          next,
          release,
          false,
        );
        if (invalid) throw new Error(invalid);
        if (requestGeneration.current !== token) return;
        setGroup(loaded);
        setConfig(next);
        setMessage(initialSharedBuild ? "Shared build loaded." : "Your saved build was restored.");
      } catch (error: unknown) {
        if (requestGeneration.current === token && !controller.signal.aborted)
          setMessage(errorMessage(error) + " The reference preset is loaded.");
      } finally {
        if (requestGeneration.current === token) setLoadingGroup(false);
      }
    }
    void restore();
    return (): void => {
      controller.abort();
      if (requestGeneration.current === token) ++requestGeneration.current;
    };
  }, [fetchGroup, index, initialSharedBuild, presentation, release]);
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
  function change(next: ShamanHealerConfiguration): void {
    dispose();
    setRun({ kind: "idle" });
    setConfig(next);
    setMessage("");
  }
  async function loadPreset(groupId: string, scenarioId?: string): Promise<void> {
    const token = ++requestGeneration.current;
    groupRequest.current?.abort();
    const controller = new AbortController();
    groupRequest.current = controller;
    dispose();
    setRun({ kind: "idle" });
    setLoadingGroup(true);
    setEditingSlot(null);
    setHovered(null);
    try {
      const loaded = await fetchGroup(groupId, controller.signal);
      const configId =
        loaded.configurations.find((entry) => entry.scenarioId === scenarioId)?.id ??
        loaded.group.defaultConfigurationId;
      const next = configurationForShamanHealerBuild(index, loaded, release, configId);
      const invalid = shamanHealerConfigurationProblem(index, loaded, presentation, next, release);
      if (invalid) throw new Error(invalid);
      if (token !== requestGeneration.current) return;
      setGroup(loaded);
      setConfig(next);
      setMessage("Loaded " + loaded.group.title + " with its gear, talents and casting plan.");
    } catch (error: unknown) {
      if (token === requestGeneration.current && !controller.signal.aborted)
        setMessage(errorMessage(error));
    } finally {
      if (token === requestGeneration.current) setLoadingGroup(false);
    }
  }
  const source = shamanHealerSourceConfiguration(index, group, config, release);
  const race = presentation.races.find((entry) => entry.id === group.group.race)!;
  const profile = presentation.profiles.find((entry) => entry.id === group.group.profileId)!;
  const problem = useMemo(
    () => shamanHealerConfigurationProblem(index, group, presentation, config, release),
    [config, group, index, presentation, release],
  );
  const original = isOriginalShamanConfiguration(index, group, config);
  const busy = run.kind === "loading" || run.kind === "running";
  const itemMap = useMemo(
    () => new Map(presentation.items.map((item) => [item.id, item])),
    [presentation],
  );
  const rules = useMemo(
    () => new Map(presentation.equipmentRules.map((item) => [item.id, item])),
    [presentation],
  );
  const spellChoices = presentation.spells.filter(
    (spell) =>
      spell.family !== "natures-swiftness" &&
      (!spell.requiredTalentField || config.fields[spell.requiredTalentField]),
  );
  const targets = source.job.workload.workload.targets;
  const resources = shamanHealerActiveItemIds.filter((itemId) =>
    itemId === 13444
      ? config.consumes.defaultPotion === 5
      : itemId === 12662
        ? config.consumes.defaultConjured === 2
        : config.gear.some((item) => item.id === itemId),
  );
  const resourceName = (itemId: number): string =>
    itemId === 13444
      ? "Major Mana Potion"
      : itemId === 12662
        ? "Demonic Rune"
        : (itemMap.get(itemId)?.name ?? "Item " + itemId);
  function selectGroup(
    archetype = group.group.archetype,
    assignment = group.group.assignment,
    raceId = group.group.race,
  ): void {
    const descriptor = index.groups.find(
      ({ group: entry }) =>
        entry.archetype === archetype && entry.assignment === assignment && entry.race === raceId,
    );
    if (descriptor) void loadPreset(descriptor.group.id, source.scenarioId);
  }
  function chooseItem(itemId: number): void {
    if (editingSlot === null) return;
    const gear = structuredClone(config.gear),
      item = itemMap.get(itemId),
      enchant = gear[editingSlot]!.enchant;
    gear[editingSlot] = {
      id: itemId,
      ...(enchant && item?.enchantIds.includes(enchant) ? { enchant } : {}),
    };
    if (editingSlot === 14 && item?.twoHanded) gear[15] = { id: 0 };
    if (editingSlot === 15 && itemId !== 0 && itemMap.get(gear[14]!.id)?.twoHanded) {
      setMessage("Choose a one-handed weapon before equipping an off hand.");
      return;
    }
    const cooldowns = config.cooldowns.filter(
      (entry) =>
        [13444, 12662].includes(entry.itemId) || gear.some((item) => item.id === entry.itemId),
    );
    change({ ...config, gear, cooldowns });
    setEditingSlot(null);
  }
  function updatePriority(
    position: number,
    patch: Partial<ShamanHealerConfiguration["priorities"][number]>,
  ): void {
    change({
      ...config,
      priorities: config.priorities.map((row, offset) =>
        offset === position ? { ...row, ...patch } : row,
      ),
    });
  }
  async function simulate(): Promise<void> {
    if (problem || loadingGroup) return;
    dispose();
    const token = generation.current;
    setRun({ kind: "loading" });
    setHovered(null);
    function fail(message: string): void {
      if (generation.current === token) {
        dispose();
        setRun({ kind: "error", message });
      }
    }
    timer.current = setTimeout(
      (): void => fail("The engine could not finish loading. Retry to start a fresh worker."),
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
      const talentsString = shamanHealerTalentsString(presentation, config.fields);
      const workload = structuredClone(source.job.workload);
      workload.workload.priorities = structuredClone(config.priorities);
      workload.workload.useNaturesSwiftness = config.useNaturesSwiftness;
      workload.workload.naturesSwiftnessMinimumMissingHealth =
        config.naturesSwiftnessMinimumMissingHealth;
      workload.effects = shamanHealingEquipmentEffects(rules, config.gear, talentsString);
      workload.cooldowns = config.cooldowns.length ? structuredClone(config.cooldowns) : null;
      const createJob = codec.createJob as (input: unknown) => unknown;
      const job = shamanHealingJobSchema.parse(
        createJob({
          id: "shaman-" + crypto.randomUUID(),
          sourceRequestBase64: source.job.requestBase64,
          gear: config.gear,
          talentsString,
          race: race.id,
          consumes: config.consumes,
          workload,
          iterations: config.iterations,
          seed: 109743,
        }),
      );
      const worker = new Worker(asset("healing-worker.js"), { name: "KFC Shaman healing" });
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
            const reply = shamanHealingReplySchema.parse(data.reply);
            if (reply.id !== job.id) throw new Error("The engine returned another simulation.");
            if (reply.status === "error") throw new Error(reply.error.message);
            const validated = validateShamanHealingReply(job, reply, 180);
            if (validated.status !== "complete")
              throw new Error("The healing engine rejected the setup.");
            const result = validated.result;
            if (result.iterations !== config.iterations)
              throw new Error("The engine returned a different fight count.");
            if (
              result.equipped.loadout.race !== race.id ||
              result.equipped.loadout.equipment.items.some(
                (item, slot) =>
                  (item.id ?? 0) !== config.gear[slot]!.id ||
                  (item.enchant ?? 0) !== (config.gear[slot]!.enchant ?? 0),
              )
            )
              throw new Error("The engine returned a different race or equipment setup.");
            dispose();
            setRun({ kind: "complete", result });
          } else if (data?.type === "fatal")
            fail(typeof data.error === "string" ? data.error : "The engine stopped unexpectedly.");
        } catch (error: unknown) {
          fail(errorMessage(error));
        }
      };
      worker.onerror = (event: ErrorEvent): void => {
        event.preventDefault();
        fail("The healing engine could not run. Retry to start a fresh worker.");
      };
    } catch (error: unknown) {
      fail(errorMessage(error));
    }
  }
  function save(): void {
    try {
      localStorage.setItem(
        shamanConfigurationStorageKey(release),
        encodeShamanConfiguration(config),
      );
      setMessage("Build saved in this browser.");
    } catch {
      setMessage("This browser could not save the build. Copy a share link to keep your edits.");
    }
  }
  async function share(): Promise<void> {
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("release", release);
      url.searchParams.set("build", encodeShamanConfiguration(config));
      try {
        await navigator.clipboard.writeText(url.toString());
        setMessage("Build link copied.");
      } catch {
        setMessage("Copy this build link: " + url.toString());
      }
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    }
  }
  const measured = run.kind === "complete" ? shamanHealingDisplayMetrics(run.result, 180) : null;
  const reference = original
    ? source.evidence.results.reduce(
        (sum, result) => sum + shamanHealingDisplayMetrics(result, 180).supportHps,
        0,
      ) / source.evidence.results.length
    : null;
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
      <fieldset className={style.editable} disabled={loadingGroup || busy}>
        <section
          className={style.library + " " + style.paladinLibrary}
          aria-labelledby={id + "-library"}
        >
          <header className={style.sectionHeading}>
            <div>
              <span className="eyebrow">Pre-raid · Three-minute assignments</span>
              <h2 id={id + "-library"}>Build library</h2>
            </div>
            <span className={style.chip}>198 measured configurations</span>
          </header>
          <div className={style.archetypes}>
            {archetypes.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={group.group.archetype === entry.id}
                onClick={(): void => selectGroup(entry.id)}
              >
                <strong>{entry.name}</strong>
                <small>{entry.description}</small>
              </button>
            ))}
          </div>
          <div className={style.selectors}>
            <label>
              Race
              <select
                aria-label="Race"
                value={race.id}
                onChange={(event): void => {
                  const selected = presentation.races.find(
                    (entry) => entry.id === Number(event.currentTarget.value),
                  );
                  if (selected) selectGroup(undefined, undefined, selected.id);
                }}
              >
                {presentation.races.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignment
              <select
                aria-label="Assignment"
                value={group.group.assignment}
                onChange={(event): void => {
                  const selected = index.groups.find(
                    (entry) => entry.group.assignment === event.currentTarget.value,
                  );
                  if (selected) selectGroup(undefined, selected.group.assignment);
                }}
              >
                {Object.entries(assignments).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mechanics reference
              <select
                aria-label="Mechanics reference"
                value={source.scenarioId}
                onChange={(event): void =>
                  void loadPreset(group.group.id, event.currentTarget.value)
                }
              >
                {group.configurations.map((entry) => (
                  <option key={entry.id} value={entry.scenarioId}>
                    {presentation.scenarios.find((scenario) => scenario.id === entry.scenarioId)
                      ?.label ?? entry.scenarioId}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={style.helper}>
            {loadingGroup
              ? "Loading the selected build…"
              : presentation.scenarios.find((entry) => entry.id === source.scenarioId)?.description}
          </p>
          <p className={style.helper}>
            Selecting a preset loads its gear, talents, consumables and casting plan together.
            Engineering and Tailoring · full improved raid support · 800 incoming damage per second
            across the assignment. These model references meet the 2% comparison target; they are
            not measurements from the live server.
          </p>
        </section>
      </fieldset>
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
          <small>{problem ?? "Three-minute healing assignment · full improved raid support"}</small>
        </div>
        <div className={style.runActions}>
          <label className={style.iterations}>
            Fights
            <select
              aria-label="Fights"
              value={config.iterations}
              disabled={loadingGroup || busy}
              onChange={(event): void =>
                change({ ...config, iterations: Number(event.currentTarget.value) })
              }
            >
              {[64, 128, 512, 2000, 10000].map((count) => (
                <option key={count} value={count}>
                  {count.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={style.primary}
            disabled={!!problem || loadingGroup || busy || !mounted}
            onClick={(): void => void simulate()}
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
      </div>
      {message ? (
        <p className={style.message} role="status">
          {message}
        </p>
      ) : null}
      {run.kind === "error" ? (
        <div className={style.error} role="alert">
          {run.message}
          <button type="button" onClick={(): void => void simulate()}>
            Retry
          </button>
        </div>
      ) : null}
      <section className={style.results} aria-labelledby={id + "-results"} aria-live="polite">
        <header className={style.sectionHeading}>
          <h2 id={id + "-results"}>Healing & support</h2>
          <span className={style.chip}>{measured ? "Your simulation" : "Recorded reference"}</span>
        </header>
        {measured ? (
          <dl className={style.metrics}>
            {[
              ["Useful healing / sec", measured.effectiveHealingHps],
              ["Absorbs / sec", measured.absorbedHps],
              ["Total support / sec", measured.supportHps],
              ["Survival", (measured.survivalRate * 100).toFixed(1) + "%"],
              ["Mean missing health", measured.meanMissingHealth],
              ["Mana remaining", measured.manaRemaining],
              ["Own useful Mana Tide mana", measured.usefulOwnManaTideMana],
              ["Others' useful Mana Tide mana", measured.usefulOtherManaTideMana],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>
                  {typeof value === "number"
                    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
                    : value}
                </dd>
              </div>
            ))}
          </dl>
        ) : reference !== null ? (
          <>
            <dl className={style.metrics}>
              <div>
                <dt>Recorded support / sec</dt>
                <dd>{reference.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Fresh confirmation fights</dt>
                <dd>1,024</dd>
              </div>
              <div>
                <dt>Survival in reference</dt>
                <dd>100%</dd>
              </div>
              <div>
                <dt>Comparison target</dt>
                <dd>2%</dd>
              </div>
            </dl>
            <p className={style.helper}>
              Average of four independent confirmation batches for this exact setup. Useful healing
              and absorbs are limited by incoming damage; mana support is reported separately.
            </p>
          </>
        ) : (
          <p className={style.empty}>
            Run the simulation to measure your edited build. The recorded preset score applies to
            its original configuration.
          </p>
        )}
      </section>
      <fieldset className={style.editable} disabled={loadingGroup || busy}>
        <div className={style.columns}>
          <section className={style.gear} aria-labelledby={id + "-gear"}>
            <header className={style.sectionHeading}>
              <h2 id={id + "-gear"}>Equipment & enchants</h2>
              <span className={style.chip}>Pre-raid</span>
            </header>
            {config.gear.map((entry, slot) => {
              const item = itemMap.get(entry.id);
              return (
                <div className={style.gearRow} key={slot}>
                  <button
                    type="button"
                    className={style.gearButton}
                    aria-label={"Change " + slots[slot] + ": " + (item?.name ?? "Empty off hand")}
                    onClick={(): void => {
                      setHovered(null);
                      setEditingSlot(slot);
                    }}
                    onMouseEnter={(event): void => {
                      if (item) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHovered({ item, top: rect.top, bottom: rect.bottom, left: rect.left });
                      }
                    }}
                    onMouseLeave={(): void => setHovered(null)}
                    onFocus={(event): void => {
                      if (item) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHovered({ item, top: rect.top, bottom: rect.bottom, left: rect.left });
                      }
                    }}
                    onBlur={(): void => setHovered(null)}
                    aria-describedby={
                      item && hovered?.item.id === item.id ? id + "-tooltip" : undefined
                    }
                  >
                    {item ? (
                      <span className={style.itemIcon}>
                        <HealerIcon name={item.icon} />
                      </span>
                    ) : (
                      <span className={style.itemIcon} />
                    )}
                    <span>
                      <small>{slots[slot]}</small>
                      <strong>{item?.name ?? "Empty off hand"}</strong>
                    </span>
                    <span className={style.change}>Change</span>
                  </button>
                  {item?.enchantIds.some((enchant) => enchant !== 0) ? (
                    <label className={style.enchant}>
                      Enchant
                      <select
                        value={entry.enchant ?? 0}
                        onChange={(event): void => {
                          const gear = structuredClone(config.gear),
                            enchant = Number(event.currentTarget.value);
                          gear[slot] = { id: entry.id, ...(enchant ? { enchant } : {}) };
                          change({ ...config, gear });
                        }}
                      >
                        <option value={0}>No enchant</option>
                        {presentation.enchants
                          .filter((enchant) => item.enchantIds.includes(enchant.id))
                          .map((enchant) => (
                            <option value={enchant.id} key={enchant.id}>
                              {enchant.name}
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
            <section className={style.panel}>
              <h2>Casting plan</h2>
              <p className={style.helper}>
                Checked from top to bottom. The first available spell whose conditions are met is
                cast.
              </p>
              <ol className={style.priorities}>
                {config.priorities.map((row, position) => {
                  const spell = presentation.spells.find((entry) => entry.id === row.spellId);
                  return (
                    <li key={position}>
                      <span>
                        <strong>
                          {spell?.name ?? "Unknown spell"}
                          {spell?.rank ? " · Rank " + spell.rank : ""}
                        </strong>
                        <small>
                          {row.raidIndex < 0 ? "Automatic target" : "Target " + row.raidIndex}
                          {row.minimumMissingHealth
                            ? " · ≥ " + row.minimumMissingHealth + " missing health"
                            : ""}
                          {row.minimumMissingMana
                            ? " · ≥ " + row.minimumMissingMana + " missing mana"
                            : ""}
                          {row.keepHot ? " · maintain Riptide" : ""}
                          {row.requireHot ? " · requires Riptide" : ""}
                        </small>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <details className={style.details}>
                <summary>Edit spell priorities</summary>
                {config.priorities.map((row, position) => (
                  <div className={style.priorityEditor} key={position}>
                    <label>
                      Spell
                      <select
                        value={row.spellId}
                        onChange={(event): void =>
                          updatePriority(position, {
                            spellId: Number(event.currentTarget.value),
                            minimumMissingHealth: 0,
                            minimumMissingMana: 0,
                            keepHot: false,
                            requireHot: false,
                            minimumInjuredTargets: 0,
                            minimumGroupMissingHealth: 0,
                            raidIndex: -1,
                          })
                        }
                      >
                        {spellChoices.map((spell) => (
                          <option key={spell.id} value={spell.id}>
                            {spell.name}
                            {spell.rank ? " · Rank " + spell.rank : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Target
                      <select
                        value={row.raidIndex}
                        onChange={(event): void =>
                          updatePriority(position, { raidIndex: Number(event.currentTarget.value) })
                        }
                      >
                        <option value={-1}>Automatic</option>
                        {targets.map((target) => (
                          <option key={target.raidIndex} value={target.raidIndex}>
                            {target.raidIndex === 0 ? "Self" : "Player " + target.raidIndex}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(
                      [
                        "minimumMissingHealth",
                        "minimumMissingMana",
                        "minimumInjuredTargets",
                        "minimumGroupMissingHealth",
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        {
                          {
                            minimumMissingHealth: "Missing health ≥",
                            minimumMissingMana: "Missing mana ≥",
                            minimumInjuredTargets: "Injured Chain Heal targets ≥",
                            minimumGroupMissingHealth: "Chain Heal group deficit ≥",
                          }[key]
                        }
                        <input
                          type="number"
                          min={0}
                          max={key === "minimumInjuredTargets" ? 3 : 1_000_000}
                          step={1}
                          value={row[key]}
                          onChange={(event): void => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(value)) updatePriority(position, { [key]: value });
                          }}
                        />
                      </label>
                    ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={row.keepHot}
                        onChange={(event): void =>
                          updatePriority(position, { keepHot: event.currentTarget.checked })
                        }
                      />
                      Maintain Riptide
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={row.requireHot}
                        onChange={(event): void =>
                          updatePriority(position, { requireHot: event.currentTarget.checked })
                        }
                      />
                      Require Riptide for Chain Heal
                    </label>
                    <div className={style.priorityButtons}>
                      <button
                        type="button"
                        disabled={position === 0}
                        onClick={(): void => {
                          const priorities = [...config.priorities];
                          [priorities[position - 1], priorities[position]] = [
                            priorities[position]!,
                            priorities[position - 1]!,
                          ];
                          change({ ...config, priorities });
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={position === config.priorities.length - 1}
                        onClick={(): void => {
                          const priorities = [...config.priorities];
                          [priorities[position + 1], priorities[position]] = [
                            priorities[position]!,
                            priorities[position + 1]!,
                          ];
                          change({ ...config, priorities });
                        }}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        disabled={config.priorities.length === 1}
                        onClick={(): void =>
                          change({
                            ...config,
                            priorities: config.priorities.filter(
                              (_, offset) => offset !== position,
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
                  disabled={config.priorities.length >= 32}
                  onClick={(): void =>
                    change({
                      ...config,
                      priorities: [
                        ...config.priorities,
                        {
                          spellId: 331,
                          raidIndex: -1,
                          minimumMissingHealth: 0,
                          minimumMissingMana: 0,
                          keepHot: false,
                          requireHot: false,
                          minimumInjuredTargets: 0,
                          minimumGroupMissingHealth: 0,
                        },
                      ],
                    })
                  }
                >
                  Add spell
                </button>
              </details>
              <details className={style.details}>
                <summary>Nature&apos;s Swiftness</summary>
                <label>
                  <input
                    type="checkbox"
                    checked={config.useNaturesSwiftness}
                    disabled={!config.fields.naturesSwiftness}
                    onChange={(event): void =>
                      change({
                        ...config,
                        useNaturesSwiftness: event.currentTarget.checked,
                        naturesSwiftnessMinimumMissingHealth: 0,
                      })
                    }
                  />
                  Use Nature&apos;s Swiftness
                </label>
                <label>
                  Minimum missing health
                  <input
                    type="number"
                    min={0}
                    max={1_000_000}
                    value={config.naturesSwiftnessMinimumMissingHealth}
                    disabled={!config.useNaturesSwiftness}
                    onChange={(event): void => {
                      if (Number.isFinite(event.currentTarget.valueAsNumber))
                        change({
                          ...config,
                          naturesSwiftnessMinimumMissingHealth: event.currentTarget.valueAsNumber,
                        });
                    }}
                  />
                </label>
              </details>
            </section>
            <section className={style.panel}>
              <h2>Consumables</h2>
              <div className={style.consumeGrid}>
                {consumes.map((menu) => (
                  <label key={menu.key}>
                    {menu.label}
                    <select
                      value={config.consumes[menu.key] ?? 0}
                      onChange={(event): void => {
                        const next = {
                          ...config,
                          consumes: {
                            ...config.consumes,
                            [menu.key]: Number(event.currentTarget.value),
                          },
                        };
                        next.cooldowns = next.cooldowns.filter((row) =>
                          row.itemId === 13444
                            ? next.consumes.defaultPotion === 5
                            : row.itemId === 12662
                              ? next.consumes.defaultConjured === 2
                              : true,
                        );
                        change(next);
                      }}
                    >
                      {menu.choices.some(([value]) => value === config.consumes[menu.key]) ||
                      !config.consumes[menu.key] ? null : (
                        <option value={config.consumes[menu.key]}>
                          Preset choice {config.consumes[menu.key]}
                        </option>
                      )}
                      {menu.choices.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={config.consumes.miscConsumes?.raptorPunch ?? false}
                  onChange={(event): void =>
                    change({
                      ...config,
                      consumes: {
                        ...config.consumes,
                        miscConsumes: {
                          ...config.consumes.miscConsumes,
                          raptorPunch: event.currentTarget.checked,
                        },
                      },
                    })
                  }
                />
                Raptor Punch · model reference
              </label>
            </section>
            <section className={style.panel}>
              <h2>Resource activations</h2>
              <p className={style.helper}>
                The preset&apos;s timings are retained. Removing equipment or a consumable removes
                its activation rule. Add a rule to use newly equipped active items.
              </p>
              {config.cooldowns.map((row, position) => (
                <details className={style.details} key={row.itemId}>
                  <summary>{resourceName(row.itemId)}</summary>
                  <div className={style.consumeGrid}>
                    {(
                      [
                        "earliestMs",
                        "minimumMissingMana",
                        "minimumMissingHealth",
                        "minimumOwnHealth",
                        "maximumUses",
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        {
                          {
                            earliestMs: "Earliest use (ms)",
                            minimumMissingMana: "Missing mana ≥",
                            minimumMissingHealth: "Missing health ≥",
                            minimumOwnHealth: "Own health ≥",
                            maximumUses: "Maximum uses",
                          }[key]
                        }
                        <input
                          type="number"
                          min={key === "maximumUses" ? 1 : 0}
                          max={
                            key === "maximumUses" ? 20 : key === "earliestMs" ? 179999 : 1_000_000
                          }
                          value={row[key]}
                          onChange={(event): void => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(value))
                              change({
                                ...config,
                                cooldowns: config.cooldowns.map((entry, offset) =>
                                  offset === position ? { ...entry, [key]: value } : entry,
                                ),
                              });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={(): void =>
                      change({
                        ...config,
                        cooldowns: config.cooldowns.filter((entry) => entry.itemId !== row.itemId),
                      })
                    }
                  >
                    Remove activation
                  </button>
                </details>
              ))}
              <label>
                Add activation
                <select
                  value=""
                  onChange={(event): void => {
                    const itemId = Number(event.currentTarget.value);
                    if (!resources.includes(itemId)) return;
                    change({
                      ...config,
                      cooldowns: [
                        ...config.cooldowns,
                        {
                          itemId,
                          raidIndex: -1,
                          earliestMs: 0,
                          minimumMissingMana: itemId === 13444 ? 2000 : itemId === 12662 ? 1500 : 0,
                          minimumMissingHealth: 0,
                          minimumOwnHealth: itemId === 12662 ? 1500 : 0,
                          maximumUses: 20,
                        },
                      ],
                    });
                  }}
                >
                  <option value="">Choose an equipped item or consume</option>
                  {resources
                    .filter((itemId) => !config.cooldowns.some((row) => row.itemId === itemId))
                    .map((itemId) => (
                      <option key={itemId} value={itemId}>
                        {resourceName(itemId)}
                      </option>
                    ))}
                </select>
              </label>
            </section>
            <section className={style.panel}>
              <h2>Keep your build</h2>
              <div className={style.saveActions}>
                <button type="button" onClick={save}>
                  Save build
                </button>
                <button type="button" onClick={(): void => void share()}>
                  Copy build link
                </button>
                <button
                  type="button"
                  onClick={(): void => void loadPreset(group.group.id, source.scenarioId)}
                >
                  Reset to preset
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
              ...(!fields.naturesSwiftness
                ? { useNaturesSwiftness: false, naturesSwiftnessMinimumMissingHealth: 0 }
                : {}),
            })
          }
        />
      </fieldset>
      <details className={style.assumptions}>
        <summary>Assignment & model assumptions</summary>
        <ul>
          {presentation.assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </details>
      {editingSlot !== null ? (
        <HealerGearDialog
          library={{
            items: presentation.items.filter((item) =>
              profile.slots[editingSlot]!.includes(item.id),
            ),
          }}
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
