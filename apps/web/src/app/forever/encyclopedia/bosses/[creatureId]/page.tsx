import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../../components/forever-world-state";
import {
  getForeverBoss,
  type ForeverBossObservations as ForeverBossObservationData,
} from "../../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface ForeverBossPageProps {
  readonly params: Promise<{ readonly creatureId: string }>;
}

export async function generateMetadata({ params }: ForeverBossPageProps): Promise<Metadata> {
  const { creatureId } = await params;
  const id = parsePositiveId(creatureId);
  const data = id ? await getForeverBoss(id) : null;
  return data
    ? createHelperMetadata({
        title: `${data.name} Boss Guide · WoW Forever`,
        description: `Explore client evidence for ${data.name}: creature ID, encounters, location relationships, possible spells, models, and item source candidates.`,
        path: `/forever/encyclopedia/bosses/${data.boss.creatureId}`,
        keywords: [
          `${data.name} WoW Forever`,
          `${data.name} boss`,
          `creature ${data.boss.creatureId}`,
        ],
      })
    : createHelperMetadata({
        title: "WoW Forever boss",
        description: "WoW Forever boss evidence",
        path: `/forever/encyclopedia/bosses/${creatureId}`,
        noIndex: true,
      });
}

export default async function ForeverBossPage({
  params,
}: ForeverBossPageProps): Promise<React.JSX.Element> {
  const { creatureId } = await params;
  const id = parsePositiveId(creatureId);
  if (!id) notFound();
  const data = await getForeverBoss(id);
  if (!data) notFound();

  return (
    <article className="forever-reference-page forever-world-page forever-boss-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia/bosses">
            <span aria-hidden="true">←</span> All bosses
          </Link>
          <span className="eyebrow">Creature {data.boss.creatureId}</span>
          <h1>{data.name}</h1>
          <p>
            {data.contextLabel
              ? `${data.contextLabel} is the client context for this identity. `
              : ""}
            This page separates exact client facts from review-required spell, location, and item
            source candidates.
          </p>
        </div>
        <ForeverWorldState build={data.build} />
      </header>
      <ForeverEncyclopediaNav active="bosses" />

      <section className="forever-boss-summary" aria-label="Boss evidence summary">
        <EvidenceMetric label="Identity" value={identityLabel(data.namingState)} />
        <EvidenceMetric label="Encounters" value={data.encounters.length.toString()} />
        <EvidenceMetric label="Location links" value={data.locations.length.toString()} />
        <EvidenceMetric label="Static models" value={data.models.length.toString()} />
      </section>

      <section className="forever-boss-panel forever-boss-wide-panel forever-observation-panel">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Captured by maintainers in the game client</span>
            <h2>Observed runtime evidence</h2>
          </div>
          <p>
            These are build-scoped observations, not inferred database claims. A seen item is a
            confirmed observation, but one observation is never presented as a complete loot table
            or a drop rate.
          </p>
        </div>
        <div className="forever-observation-metrics">
          <EvidenceMetric label="Model checks" value={data.observations.models.length.toString()} />
          <EvidenceMetric
            label="Health samples"
            value={data.observations.health.length.toString()}
          />
          <EvidenceMetric label="Loot records" value={data.observations.loot.length.toString()} />
          <EvidenceMetric
            label="Observed spells"
            value={data.observations.spells.length.toString()}
          />
          <EvidenceMetric
            label="Encounter attempts"
            value={data.observations.encounters.length.toString()}
          />
        </div>
        {hasRuntimeEvidence(data.observations) ? (
          <div className="forever-observation-grid">
            <RuntimeModels models={data.observations.models} />
            <RuntimeHealth observations={data.observations.health} />
            <RuntimeSpells observations={data.observations.spells} />
            <RuntimeLoot observations={data.observations.loot} />
            <RuntimeEncounters observations={data.observations.encounters} />
            <RuntimeSightings observations={data.observations.sightings} />
          </div>
        ) : (
          <HonestEmpty>
            No uploaded runtime observation exists for this creature and build yet. Run the model
            resolver or enable diagnostics in game, then reload or log out so the companion can
            upload the SavedVariables evidence.
          </HonestEmpty>
        )}
      </section>

      <div className="forever-boss-detail-grid">
        <section className="forever-boss-panel">
          <span className="eyebrow">Where this creature is connected</span>
          <h2>Location evidence</h2>
          {data.locations.length > 0 ? (
            <ul className="forever-evidence-list">
              {data.locations.map((location, index) => (
                <li
                  key={`${location.creatureId}:${location.mapId ?? "none"}:${location.areaId ?? "none"}:${index}`}
                >
                  <div>
                    <strong>{location.mapName ?? location.evidenceLabel}</strong>
                    <span>
                      {location.precision === "point" ? "Exact point" : "Map or area relationship"}
                    </span>
                  </div>
                  <p>{location.evidenceLabel}</p>
                  <small className={location.requiresReview ? "review" : "exact"}>
                    {location.requiresReview ? "Review required" : "Exact client relationship"}
                  </small>
                  <div className="forever-evidence-actions">
                    {location.uiMapId ? (
                      <Link href={`/forever/encyclopedia/maps/${location.uiMapId}`}>Open map</Link>
                    ) : null}
                    {location.mapId !== null ? (
                      <Link href={`/forever/encyclopedia/instances/${location.mapId}`}>
                        Open instance
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <HonestEmpty>
              No reliable map relationship is present. The page does not manufacture a spawn pin.
            </HonestEmpty>
          )}
        </section>

        <section className="forever-boss-panel">
          <span className="eyebrow">Client encounter records</span>
          <h2>Encounter connections</h2>
          {data.encounters.length > 0 ? (
            <ul className="forever-evidence-list compact">
              {data.encounters.map((encounter) => (
                <li key={encounter.encounterId}>
                  <div>
                    <strong>{encounter.name}</strong>
                    <span>
                      Difficulty {encounter.difficultyId} · order {encounter.orderIndex}
                    </span>
                  </div>
                  <Link href={`/forever/encyclopedia/encounters/${encounter.encounterId}`}>
                    Open encounter →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <HonestEmpty>No exact encounter edge has been resolved for this creature.</HonestEmpty>
          )}
          {data.difficulties.length > 0 ? (
            <div className="forever-boss-difficulties">
              <h3>Related content settings</h3>
              {data.difficulties.map(({ difficulty, tuning }) => (
                <span key={difficulty.mapDifficultyId}>
                  <strong>{difficulty.difficultyName}</strong>
                  {tuning
                    ? `Levels ${tuning.minimumLevel}–${tuning.maximumLevel}`
                    : "Level range unavailable"}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <section className="forever-boss-panel forever-boss-wide-panel">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Discovery leads—not a boss guide</span>
            <h2>Possible abilities</h2>
          </div>
          <p>
            Text and numeric matches help maintainers investigate. Every row remains unverified
            until stronger runtime evidence connects the spell to the creature.
          </p>
        </div>
        {data.spells.length > 0 ? (
          <div className="forever-spell-candidate-grid">
            {data.spells.map((spell) => (
              <article key={`${spell.spellId}:${spell.evidenceKind}`}>
                <small>Spell {spell.spellId}</small>
                <strong>{spell.spellName}</strong>
                {spell.description || spell.auraDescription ? (
                  <p>{spell.description || spell.auraDescription}</p>
                ) : null}
                <span>{formatEvidenceKind(spell.evidenceKind)} · review required</span>
              </article>
            ))}
          </div>
        ) : (
          <HonestEmpty>No static spell candidates survived the evidence rules.</HonestEmpty>
        )}
      </section>

      <section className="forever-boss-panel forever-boss-wide-panel">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Appearance source text—not observed loot</span>
            <h2>Possible item source matches</h2>
          </div>
          <p>These rows do not prove a drop, availability, or drop rate.</p>
        </div>
        {data.lootCandidates.length > 0 ? (
          <ul className="forever-source-candidate-list">
            {data.lootCandidates.map((candidate) => (
              <li key={`${candidate.sourceInfoId}:${candidate.targetKind}:${candidate.targetId}`}>
                <strong>Item {candidate.itemId ?? "unresolved"}</strong>
                <p>{candidate.description}</p>
                <small>Client source-hint name match · review required</small>
              </li>
            ))}
          </ul>
        ) : (
          <HonestEmpty>
            No source-hint text matches this boss. This does not mean the boss has no loot.
          </HonestEmpty>
        )}
      </section>

      <div className="forever-boss-detail-grid">
        <section className="forever-boss-panel">
          <span className="eyebrow">Criteria graph</span>
          <h2>Identity evidence</h2>
          <ul className="forever-evidence-list compact">
            {data.objectives.map((objective) => (
              <li key={`${objective.criteriaTreeId}:${objective.criteriaId}`}>
                <strong>{objective.name}</strong>
                <p>{objective.achievementTitle ?? objective.rootDescription}</p>
                <small>Criterion {objective.criteriaId} · type 0 creature asset</small>
              </li>
            ))}
          </ul>
        </section>
        <section className="forever-boss-panel">
          <span className="eyebrow">Display resolution</span>
          <h2>Creature models</h2>
          {data.models.length > 0 ? (
            <ul className="forever-evidence-list compact">
              {data.models.map((model) => (
                <li key={`${model.displayId}:${model.modelFileDataId}`}>
                  <strong>Display {model.displayId}</strong>
                  <span>Model file {model.modelFileDataId}</span>
                  <small>
                    {model.modelFileDataPresent ? "Model file present" : "Model file unresolved"}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <HonestEmpty>
              No trustworthy creature-to-display row is present in the static cache. The client
              model resolver can fill this later without inventing an appearance.
            </HonestEmpty>
          )}
        </section>
      </div>
    </article>
  );
}

function EvidenceMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RuntimeModels({
  models,
}: {
  readonly models: ForeverBossObservationData["models"];
}): React.JSX.Element {
  return (
    <section>
      <h3>Client model resolution</h3>
      {models.length > 0 ? (
        <ul className="forever-evidence-list compact">
          {models.map((model) => (
            <li key={model.resolutionId}>
              <div>
                <strong>
                  {model.status === "resolved" ? "Resolved" : formatEvidenceKind(model.status)}
                </strong>
                <span>{formatObservedAt(model.capturedAt)}</span>
              </div>
              <p>
                Display {model.displayId ?? "unavailable"} · model file{" "}
                {model.modelFileDataId ?? "unavailable"}
              </p>
              <small className={model.status === "resolved" ? "exact" : "review"}>
                Client API result · build {model.clientBuild}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <HonestEmpty>No client model result has been uploaded.</HonestEmpty>
      )}
    </section>
  );
}

function RuntimeHealth({
  observations,
}: {
  readonly observations: ForeverBossObservationData["health"];
}): React.JSX.Element {
  return (
    <section>
      <h3>Observed health</h3>
      {observations.length > 0 ? (
        <ul className="forever-evidence-list compact">
          {observations.map((observation) => (
            <li key={observation.observationId}>
              <div>
                <strong>{formatInteger(observation.maximumHealth)} maximum HP</strong>
                <span>{formatObservedAt(observation.capturedAt)}</span>
              </div>
              <p>
                Level {observation.level ?? "unknown"} ·{" "}
                {observation.difficultyName ??
                  `difficulty ${observation.difficultyId ?? "unknown"}`}{" "}
                · group {observation.groupSize || "solo"}
              </p>
              <small className="exact">
                Unit API measurement · {formatInteger(observation.currentHealth)} HP at{" "}
                {formatPercent(observation.healthPercent)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <HonestEmpty>No health measurement has been uploaded.</HonestEmpty>
      )}
    </section>
  );
}

function RuntimeLoot({
  observations,
}: {
  readonly observations: ForeverBossObservationData["loot"];
}): React.JSX.Element {
  return (
    <section>
      <h3>Observed drops</h3>
      {observations.length > 0 ? (
        <ul className="forever-evidence-list compact">
          {observations.map((observation) => (
            <li key={observation.observationId}>
              <div>
                <strong>{observation.itemName ?? `Item ${observation.itemId}`}</strong>
                <span>×{observation.quantity}</span>
              </div>
              <p>
                {observation.evidenceKind === "loot_window"
                  ? `Exact ${observation.sourceType ?? "loot"} source ${observation.sourceId ?? "unresolved"}`
                  : `Encounter event ${observation.encounterId ?? "unresolved"}`}
              </p>
              <small className="exact">
                Observed {formatObservedAt(observation.capturedAt)} · no drop-rate claim
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <HonestEmpty>No item has been observed from this source yet.</HonestEmpty>
      )}
    </section>
  );
}

function RuntimeSpells({
  observations,
}: {
  readonly observations: ForeverBossObservationData["spells"];
}): React.JSX.Element {
  return (
    <section>
      <h3>Observed abilities</h3>
      {observations.length > 0 ? (
        <ul className="forever-evidence-list compact">
          {observations.map((observation) => (
            <li key={observation.observationId}>
              <div>
                <strong>{observation.spellName ?? `Spell ${observation.spellId}`}</strong>
                <span>{observation.eventCount.toLocaleString("en-GB")} combat-log events</span>
              </div>
              <p>
                Spell {observation.spellId} · {formatEvidenceKind(observation.subEvent)}
                {observation.encounterId ? ` · encounter ${observation.encounterId}` : ""}
              </p>
              <small className="exact">
                Creature-cast combat log · last seen {formatObservedAt(observation.lastSeenAt)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <HonestEmpty>No creature-cast combat spell has been observed.</HonestEmpty>
      )}
    </section>
  );
}

function RuntimeEncounters({
  observations,
}: {
  readonly observations: ForeverBossObservationData["encounters"];
}): React.JSX.Element {
  return (
    <section>
      <h3>Observed encounters</h3>
      {observations.length > 0 ? (
        <ul className="forever-evidence-list compact">
          {observations.map((observation) => (
            <li key={observation.attemptId}>
              <div>
                <strong>{observation.encounterName}</strong>
                <span>{observation.success ? "Completed" : "Not completed"}</span>
              </div>
              <p>
                Encounter {observation.encounterId} · difficulty {observation.difficultyId} · group{" "}
                {observation.groupSize}
              </p>
              <small className="exact">Observed {formatObservedAt(observation.endedAt)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <HonestEmpty>No encounter attempt has linked this creature at runtime.</HonestEmpty>
      )}
    </section>
  );
}

function RuntimeSightings({
  observations,
}: {
  readonly observations: ForeverBossObservationData["sightings"];
}): React.JSX.Element {
  return (
    <section>
      <h3>Observed locations</h3>
      {observations.length > 0 ? (
        <ul className="forever-evidence-list compact">
          {observations.map((observation) => (
            <li key={observation.observationId}>
              <div>
                <strong>
                  {observation.uiMapId
                    ? `UI map ${observation.uiMapId}`
                    : `Map ${observation.mapId ?? "unresolved"}`}
                </strong>
                <span>{formatObservedAt(observation.capturedAt)}</span>
              </div>
              <p>
                Level {observation.level ?? "unknown"} ·{" "}
                {observation.classification ?? "classification unavailable"}
              </p>
              <small
                className={observation.positionEvidence === "unit_position" ? "exact" : "review"}
              >
                {formatEvidenceKind(observation.positionEvidence)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <HonestEmpty>No runtime location observation has been uploaded.</HonestEmpty>
      )}
    </section>
  );
}

function HonestEmpty({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <p className="forever-honest-empty">{children}</p>;
}

function identityLabel(state: "ambiguous" | "criteria_named" | "encounter_named"): string {
  if (state === "encounter_named") return "Encounter named";
  if (state === "criteria_named") return "Criteria named";
  return "Review needed";
}

function formatEvidenceKind(value: string): string {
  return value.replaceAll("_", " ");
}

function hasRuntimeEvidence(observations: ForeverBossObservationData): boolean {
  return (
    observations.models.length > 0 ||
    observations.health.length > 0 ||
    observations.loot.length > 0 ||
    observations.encounters.length > 0 ||
    observations.sightings.length > 0 ||
    observations.spells.length > 0
  );
}

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatObservedAt(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
