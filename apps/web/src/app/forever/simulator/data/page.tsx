import type { Metadata } from "next";
import Link from "next/link";
import { getForeverMechanicsReport } from "../../../../lib/forever-mechanics";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createHelperMetadata({
  title: "Forever simulator data evidence",
  description:
    "Review the current client mechanics extraction, talent rank coverage, dungeon-set relationships and outstanding simulation evidence.",
  path: "/forever/simulator/data",
});
export default async function SimulatorDataPage(): Promise<React.JSX.Element> {
  const report = await getForeverMechanicsReport();
  return (
    <article className="forever-reference-page">
      <header className="forever-reference-hero">
        <Link href="/forever/simulator">← Simulator</Link>
        <h1>Client data and model coverage</h1>
        <p>
          Extracted item fields, talent presentation and tested combat behavior are different
          layers. This report shows what the current client actually provides.
        </p>
      </header>
      {!report ? (
        <section className="panel">
          <h2>No current-client snapshot imported</h2>
          <p>
            Run <code>pnpm extract:forever:mechanics</code> on the installation containing the beta
            client.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <span className="eyebrow">Client {report.clientVersion}</span>
            <h2>{report.items.toLocaleString()} equippable item records</h2>
            <p>
              {report.itemsWithResolvedFields.toLocaleString()} have resolved base fields ·{" "}
              {report.sets} sets · {report.setEffects.toLocaleString()} threshold effects.
            </p>
            <p className="muted">{report.note}</p>
            <p>
              Snapshot {report.checksum.slice(0, 12)} · captured{" "}
              {new Date(report.capturedAt).toISOString()}
            </p>
          </section>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Client talents</th>
                  <th>Layout review</th>
                  <th>Unresolved rank text</th>
                </tr>
              </thead>
              <tbody>
                {report.classes.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.talents}</td>
                    <td>
                      {row.unresolvedLayouts
                        ? `${row.unresolvedLayouts} positions need review`
                        : "On client grid"}
                    </td>
                    <td>{row.unresolvedRankText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="panel">
            <summary>Unavailable encrypted source records</summary>
            <p>Encrypted records are not guessed or replaced with Classic data.</p>
            <ul>
              {report.sourceIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      <p>
        <Link href="/forever/encyclopedia/changes">
          Official patch announcements and source updates →
        </Link>
      </p>
    </article>
  );
}
