import Link from "next/link";
import { notFound } from "next/navigation";
import type { getForeverQuestDirectory } from "../lib/forever-world";
import {
  filterQuestDirectory,
  QUEST_DIRECTORY_PAGE_SIZE,
  questDirectoryHref,
  type QuestDirectoryFilters,
} from "../lib/forever-quest-directory";
import { ForeverEncyclopediaNav } from "./forever-encyclopedia-nav";
import { ForeverWorldState } from "./forever-world-state";

interface QuestDirectoryProps {
  readonly data: NonNullable<Awaited<ReturnType<typeof getForeverQuestDirectory>>>;
  readonly filters: QuestDirectoryFilters;
  readonly page: number;
}

export function ForeverQuestDirectory({
  data,
  filters,
  page,
}: QuestDirectoryProps): React.JSX.Element {
  const matches = filterQuestDirectory(data.titledQuests, filters);
  const pageCount = Math.max(1, Math.ceil(matches.length / QUEST_DIRECTORY_PAGE_SIZE));
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) notFound();
  const entries = matches.slice(
    (page - 1) * QUEST_DIRECTORY_PAGE_SIZE,
    page * QUEST_DIRECTORY_PAGE_SIZE,
  );
  const referenced = data.titledQuests.filter((entry) => entry.referenceCapturedAt !== null).length;
  return (
    <article className="forever-reference-page forever-world-page quest-directory-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia">
            Forever Encyclopedia
          </Link>
          <span className="eyebrow">Quest objectives, requirements and source evidence</span>
          <h1>WoW Forever quests</h1>
          <p>
            Find a quest by name or ID, check its level and faction, and open the objectives,
            rewards and sources. Reviewed external references remain separate from exact-build
            client records and in-game observations.
          </p>
        </div>
        <ForeverWorldState build={data.build} />
      </header>
      <ForeverEncyclopediaNav active="quests" />
      <form
        className="quest-directory-filters"
        action="/tools/forever/encyclopedia/quests"
        method="get"
      >
        <label>
          Quest name or ID
          <input name="q" type="search" maxLength={100} defaultValue={filters.query} />
        </label>
        <label>
          Faction
          <select name="side" defaultValue={filters.side}>
            <option value="all">All factions</option>
            <option value="alliance">Alliance, including shared quests</option>
            <option value="horde">Horde, including shared quests</option>
            <option value="both">Both factions only</option>
          </select>
        </label>
        <label>
          Quest level from
          <input
            name="min"
            type="number"
            min={1}
            max={60}
            defaultValue={filters.minimumLevel ?? ""}
          />
        </label>
        <label>
          Quest level to
          <input
            name="max"
            type="number"
            min={1}
            max={60}
            defaultValue={filters.maximumLevel ?? ""}
          />
        </label>
        <button type="submit">Find quests</button>
        <Link href="/forever/encyclopedia/quests">Reset</Link>
      </form>
      <section className="forever-quest-lines" aria-labelledby="quest-directory-title">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">
              Page {page} of {pageCount}
            </span>
            <h2 id="quest-directory-title">
              {matches.length.toLocaleString("en-GB")} matching quests
            </h2>
          </div>
          <p>Unknown levels or faction restrictions do not match a filter that requires them.</p>
        </div>
        {entries.length ? (
          <div>
            {entries.map((entry) => (
              <article key={entry.questId}>
                <small>
                  Quest {entry.questId}
                  {entry.questLevel !== null ? ` / Level ${entry.questLevel}` : ""}
                  {entry.side
                    ? ` / ${entry.side === "both" ? "Both factions" : entry.side === "alliance" ? "Alliance" : "Horde"}`
                    : ""}
                </small>
                <h3>
                  <Link href={`/forever/encyclopedia/quests/${entry.questId}`}>{entry.title}</Link>
                </h3>
                <p>
                  {entry.evidenceKind === "published_reference"
                    ? "Reviewed external reference"
                    : entry.evidenceKind === "client_task"
                      ? "Named client record"
                      : "In-game title observation"}
                  {entry.minimumLevel !== null ? ` / Requires level ${entry.minimumLevel}` : ""}
                </p>
                {entry.referenceCapturedAt && (
                  <small>
                    Reference captured {entry.referenceCapturedAt.toISOString().slice(0, 10)} UTC
                  </small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="forever-honest-empty">
            No named quests match these filters. Try another name, remove the level range or reset
            the faction.
          </p>
        )}
      </section>
      <nav className="workspace-pagination" aria-label="Quest directory pages">
        {page > 1 ? (
          <Link href={questDirectoryHref(page - 1, filters)}>Previous page</Link>
        ) : (
          <span aria-disabled="true">Previous page</span>
        )}
        {page < pageCount ? (
          <Link href={questDirectoryHref(page + 1, filters)}>Next page</Link>
        ) : (
          <span aria-disabled="true">Next page</span>
        )}
      </nav>
      <details className="quest-directory-structure">
        <summary>Client quest lines and source coverage</summary>
        <section className="forever-world-metrics" aria-label="Quest coverage">
          <Metric value={data.titledQuests.length} label="Named quests" />
          <Metric value={referenced} label="Reviewed references" />
          <Metric value={data.lines.length} label="Client quest lines" />
          <Metric value={data.questCount} label="Structural client IDs" />
        </section>
        <p>
          Line membership is not automatically a hard prerequisite. Untitled IDs are not indexed as
          complete quest guides.
        </p>
        {data.lines.map(({ questLine, members }) => (
          <section key={questLine.questLineId}>
            <h2>{questLine.name}</h2>
            {questLine.description && <p>{questLine.description}</p>}
            <ol>
              {members.map((member) => (
                <li key={member.relationId}>
                  <Link href={`/forever/encyclopedia/quests/${member.questId}`}>
                    Quest {member.questId}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </details>
    </article>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): React.JSX.Element {
  return (
    <div>
      <strong>{value.toLocaleString("en-GB")}</strong>
      <span>{label}</span>
    </div>
  );
}
