"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FOREVER_CLASS_APPEARANCES } from "../lib/forever-classes";
import { withHelperBasePath } from "../lib/site-path";
import { estimateCompositionSurvival } from "../lib/forever-raid-survival";
import {
  analyzeComposition,
  arrangeCompositionParties,
  compositionProfiles,
  compositionMainTank,
  compositionForecast,
  COVERAGE_REQUIREMENTS,
  createComposition,
  decodeComposition,
  encodeComposition,
  moveCompositionSeat,
  RAID_SIZES,
  replaceCompositionSeat,
  setCompositionTrashTank,
  suggestComposition,
  validateCompositionDraft,
  type CompositionCatalog,
  type CompositionDraft,
  type CompositionRole,
  type CompositionSuggestion,
  type CoverageId,
  type RaidSize,
} from "../lib/forever-raid-composition";
import styles from "./forever-raid-composition.module.css";

const STORAGE_KEY = "kfc-forever-composition.v1";
const ROLE_LABELS: Readonly<Record<CompositionRole, string>> = {
  tank: "Tank",
  healer: "Healer",
  damage: "DPS",
};
const rateFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
function rate(value: number | null): string {
  return value === null ? "Unmeasured" : rateFormatter.format(value);
}
function killTime(seconds: number | null): string {
  if (seconds === null) return "Awaiting DPS";
  const rounded = Math.ceil(seconds);
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}
interface Props {
  readonly catalog: CompositionCatalog;
  readonly initialSize?: RaidSize;
}

export function ForeverRaidComposition({ catalog, initialSize }: Props): React.JSX.Element {
  const comparisonRevision = useRef(0);
  const [draft, setDraft] = useState<CompositionDraft>(() =>
    createComposition(initialSize ?? 20, catalog),
  );
  const [undo, setUndo] = useState<CompositionDraft | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [suggestion, setSuggestion] = useState<CompositionSuggestion | null>(null);
  const [keepCore, setKeepCore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const profiles = useMemo(() => compositionProfiles(catalog), [catalog]);
  const analysis = useMemo(() => analyzeComposition(draft, catalog), [draft, catalog]);
  const forecast = useMemo(() => compositionForecast(draft, catalog), [draft, catalog]);
  const survival = useMemo(() => estimateCompositionSurvival(draft, catalog), [draft, catalog]);
  const mainTank = useMemo(() => compositionMainTank(draft, catalog)?.profile, [draft, catalog]);
  const mainTankClass = FOREVER_CLASS_APPEARANCES.find(
    (appearance) => appearance.slug === mainTank?.classSlug,
  )?.name;
  const groups = Array.from({ length: draft.size / 5 }, (_, index) => index);
  const selected = draft.seats.map((seat) => profiles.get(seat.profileId)!);
  const availableTrashPaladin = draft.seats.findIndex(
    (seat) => seat.profileId === "paladin-retribution-static" && !seat.locked,
  );
  const roleCounts = ["tank", "healer", "damage"] as const;

  useEffect(() => {
    const load = (): void => {
      comparisonRevision.current += 1;
      setBusy(false);
      setSuggestion(null);
      try {
        const hash = window.location.hash;
        const stored = localStorage.getItem(STORAGE_KEY);
        const loaded = hash.startsWith("#roster=")
          ? decodeComposition(hash.slice(8), catalog)
          : stored
            ? validateCompositionDraft(JSON.parse(stored), catalog)
            : null;
        if (
          loaded &&
          (!initialSize || loaded.size === initialSize || hash.startsWith("#roster="))
        ) {
          setDraft(loaded);
          setMessage(
            hash.startsWith("#roster=")
              ? "Shared composition loaded."
              : "Your saved composition is restored.",
          );
        }
        setRestoreError(false);
      } catch {
        setError(
          "The saved or shared plan uses unavailable builds or different rules. Your saved file is preserved; a starting composition is shown.",
        );
        setRestoreError(true);
      }
      setHydrated(true);
    };
    const timer = setTimeout(load, 0);
    window.addEventListener("hashchange", load);
    return () => {
      comparisonRevision.current += 1;
      clearTimeout(timer);
      window.removeEventListener("hashchange", load);
    };
  }, [catalog, initialSize]);
  useEffect(() => {
    if (!hydrated || restoreError) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      setTimeout(
        () =>
          setMessage("Browser storage is unavailable. Use Share composition to keep this plan."),
        0,
      );
    }
  }, [draft, hydrated, restoreError]);

  const commit = (next: CompositionDraft, status: string): void => {
    comparisonRevision.current += 1;
    setBusy(false);
    setUndo(draft);
    setDraft(next);
    setError("");
    setRestoreError(false);
    setMessage(status);
    setSuggestion(null);
    setShareUrl("");
    const url = new URL(window.location.href);
    if (url.hash.startsWith("#roster=")) url.hash = "";
    url.searchParams.delete("size");
    window.history.replaceState(null, "", url.href);
  };
  const change = (action: () => CompositionDraft, status: string): void => {
    try {
      commit(action(), status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This change could not be applied.");
    }
  };
  const preview = (): void => {
    const requestRevision = ++comparisonRevision.current;
    setBusy(true);
    setError("");
    setTimeout(() => {
      try {
        const result = suggestComposition(draft, catalog, keepCore);
        if (requestRevision !== comparisonRevision.current) return;
        setSuggestion(result);
        if (result.error) setError(result.error);
        else
          setMessage(
            result.changes.length
              ? `${result.changes.length} reference-led changes are ready for review.`
              : "Your current lineup already matches the highest reference values under these constraints.",
          );
      } catch {
        if (requestRevision === comparisonRevision.current)
          setError("The comparison could not finish. Your composition is unchanged.");
      } finally {
        if (requestRevision === comparisonRevision.current) setBusy(false);
      }
    }, 20);
  };
  const share = async (): Promise<void> => {
    const url = new URL(window.location.href);
    url.hash = `roster=${encodeComposition(draft)}`;
    setShareUrl(url.href);
    window.history.replaceState(null, "", url.href);
    try {
      await navigator.clipboard.writeText(url.href);
      setMessage(
        "Composition link copied. It includes builds and seats, with no private raid or player data.",
      );
    } catch {
      setMessage("Copy the composition link below.");
    }
  };
  const move = (from: number, to: number): void =>
    change(
      () => moveCompositionSeat(draft, from, to),
      `Moved seats between Group ${Math.floor(from / 5) + 1} and Group ${Math.floor(to / 5) + 1}.`,
    );

  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link className="helper-back-link" href="/forever">
            ← Forever tools
          </Link>
          <span className="eyebrow">10 · 20 · 40 players</span>
          <h1>Raid composition</h1>
          <p>Plan your support core, compare specs and give every seat a purpose.</p>
        </div>
        <div className={styles.heroBadge}>
          <strong>{draft.size}</strong>
          <span>players</span>
          <small>{draft.size / 5} parties · five seats</small>
        </div>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.sizePicker} role="group" aria-label="Raid size">
          {RAID_SIZES.map((size) => (
            <button
              type="button"
              key={size}
              aria-pressed={size === draft.size}
              onClick={() =>
                commit(
                  createComposition(size, catalog),
                  `${size}-player starting composition selected.`,
                )
              }
            >
              {size}
              <span> players</span>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={!undo || busy}
            onClick={() => {
              if (undo) commit(undo, "Previous composition restored.");
            }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() =>
              commit(createComposition(draft.size, catalog), "Starting composition restored.")
            }
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              void share();
            }}
          >
            Share composition ↗
          </button>
        </div>
      </div>
      {shareUrl ? (
        <label className={styles.share}>
          Composition link
          <input
            aria-label="Composition link"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
      <div className={styles.notice}>
        <strong>
          {catalog.evidence === "historical-reference"
            ? `Reference-led planning · measured ${catalog.measuredAt?.slice(0, 10) ?? "date unavailable"}`
            : "Composition planning · simulation references unavailable"}
        </strong>
        <p>
          These starting lineups cover a planned support core. Individual benchmarks use retained
          full-support scenarios. The DPS, threat and kill-time figures below combine those saved
          references; current-patch raid combat and encounter survival have not been recalculated.
        </p>
        <details>
          <summary>What the planner assumes</summary>
          <p>
            A single shared 3% all-crit category, subject to new-hotfix stacking verification.
            Support talents and improvements must be selected in your actual builds. No extra Rogue
            slot for Expose: the required Warrior maintains Sunder. Personal-only damage modifiers
            are not credited to allies. Healer counts are editable planning inputs.
          </p>
          <p>
            No world buffs or raid-dependent gear. The totals are historical reference estimates,
            not a coupled raid simulation. This planner does not send Discord messages.
          </p>
          <Link href="/forever/tier-list">Inspect the measured build comparisons →</Link>
        </details>
      </div>
      <div aria-live="polite" className={styles.feedback}>
        {message}
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <section className={styles.summary} aria-label="Composition totals">
        {roleCounts.map((role) => (
          <div key={role}>
            <span>{ROLE_LABELS[role]} · bosses</span>
            <strong>{analysis.roles[role]}</strong>
            <small>
              {role === "tank"
                ? `Target ${draft.tanks}`
                : role === "healer"
                  ? `Target ${draft.healers}`
                  : `${selected.filter((profile) => profile.role === "damage" && profile.damageType === "melee").length} melee · ${selected.filter((profile) => profile.role === "damage" && profile.damageType !== "melee").length} ranged / caster`}
            </small>
            <small>
              Trash: {analysis.trashRoles[role]}{" "}
              {role === "damage"
                ? "DPS"
                : `${ROLE_LABELS[role].toLowerCase()}${analysis.trashRoles[role] === 1 ? "" : "s"}`}
            </small>
          </div>
        ))}
        <div>
          <span>Selected support</span>
          <strong>
            {
              analysis.coverage.filter(
                (entry) =>
                  draft.required.includes(entry.id as CoverageId) && entry.state !== "missing",
              ).length
            }{" "}
            / {draft.required.length}
          </strong>
          <small>
            {analysis.ready ? "Planned coverage complete" : "Review missing requirements"}
          </small>
        </div>
      </section>
      <section className={styles.trashPlan} aria-label="Trash and boss assignments">
        <div>
          <span className="eyebrow">One roster · two assignments</span>
          <h2>Protection for trash. Retribution for bosses.</h2>
          <p>
            <strong>
              {analysis.trashRoles.tank} tanks on trash · {analysis.roles.tank} on bosses
            </strong>
          </p>
          <p>
            Bring a Protection build and tank gear for packs, then switch back to Retribution for
            the boss. Boss DPS, threat and survival estimates use the boss builds below.
          </p>
        </div>
        {analysis.trashSwitches.length ? (
          <ul>
            {analysis.trashSwitches.map((assignment) => (
              <li key={assignment.seat}>
                <strong>
                  G{Math.floor(assignment.seat / 5) + 1} · seat {(assignment.seat % 5) + 1}
                </strong>
                <span>Paladin · Protection → Retribution</span>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p>No Retribution Paladin is assigned to tank trash.</p>
            {availableTrashPaladin < 0 ? (
              <p>Choose or unlock a Retribution Paladin in the party list.</p>
            ) : null}
            <button
              type="button"
              disabled={availableTrashPaladin < 0}
              onClick={() =>
                change(
                  () => setCompositionTrashTank(draft, availableTrashPaladin, true, catalog),
                  "Protection trash assignment added; the boss build remains Retribution.",
                )
              }
            >
              Assign a Retribution Paladin
            </button>
          </div>
        )}
      </section>
      <section className={styles.performance} aria-label="Raid throughput and boss estimate">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">Bosses · full-support reference estimate</span>
            <h2>Damage, threat & kill time</h2>
          </div>
          <label className={styles.bossHealth}>
            Boss health
            <input
              type="number"
              min={1_000}
              max={1_000_000_000}
              step={1_000}
              value={forecast.bossHealth}
              onChange={(event) => {
                const bossHealth = Number(event.currentTarget.value);
                if (
                  Number.isInteger(bossHealth) &&
                  bossHealth >= 1_000 &&
                  bossHealth <= 1_000_000_000
                )
                  commit({ ...draft, bossHealth }, "Boss health updated.");
              }}
            />
          </label>
        </div>
        <div className={styles.performanceGrid}>
          <div>
            <span>Expected raid DPS</span>
            <strong data-testid="raid-reference-dps">{rate(forecast.raid.dps)}</strong>
            <small>
              {forecast.raid.damageReferences}/{forecast.raid.damageSeats} tank / damage references
              · pet damage included once
            </small>
          </div>
          <div>
            <span>Main tank TPS</span>
            <strong data-testid="main-tank-tps">
              {rate(mainTank?.reference?.threatPerSecond ?? null)}
            </strong>
            <small>
              {mainTankClass
                ? `${mainTankClass} · ${mainTank?.name} · calculated pre-raid mitigation`
                : "Choose a boss tank"}
            </small>
            <small>
              <span data-testid="main-tank-dps">
                {rate(mainTank?.reference?.unit === "DPS" ? mainTank.reference.value : null)}
              </span>{" "}
              DPS · selected build
            </small>
            {mainTank?.reference ? (
              <a
                className={styles.tankBuildLink}
                href={withHelperBasePath(mainTank.reference.href)}
              >
                Inspect selected pre-raid build ↗
              </a>
            ) : null}
          </div>
          <div>
            <span>Useful raid HPS</span>
            <strong>{rate(forecast.raid.hps)}</strong>
            <small>
              {forecast.raid.healerReferences}/{forecast.raid.healerSeats} group-healing references
              · overhealing excluded
            </small>
          </div>
          <div>
            <span>Expected boss kill time</span>
            <strong data-testid="boss-kill-time">{killTime(forecast.killSeconds)}</strong>
            <small>
              {rateFormatter.format(forecast.bossHealth)} health ÷ reference DPS · continuous uptime
            </small>
          </div>
        </div>
        <p className={styles.performanceNote}>
          Damage and threat use 300-second benchmarks; healing uses separate 180-second workloads.
          Totals sum independent references, so HPS is capacity rather than guaranteed delivered
          healing. Healer damage and healing threat are unmeasured and excluded. Group TPS is a sum
          of separate players, not a shared aggro pool; pet threat stays separate. Kill time ignores
          downtime, deaths, health regeneration and changing cooldown / execute timing in a shorter
          fight.
        </p>
        {analysis.coverage.some((entry) => entry.state === "missing") ? (
          <p className={styles.performanceWarning}>
            Support is missing: full-support references can overstate this lineup’s damage. The
            estimate does not adjust unavailable buffs.
          </p>
        ) : null}
        <details className={styles.survival} open>
          <summary>Tank healing & theoretical survival</summary>
          <div className={styles.inputs}>
            <label>
              Main tank
              <select
                value={survival.tankSeat ?? ""}
                onChange={(event) =>
                  commit(
                    { ...draft, mainTankSeat: Number(event.currentTarget.value) },
                    "Main tank updated.",
                  )
                }
                disabled={survival.tankSeat === null}
              >
                {survival.tankSeat === null ? <option value="">No tank selected</option> : null}
                {selected.map((profile, index) =>
                  profile.role === "tank" ? (
                    <option key={index} value={index}>
                      G{Math.floor(index / 5) + 1} · {profile.classSlug} {profile.name}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
            <label>
              Raw boss DPS
              <input
                type="number"
                min={0}
                max={1_000_000}
                step={50}
                value={survival.bossDps}
                onChange={(event) => {
                  const bossDps = Number(event.currentTarget.value);
                  if (Number.isInteger(bossDps) && bossDps >= 0 && bossDps <= 1_000_000)
                    commit({ ...draft, bossDps }, "Raw physical boss damage updated.");
                }}
              />
            </label>
            <label>
              Tank healing allocation (%)
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={survival.healingPercent}
                onChange={(event) => {
                  const tankHealingPercent = Number(event.currentTarget.value);
                  if (
                    Number.isFinite(tankHealingPercent) &&
                    tankHealingPercent >= 0 &&
                    tankHealingPercent <= 100
                  )
                    commit({ ...draft, tankHealingPercent }, "Tank healing allocation updated.");
                }}
              />
            </label>
            <label>
              Healing pulse interval (s)
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={survival.healingIntervalSeconds}
                onChange={(event) => {
                  const healingIntervalSeconds = Number(event.currentTarget.value);
                  if (
                    Number.isFinite(healingIntervalSeconds) &&
                    healingIntervalSeconds >= 0.5 &&
                    healingIntervalSeconds <= 10
                  )
                    commit({ ...draft, healingIntervalSeconds }, "Healing cadence updated.");
                }}
              />
            </label>
          </div>
          {mainTank?.maximumThreat ? (
            <p className={styles.performanceNote}>
              <a href={withHelperBasePath(mainTank.maximumThreat.href)}>
                Alternative {mainTankClass} pre-raid threat build:{" "}
                <span data-testid="main-tank-alternative-tps">
                  {rate(mainTank.maximumThreat.threatPerSecond)}
                </span>{" "}
                TPS · {rate(mainTank.maximumThreat.damagePerSecond)} DPS ↗
              </a>
              . This is different gear and rotation; the current tank's figures use the selected
              mitigation build.
            </p>
          ) : null}
          <div className={styles.survivalGrid}>
            <div>
              <span>Tank health / armor</span>
              <strong>
                {rate(survival.health)} /{" "}
                {rate(
                  survival.tankSeat === null
                    ? null
                    : (selected[survival.tankSeat]?.incoming?.armor ?? null),
                )}
              </strong>
            </div>
            <div>
              <span>Damage reaching tank</span>
              <strong data-testid="tank-incoming-dps">{rate(survival.incomingDps)} DPS</strong>
              <small>Scaled physical benchmark after armor, avoidance and block</small>
            </div>
            <div>
              <span>Allocated tank healing</span>
              <strong>{rate(survival.tankHealingHps)} HPS</strong>
              <small>{survival.healingPercent}% of separate single-target healer references</small>
            </div>
            <div>
              <span>Modeled tank death chance</span>
              <strong data-testid="tank-death-chance">
                {survival.samples
                  ? survival.samples.deaths === 0
                    ? `<${(survival.samples.upper95 * 100).toFixed(2)}%`
                    : `${(survival.samples.probability * 100).toFixed(2)}%`
                  : "Unmodeled"}
              </strong>
              <small>
                {survival.samples
                  ? `${survival.samples.deaths}/${survival.samples.iterations} sampled deaths · 95% sampling interval ${(survival.samples.lower95 * 100).toFixed(2)}–${(survival.samples.upper95 * 100).toFixed(2)}%`
                  : survival.unavailableReason}
              </small>
            </div>
            <div>
              <span>Average unhealed buffer</span>
              <strong>
                {survival.noHealingSeconds === null
                  ? survival.incomingDps === 0
                    ? "No damage"
                    : "Unmeasured"
                  : `${rate(survival.noHealingSeconds)}s`}
              </strong>
              <small>Health ÷ mean damage taken; not a burst survival guarantee</small>
            </div>
            <div>
              <span>Tank healing margin</span>
              <strong>
                {survival.tankHealingHps !== null && survival.incomingDps !== null
                  ? `${rate(survival.tankHealingHps - survival.incomingDps)} HPS`
                  : "Unmeasured"}
              </strong>
              <small>Allocated single-target throughput minus mean incoming DPS</small>
            </div>
          </div>
          <p className={styles.performanceNote}>
            Illustrative physical-only model: independent attack outcomes and their mean hit sizes
            from the selected tank’s historical benchmark, scaled to your raw DPS. Healing and
            absorbs become equivalent health-restoration pulses, capped at maximum health and
            applied after damage on ties. Default allocation is 50% of available single-target
            healer throughput. Other tanks and raid damage consume the remaining capacity; they are
            not simulated. No boss spells, within-hit damage spread, correlated cooldowns, healing
            interruptions or mana exhaustion. The percentage and its sampling interval describe this
            model, not actual server survival or model accuracy.
          </p>
        </details>
      </section>
      <section aria-labelledby="composition-class-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">Your composition</span>
            <h2 id="composition-class-heading">Every class, every seat.</h2>
          </div>
          <p>Click a class to highlight its seats. Counts include tanks and healers.</p>
        </div>
        <div className={styles.classGrid}>
          {FOREVER_CLASS_APPEARANCES.map((appearance) => {
            const members = selected.filter((profile) => profile.classSlug === appearance.slug);
            const entries = catalog.profiles.filter(
              (profile) => profile.classSlug === appearance.slug,
            );
            return (
              <section
                key={appearance.slug}
                className={styles.classCard}
                style={{ "--class-color": appearance.color } as CSSProperties}
                data-empty={!members.length}
              >
                <button
                  type="button"
                  className={styles.classHeader}
                  aria-pressed={classFilter === appearance.slug}
                  onClick={() =>
                    setClassFilter(classFilter === appearance.slug ? "" : appearance.slug)
                  }
                >
                  <Image
                    src={withHelperBasePath(appearance.icon)}
                    alt=""
                    width={34}
                    height={34}
                    unoptimized
                  />
                  <span>
                    {appearance.name}
                    <small>
                      {members.length
                        ? [...new Set(members.map((profile) => ROLE_LABELS[profile.role]))].join(
                            " · ",
                          )
                        : "No planned seats"}
                    </small>
                  </span>
                  <strong>{members.length}</strong>
                </button>
                <ul>
                  {entries.map((profile) => {
                    const count = members.filter((member) => member.id === profile.id).length;
                    return (
                      <li key={profile.id} data-selected={count > 0}>
                        <Image
                          src={withHelperBasePath(profile.icon)}
                          alt=""
                          width={16}
                          height={16}
                          unoptimized
                        />
                        <span>{profile.name}</span>
                        <small>{ROLE_LABELS[profile.role]}</small>
                        <strong>{count}</strong>
                      </li>
                    );
                  })}
                </ul>
                {appearance.slug === "paladin" && analysis.trashSwitches.length > 0 ? (
                  <p className={styles.classSwitchNote}>
                    {analysis.trashSwitches.length} Retribution{" "}
                    {analysis.trashSwitches.length === 1 ? "Paladin tanks" : "Paladins tank"} trash
                    as Protection. Counts above are boss builds.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>
      <section className={styles.coveragePanel} aria-labelledby="coverage-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">One raid · shared support</span>
            <h2 id="coverage-heading">Coverage & assignments</h2>
          </div>
          <p>
            Planned means an assigned provider; it does not verify their actual talent build or
            uptime.
          </p>
        </div>
        <div className={styles.coverageGrid}>
          {analysis.coverage.map((entry) => (
            <details key={entry.id} className={styles.coverage} data-state={entry.state}>
              <summary>
                <span>{entry.label}</span>
                <b>
                  {entry.state === "missing"
                    ? "Missing"
                    : entry.state === "covered"
                      ? "Present"
                      : entry.state === "assumed"
                        ? "Assumed"
                        : "Planned"}
                </b>
              </summary>
              <p>{entry.description}</p>
              <small>{entry.beneficiarySeats.length} relevant recipients · planned scope</small>
              {entry.providerSeats.map((index) => (
                <small key={index}>
                  Group {Math.floor(index / 5) + 1}, seat {(index % 5) + 1} ·{" "}
                  {selected[index]!.name} {selected[index]!.classSlug}
                </small>
              ))}
            </details>
          ))}
        </div>
        <details className={styles.duties}>
          <summary>Open the buff and Sunder duty sheet</summary>
          <ul>
            {analysis.assignments.map((assignment) => (
              <li key={`${assignment.seat}:${assignment.duty}`}>
                <strong>
                  Group {Math.floor(assignment.seat / 5) + 1}, seat {(assignment.seat % 5) + 1} ·{" "}
                  {selected[assignment.seat]!.name}
                </strong>
                <span>{assignment.duty}</span>
              </li>
            ))}
          </ul>
          <p>
            Curse assignments consume that Warlock’s curse choice. A second Paladin covers Kings
            plus Might/Wisdom; a third is needed for all three on one hybrid. Duplicate raid-wide
            auras add no extra category credit.
          </p>
        </details>
      </section>
      <section className={styles.comparePanel} aria-labelledby="comparison-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">Compare before you change</span>
            <h2 id="comparison-heading">Find another lineup</h2>
          </div>
          <p>
            Maximize retained reference damage while satisfying your chosen roles, support and
            locked seats. Trash Protection assignments are retained too. This is not a new combat
            simulation.
          </p>
        </div>
        <div className={styles.inputs}>
          <label>
            Required tanks
            <input
              type="number"
              min={1}
              max={8}
              value={draft.tanks}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (
                  Number.isInteger(value) &&
                  value >= 1 &&
                  value <= 8 &&
                  value + draft.healers < draft.size
                )
                  commit({ ...draft, tanks: value }, "Tank requirement updated.");
              }}
            />
          </label>
          <label>
            Required healers
            <input
              type="number"
              min={1}
              max={12}
              value={draft.healers}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (
                  Number.isInteger(value) &&
                  value >= 1 &&
                  value <= 12 &&
                  value + draft.tanks < draft.size
                )
                  commit({ ...draft, healers: value }, "Healer requirement updated.");
              }}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={keepCore}
              onChange={(event) => {
                comparisonRevision.current += 1;
                setBusy(false);
                setKeepCore(event.currentTarget.checked);
                setSuggestion(null);
              }}
            />
            Keep my tank and healer core
          </label>
        </div>
        <fieldset className={styles.requirements}>
          <legend>Support required in suggestions · Warrior and Sunder are always required</legend>
          {COVERAGE_REQUIREMENTS.map((rule) => (
            <label key={rule.id}>
              <input
                type="checkbox"
                checked={draft.required.includes(rule.id)}
                onChange={(event) =>
                  commit(
                    {
                      ...draft,
                      required: event.currentTarget.checked
                        ? [...draft.required, rule.id]
                        : draft.required.filter((id) => id !== rule.id),
                    },
                    "Support requirements updated.",
                  )
                }
              />
              <span>{rule.label}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className={styles.primary}
          onClick={preview}
          disabled={busy || catalog.evidence === "unavailable"}
        >
          {busy ? "Comparing legal lineups…" : "Compare reference-led lineup"}
        </button>
        {suggestion && !suggestion.error ? (
          <div className={styles.preview} role="region" aria-label="Suggested changes">
            <h3>
              {suggestion.changes.length
                ? `${suggestion.changes.length} suggested changes`
                : "No higher-reference change found"}
            </h3>
            <p>
              Based on the selected historical reference builds. Applying this proposal does not
              establish higher DPS on the current patch.
            </p>
            <ul>
              {suggestion.changes.map((item) => (
                <li key={item.seat}>
                  <strong>
                    G{Math.floor(item.seat / 5) + 1} · {(item.seat % 5) + 1}
                  </strong>
                  <span>
                    {profiles.get(item.from)!.name} {profiles.get(item.from)!.classSlug} →{" "}
                    {profiles.get(item.to)!.name} {profiles.get(item.to)!.classSlug}
                  </span>
                </li>
              ))}
            </ul>
            {suggestion.changes.length ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  commit(
                    suggestion.draft,
                    "Reviewed reference-led lineup applied. Check your actual support talents and encounter requirements.",
                  )
                }
              >
                Apply reviewed changes
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      <section aria-labelledby="parties-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">Arrange your raid</span>
            <h2 id="parties-heading">{groups.length} parties. One team.</h2>
          </div>
          <p>
            Drag the move handle or use a seat’s Move selector. Lock seats to preserve them in
            suggestions.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            commit(
              arrangeCompositionParties(draft, catalog),
              "Planned party mana support distributed. Locked seats and tank assignments are preserved.",
            )
          }
        >
          Distribute party mana support
        </button>
        {analysis.issues.length ? (
          <div className={styles.error} role="status">
            <strong>Requirements to review</strong>
            <ul>
              {analysis.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={styles.parties}>
          {groups.map((group) => (
            <section key={group} className={styles.party} aria-label={`Group ${group + 1}`}>
              <header>
                <h3>Group {group + 1}</h3>
                <span>
                  {analysis.parties[group]!.manaProviderSeats.length
                    ? "Mana totem provider planned"
                    : "No party mana totem"}
                </span>
              </header>
              <div
                className={styles.partyPerformance}
                role="group"
                aria-label={`Group ${group + 1} performance`}
              >
                <div>
                  <span>Expected DPS</span>
                  <strong>{rate(forecast.groups[group]!.dps)}</strong>
                </div>
                <div>
                  <span>Player TPS sum</span>
                  <strong>{rate(forecast.groups[group]!.tps)}</strong>
                </div>
                <div>
                  <span>Max player TPS</span>
                  <strong>{rate(forecast.groups[group]!.maxPlayerTps)}</strong>
                </div>
                <div>
                  <span>Tank TPS</span>
                  <strong>{rate(forecast.groups[group]!.maxTankTps)}</strong>
                </div>
                <div>
                  <span>Useful HPS</span>
                  <strong>{rate(forecast.groups[group]!.hps)}</strong>
                </div>
                <p>
                  {forecast.groups[group]!.threatReferences}/5 player threat references · pet TPS{" "}
                  {rate(forecast.groups[group]!.petTps)}
                </p>
                <div className={styles.damageBar} aria-hidden="true">
                  <span
                    style={{
                      width: `${forecast.raid.dps && forecast.groups[group]!.dps ? (forecast.groups[group]!.dps! / forecast.raid.dps) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              {draft.seats.slice(group * 5, group * 5 + 5).map((seat, offset) => {
                const index = group * 5 + offset,
                  profile = profiles.get(seat.profileId)!;
                const appearance = FOREVER_CLASS_APPEARANCES.find(
                  (entry) => entry.slug === profile.classSlug,
                )!;
                return (
                  <div
                    className={styles.seat}
                    key={index}
                    data-highlighted={classFilter === profile.classSlug}
                    data-locked={seat.locked}
                    style={{ "--class-color": appearance.color } as CSSProperties}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const value = event.dataTransfer.getData(
                        "application/x-kfc-composition-seat",
                      );
                      if (/^\d{1,2}$/.test(value)) move(Number(value), index);
                    }}
                  >
                    <div className={styles.seatTop}>
                      <button
                        type="button"
                        className={styles.handle}
                        draggable={!seat.locked}
                        disabled={seat.locked}
                        aria-label={`Drag group ${group + 1} seat ${offset + 1}`}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/x-kfc-composition-seat",
                            String(index),
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        ⠿
                      </button>
                      <Image
                        src={withHelperBasePath(`/wow-assets/classes/${profile.classSlug}.jpg`)}
                        alt=""
                        width={26}
                        height={26}
                        unoptimized
                      />
                      <span>
                        {appearance.name}
                        <small>{ROLE_LABELS[profile.role]}</small>
                      </span>
                      <label className={styles.lock}>
                        <input
                          type="checkbox"
                          checked={seat.locked}
                          aria-label={`Lock group ${group + 1} seat ${offset + 1}`}
                          onChange={(event) =>
                            commit(
                              {
                                ...draft,
                                seats: draft.seats.map((item, position) =>
                                  position === index
                                    ? { ...item, locked: event.currentTarget.checked }
                                    : item,
                                ),
                              },
                              event.currentTarget.checked ? "Seat locked." : "Seat unlocked.",
                            )
                          }
                        />
                        Lock
                      </label>
                    </div>
                    <select
                      value={seat.profileId}
                      disabled={seat.locked}
                      aria-label={`Build for group ${group + 1} seat ${offset + 1}`}
                      onChange={(event) =>
                        change(
                          () =>
                            replaceCompositionSeat(
                              draft,
                              index,
                              event.currentTarget.value,
                              catalog,
                            ),
                          "Seat build updated.",
                        )
                      }
                    >
                      {roleCounts.map((role) => (
                        <optgroup key={role} label={ROLE_LABELS[role]}>
                          {catalog.profiles
                            .filter((item) => item.role === role)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} · {item.classSlug}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    {seat.profileId === "paladin-retribution-static" ? (
                      <label className={styles.trashSwitch}>
                        <input
                          type="checkbox"
                          checked={Boolean(seat.trashProfileId)}
                          disabled={seat.locked}
                          aria-label={`Protection on trash for group ${group + 1} seat ${offset + 1}`}
                          onChange={(event) =>
                            change(
                              () =>
                                setCompositionTrashTank(
                                  draft,
                                  index,
                                  event.currentTarget.checked,
                                  catalog,
                                ),
                              event.currentTarget.checked
                                ? "Protection on trash; Retribution on bosses. Boss estimates are unchanged."
                                : "This Paladin remains Retribution for trash and bosses.",
                            )
                          }
                        />
                        <span>
                          Protection on trash<small>Retribution on bosses · one player</small>
                        </span>
                      </label>
                    ) : null}
                    <div className={styles.seatTools}>
                      <select
                        aria-label={`Move group ${group + 1} seat ${offset + 1}`}
                        value=""
                        disabled={seat.locked}
                        onChange={(event) => move(index, Number(event.currentTarget.value))}
                      >
                        <option value="">Move / swap seat…</option>
                        {draft.seats.map((destination, target) =>
                          target !== index && !destination.locked ? (
                            <option key={target} value={target}>
                              Group {Math.floor(target / 5) + 1} · seat {(target % 5) + 1}
                            </option>
                          ) : null,
                        )}
                      </select>
                      <details>
                        <summary>Reference</summary>
                        {profile.reference ? (
                          <p>
                            <strong>
                              {profile.reference.value.toFixed(1)} {profile.reference.unit}
                            </strong>
                            <br />
                            Player TPS: {rate(profile.reference.threatPerSecond ?? null)}
                            {profile.reference.petThreatPerSecond !== undefined ? (
                              <> · pet TPS: {rate(profile.reference.petThreatPerSecond)}</>
                            ) : null}
                            <br />
                            Measured {profile.reference.measuredAt.slice(0, 10)} with idealized full
                            support. It is not a prediction for this party.
                            <br />
                            <a href={withHelperBasePath(profile.reference.href)}>
                              Open reference build ↗
                            </a>
                            {profile.maximumThreat ? (
                              <>
                                <br />
                                <a href={withHelperBasePath(profile.maximumThreat.href)}>
                                  Max tested tank threat:{" "}
                                  {rate(profile.maximumThreat.threatPerSecond)} TPS ·{" "}
                                  {rate(profile.maximumThreat.damagePerSecond)} DPS ↗
                                </a>
                                <br />
                                Separate threat-focused build; its damage is not used for the
                                selected mitigation build above.
                              </>
                            ) : null}
                          </p>
                        ) : (
                          <p>
                            No verified reference is currently available. This planned build remains
                            editable.
                          </p>
                        )}
                      </details>
                    </div>
                  </div>
                );
              })}
              <p className={styles.partyNote}>
                Offensive totems and the planned crit category cover the raid in range. Mana Spring,
                Mana Tide and party healing still depend on this group’s providers and builds.
              </p>
            </section>
          ))}
        </div>
      </section>
      <footer className={styles.footer}>
        <p>
          Your composition is saved in this browser. Shared links contain class builds and positions
          only. These are planning seats, not confirmed player attendance.
        </p>
        <Link href="/forever/tier-list">DPS comparisons</Link>
        <Link href="/forever/tier-list/healers">Healer assignments</Link>
        <Link href="/forever/simulator">Simulators</Link>
      </footer>
    </article>
  );
}
