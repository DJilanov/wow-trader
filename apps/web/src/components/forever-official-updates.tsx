import Link from "next/link";
import type { OfficialChange } from "@wow-trader/forever-data/updates";
import type { ForeverOfficialUpdates } from "../lib/forever-updates";

interface ForeverOfficialUpdatesProps extends ForeverOfficialUpdates {
  readonly selectedClass: string | null;
}

const kindLabels: Readonly<Record<OfficialChange["kind"], string>> = {
  tuning: "Tuning",
  structure: "Talent structure",
  tooltip: "Tooltip or visual",
  bug_fix: "Bug fix",
  general: "Update",
};

export function ForeverOfficialUpdates({
  publication,
  health,
  selectedClass,
}: ForeverOfficialUpdatesProps): React.JSX.Element {
  const posts =
    publication?.notes.posts
      .filter((post) => post.changes.length > 0)
      .map((post) => ({
        ...post,
        changes: post.changes.filter(
          (change) => !selectedClass || change.className === selectedClass,
        ),
      }))
      .filter((post) => post.changes.length > 0)
      .sort((a, b) => b.postNumber - a.postNumber) ?? [];
  return (
    <section className="panel official-updates" aria-labelledby="official-updates-heading">
      <div className="official-updates-heading">
        <div>
          <span className="eyebrow">Direct from Blizzard</span>
          <h2 id="official-updates-heading">Official development notes</h2>
        </div>
        <a
          className="helper-back-link"
          href="https://eu.forums.blizzard.com/en/wow/t/631316"
          target="_blank"
          rel="noreferrer"
        >
          Original topic ↗
        </a>
      </div>
      <p className="muted">
        Checked daily. Announced changes are separate from client-verified talents and tested
        simulator mechanics.
      </p>
      {health?.lastSuccessAt ? (
        <p className="muted">
          Last successful check:{" "}
          <time dateTime={health.lastSuccessAt}>{formatDate(health.lastSuccessAt)}</time>
          {health.error ? " · Latest check failed; showing the last good update." : ""}
        </p>
      ) : null}
      {!publication ? (
        <p>
          No validated official update has been imported yet. The other change histories remain
          available below.
        </p>
      ) : posts.length === 0 ? (
        <p>No official notes match this class.</p>
      ) : (
        posts.map((post, index) => {
          const subjects = [
            ...new Set(post.changes.flatMap((change) => (change.subject ? [change.subject] : []))),
          ];
          const classes = [
            ...new Set(
              post.changes.flatMap((change) => (change.className ? [change.className] : [])),
            ),
          ];
          const kindCounts = new Map<string, number>();
          for (const change of post.changes)
            kindCounts.set(
              kindLabels[change.kind],
              (kindCounts.get(kindLabels[change.kind]) ?? 0) + 1,
            );
          return (
            <details
              className="official-update-post"
              key={`${post.postId}:${post.contentSha256}`}
              open={index === 0}
            >
              <summary>
                <span>
                  <strong>Development update · {formatDate(post.createdAt)}</strong>
                  <small>
                    {post.changes.length} changes
                    {post.revision > 1 ? ` · Revised ${post.revision - 1} time(s)` : ""}
                  </small>
                </span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <p>{classes.length ? classes.join(" · ") : "General game updates"}</p>
              <div className="official-update-kinds">
                {[...kindCounts].map(([label, count]) => (
                  <span key={label}>
                    {label} <strong>{count}</strong>
                  </span>
                ))}
              </div>
              {subjects.length ? (
                <p>
                  <strong>Affected abilities and systems:</strong> {subjects.join(", ")}
                </p>
              ) : null}
              <p className="muted">
                Source edited <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>.
                Exact text, numerical tuning and developer explanations are available in the
                official post.
              </p>
              <div className="official-update-actions">
                <a href={post.sourceUrl} target="_blank" rel="noreferrer">
                  Read Blizzard’s full notes ↗
                </a>
                <Link href="/forever/simulator">Compare builds in the simulator →</Link>
              </div>
            </details>
          );
        })
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
