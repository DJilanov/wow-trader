import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSimulatorSpec } from "@wow-trader/forever-data/simulator";
import { getSimulatorClass } from "../../../../lib/forever-simulator-directory";
import { ForeverSimulatorReviewedWorkspace } from "../../../../components/forever-simulator-reviewed-workspace";
import {
  buildsForPresentation,
  readSimulatorPresentation,
} from "../../../../lib/forever-simulator-presentation";
import {
  readLocalSimulatorReviews,
  reviewedBuildsForSimulator,
} from "../../../../lib/forever-simulator-local-reviews";
import { createHelperMetadata } from "../../../../lib/seo";
import { readPublishedSimulatorReviews } from "../../../../lib/forever-simulator-published-reviews";
import { withHelperBasePath } from "../../../../lib/site-path";
import { simulatorBuildQuery } from "../../../../lib/forever-simulator-frame-navigation";

export const dynamic = "force-dynamic";
interface SimulatorPageProps {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<{ readonly build?: string | readonly string[] }>;
}
export async function generateMetadata({ params }: SimulatorPageProps): Promise<Metadata> {
  const spec = getSimulatorSpec((await params).slug);
  return createHelperMetadata({
    title: `Forever ${spec?.name ?? "combat"} simulator`,
    description:
      "Compare equipment, talent builds, set bonuses, rotations and encounter settings using the versioned Forever beta simulation engine.",
    path: `/forever/simulator/${spec?.slug ?? ""}`,
  });
}
export default async function SimulatorPage({
  params,
  searchParams,
}: SimulatorPageProps): Promise<React.JSX.Element> {
  const spec = getSimulatorSpec((await params).slug);
  if (!spec) notFound();
  const buildQuery = simulatorBuildQuery((await searchParams).build);
  const classEntry = getSimulatorClass(spec.className?.toLowerCase());
  const presentation = await readSimulatorPresentation(spec.page);
  const manifest = presentation?.manifest ?? null;
  const builds =
    presentation && process.env.NODE_ENV === "development"
      ? buildsForPresentation(
          reviewedBuildsForSimulator(
            await readLocalSimulatorReviews(),
            presentation.sourceRelease,
            spec.page,
          ),
          presentation,
          spec.page,
        )
      : presentation
        ? await readPublishedSimulatorReviews(presentation, spec.page)
        : [];
  return (
    <article
      className="forever-simulator-workspace"
      style={{ "--forever-class": classEntry?.color ?? "var(--gold)" } as React.CSSProperties}
    >
      <header className="simulator-workspace-header">
        <div>
          <Link className="helper-back-link" href="/forever/simulator">
            ← Choose a class
          </Link>
          <div className="simulator-character-heading">
            {classEntry ? (
              <Image
                src={withHelperBasePath(classEntry.icon)}
                width={60}
                height={60}
                className="forever-icon"
                alt=""
              />
            ) : null}
            <div>
              <span className="eyebrow">{classEntry?.name ?? "Raid"} · Combat simulator</span>
              <h1>{spec.name}</h1>
            </div>
          </div>
        </div>
        {classEntry && classEntry.profiles.length > 1 ? (
          <nav aria-label={`${classEntry.name} simulator profiles`}>
            {classEntry.profiles.map((entry) => (
              <Link
                key={entry.slug}
                aria-current={entry.slug === spec.slug ? "page" : undefined}
                href={`/forever/simulator/${entry.slug}`}
              >
                {entry.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <details className="simulator-evidence simulator-workspace-evidence">
        <summary>Beta model · assumptions and data sources</summary>
        <p>
          Talents and mechanics come from a pinned Forever engine. Real-source equipment is
          included; projected gear and its default rankings are excluded. Some proc and server-side
          rules remain provisional. Results are scenario estimates, not a guarantee of in-game
          performance or a universal BiS list.
        </p>
        <p>
          Daily announcements and talent-source updates do not automatically change this combat
          model. Engine {manifest?.revision.slice(0, 10) ?? "not prepared"} must be reviewed and
          rebuilt separately.
        </p>
        <Link href="/forever/encyclopedia/changes">Check the latest official notes →</Link>
      </details>
      {manifest ? (
        <ForeverSimulatorReviewedWorkspace
          key={`${manifest.release}:${spec.page}:${buildQuery}`}
          title={`${spec.name} combat simulator`}
          src={withHelperBasePath(`/forever-sim/${manifest.release}/${spec.page}/${buildQuery}`)}
          builds={builds}
        />
      ) : (
        <section className="panel">
          <h2>Engine preparation required</h2>
          <p>
            Run <code>pnpm simulator:prepare</code> in this installation. This builds all supported
            classes together; no upstream website is embedded.
          </p>
        </section>
      )}
    </article>
  );
}
