import type { Metadata } from "next";
import console from "node:console";
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
import { simulatorBuildForLink } from "../../../../lib/forever-simulator-build-selection";
import {
  readSimulatorPresetSafety,
  remapSimulatorPresetHref,
} from "../../../../lib/forever-simulator-preset-safety";

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
  const requestedBuild = (await searchParams).build;
  const buildQuery = simulatorBuildQuery(requestedBuild);
  const classEntry = getSimulatorClass(spec.className?.toLowerCase());
  const presentation = await readSimulatorPresentation(spec.page);
  const manifest = presentation?.manifest ?? null;
  const reviewedBuilds =
    presentation &&
    process.env.NODE_ENV === "development" &&
    !manifest?.files["kfc-item-weapon-skills.json"]
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
  let safetyRelease: string | null = null;
  let presetSafetyUnavailable = false;
  if (presentation) {
    try {
      safetyRelease = await readSimulatorPresetSafety(presentation, spec.page);
    } catch (error: unknown) {
      console.warn(
        "[simulator] Preset safety selection unavailable",
        error instanceof Error ? error.message : "Unknown error",
      );
      presetSafetyUnavailable = true;
    }
  }
  const displayRelease = safetyRelease ?? manifest?.release;
  const builds =
    safetyRelease && manifest
      ? reviewedBuilds.map((build) => ({
          ...build,
          href: build.href
            ? remapSimulatorPresetHref(build.href, spec.page, manifest.release, safetyRelease)
            : null,
        }))
      : reviewedBuilds;
  const linkedBuild = simulatorBuildForLink(builds, requestedBuild);
  return (
    <article
      className="forever-simulator-workspace"
      style={{ "--forever-class": classEntry?.color ?? "var(--gold)" } as React.CSSProperties}
    >
      <header className="simulator-workspace-header">
        <div>
          <div className="simulator-workspace-links">
            <Link className="helper-back-link" href="/forever/simulator">
              ← Choose a class
            </Link>
            <Link
              className="helper-back-link"
              href={
                spec.role === "tank" ? "/forever/tier-list/tanks/solo" : "/forever/tier-list/solo"
              }
              prefetch={false}
            >
              {spec.role === "tank" ? "Solo / dungeon tank rankings →" : "Solo DPS rankings →"}
            </Link>
            <Link
              className="helper-back-link"
              href={spec.role === "tank" ? "/forever/tier-list/tanks" : "/forever/tier-list"}
              prefetch={false}
            >
              {spec.role === "tank" ? "Raid tank rankings →" : "Raid DPS rankings →"}
            </Link>
          </div>
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
        {manifest?.files["kfc-item-weapon-skills.json"] ? (
          <p>
            Item-granted weapon skill is ignored in this model. Items retain their other stats and
            effects; talents and racials are unchanged.
          </p>
        ) : null}
        <Link href="/forever/encyclopedia/changes">Check the latest official notes →</Link>
      </details>
      {!presetSafetyUnavailable && manifest?.files["kfc-item-weapon-skills.json"] ? (
        <p className="simulator-reviewed-warning" role="status">
          Item weapon-skill bonuses are now ignored. Saved characters are unchanged—load a current
          preset to use the revised gear.
        </p>
      ) : null}
      {presetSafetyUnavailable ? (
        <section className="panel" role="status">
          <h2>Preset update under review</h2>
          <p>
            Verified pre-raid presets are temporarily unavailable. We will not substitute older,
            unaudited gear. Your saved characters remain in this browser.
          </p>
        </section>
      ) : manifest ? (
        <ForeverSimulatorReviewedWorkspace
          key={`${displayRelease}:${spec.page}:${buildQuery}`}
          title={`${spec.name} combat simulator`}
          src={withHelperBasePath(
            linkedBuild?.href ?? `/forever-sim/${displayRelease}/${spec.page}/${buildQuery}`,
          )}
          builds={builds}
          initialBuildId={linkedBuild?.id}
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
