import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readLocalSimulatorReviews } from "../../../../lib/forever-simulator-local-reviews";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Local simulation review · Forever Helper",
  robots: { index: false, follow: false },
};

export default async function LocalSimulatorReviewPage(): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV !== "development") notFound();
  const listing = await readLocalSimulatorReviews();
  return (
    <article className="forever-reference-page">
      <header className="forever-reference-hero">
        <Link className="helper-back-link" href="/forever/simulator">
          ← Simulator
        </Link>
        <span className="eyebrow">Local research · Not published recommendations</span>
        <h1>Build review</h1>
        <p>
          Inspect the exact saved setup. Preview builds are still being audited; only completed case
          reviews receive the reviewed label.
        </p>
      </header>
      {listing.status !== "ready" ? (
        <section className="panel">
          <h2>No local campaign to review</h2>
          <p>
            Run <code>pnpm simulator:prebis:update</code> and wait for core feedback to finish.
            Review links are generated separately; opening this page never starts a simulation.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <p>
              Campaign <code>{listing.identity.slice(0, 12)}</code> · Browser release{" "}
              <code>{listing.release}</code>.
            </p>
            <p>
              This is saved evidence, not a live process monitor. A changing progress file alone
              does not prove a job is running. Refresh to read new completed stages.
            </p>
          </section>
          {listing.cases.map((entry) => (
            <section className="panel" key={entry.id} aria-labelledby={`review-${entry.id}`}>
              <span className="eyebrow">
                {entry.faction} · {entry.scenario}
              </span>
              <h2 id={`review-${entry.id}`}>
                {entry.spec.replaceAll("_", " ").replace("/", " · ")}
              </h2>
              <p>
                <strong>
                  {entry.status === "reviewed"
                    ? "Reviewed local build"
                    : entry.status === "preview"
                      ? "Preview · Final audits unfinished"
                      : "Build link not ready"}
                </strong>{" "}
                · {entry.stage}
              </p>
              {entry.referenceDps !== null ? (
                <p>
                  Core-feedback reference: {entry.referenceDps.toFixed(2)} modeled DPS across
                  400,000 measurements. This is scenario-specific, not a cross-class ranking.
                </p>
              ) : null}
              {entry.warnings.length ? (
                <ul>
                  {entry.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {entry.href ? (
                <details>
                  <summary>Review the import warning and open this exact build</summary>
                  <p>
                    Save your current simulator character first. Opening the build replaces gear,
                    enchants, talents, rotation, race, professions, buffs, consumes and encounter in
                    this browser. It does not change website defaults.
                  </p>
                  {entry.requiresProvisionalEnchantOptIn ? (
                    <p>
                      Provisional proc models stay OFF after opening this link. To use this
                      scenario, open Main Hand → Change enchant in the engine, then explicitly check
                      “Allow provisional proc models (unverified Forever behavior)” before
                      simulating. Repeat after a reload. The build link never enables these models.
                    </p>
                  ) : null}
                  <a className="button" href={entry.href} target="_blank" rel="noreferrer">
                    {entry.status === "reviewed"
                      ? "Open reviewed build ↗"
                      : "Open unfinished preview ↗"}
                  </a>
                </details>
              ) : (
                <p>
                  No current verified browser link has been generated for this case. Old previews
                  are not silently promoted when the calculations finish.
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </article>
  );
}
