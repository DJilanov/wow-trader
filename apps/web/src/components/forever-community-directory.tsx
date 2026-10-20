import Link from "next/link";

import type { CommunityReferenceDirectoryPage } from "../lib/community-reference";
import { ForeverEncyclopediaNav } from "./forever-encyclopedia-nav";

export function ForeverCommunityDirectory({
  data,
}: {
  readonly data: CommunityReferenceDirectoryPage;
}): React.JSX.Element {
  const plural = data.kind === "npc" ? "NPCs" : "Objects";
  const singular = data.kind === "npc" ? "NPC" : "object";
  const basePath = `/forever/encyclopedia/${data.kind}s`;
  return (
    <article className="forever-reference-page forever-world-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia">
            <span aria-hidden="true">←</span> Forever Encyclopedia
          </Link>
          <span className="eyebrow">Published, evidence-qualified entity directory</span>
          <h1>{plural}</h1>
          <p>
            Browse named {plural.toLowerCase()} with useful locations, relationships, profile facts,
            or exact-build observations. Identity conflicts and empty records stay out of search.
          </p>
        </div>
        <div className="build-stamp">
          <span>Published entities</span>
          <strong>{data.total.toLocaleString("en-GB")}</strong>
          <small>{data.publishedAt.toISOString().slice(0, 10)} UTC</small>
        </div>
      </header>
      <ForeverEncyclopediaNav active={data.kind === "npc" ? "npcs" : "objects"} />
      <section className="forever-quest-lines" aria-labelledby="community-directory-heading">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">
              Page {data.page.toLocaleString("en-GB")} of {data.pageCount.toLocaleString("en-GB")}
            </span>
            <h2 id="community-directory-heading">{plural} in this published snapshot</h2>
          </div>
          <p>Each result links to its evidence, map coordinates, and normalized entity graph.</p>
        </div>
        <div>
          {data.entries.map((entry) => (
            <article key={entry.id}>
              <small>
                {singular} {entry.id}
              </small>
              <h3>
                <Link href={`${basePath}/${entry.id}`}>{entry.name}</Link>
              </h3>
              <p>
                {entry.searchSurface.outgoingLinks.length.toLocaleString("en-GB")} linked search
                surface{entry.searchSurface.outgoingLinks.length === 1 ? "" : "s"}
              </p>
            </article>
          ))}
        </div>
      </section>
      <nav className="workspace-pagination" aria-label={`${plural} directory pages`}>
        {data.page > 1 ? (
          <Link href={directoryPageHref(basePath, data.page - 1)}>← Previous page</Link>
        ) : (
          <span aria-disabled="true">← Previous page</span>
        )}
        {data.page < data.pageCount ? (
          <Link href={directoryPageHref(basePath, data.page + 1)}>Next page →</Link>
        ) : (
          <span aria-disabled="true">Next page →</span>
        )}
      </nav>
    </article>
  );
}

function directoryPageHref(basePath: string, page: number): string {
  return page === 1 ? basePath : `${basePath}/page/${page}`;
}
