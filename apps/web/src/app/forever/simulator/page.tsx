import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ForeverSimulatorClassSelector } from "../../../components/forever-simulator-class-selector";
import { ForeverDpsRankingLinks } from "../../../components/forever-dps-ranking-links";
import { getSimulatorClass } from "../../../lib/forever-simulator-directory";
import { readSimulatorManifest } from "../../../lib/forever-simulator";
import { createHelperMetadata } from "../../../lib/seo";
import { withHelperBasePath } from "../../../lib/site-path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever combat simulator",
  description:
    "Compare Forever gear, talents, rotations and dungeon-set combinations across every supported WoWSims class, tank profile and raid simulation.",
  path: "/forever/simulator",
});

interface ForeverSimulatorPageProps {
  readonly searchParams: Promise<{ readonly class?: string | readonly string[] }>;
}

export default async function ForeverSimulatorPage({
  searchParams,
}: ForeverSimulatorPageProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const selectedClass = getSimulatorClass(
    typeof query.class === "string" ? query.class : undefined,
  );
  const manifest = await readSimulatorManifest();
  return (
    <article className="forever-reference-page simulator-directory">
      <header className="forever-reference-hero">
        <Link className="helper-back-link" href="/forever">
          ← Forever Helper
        </Link>
        <span className="eyebrow">Gear · Talents · Rotations</span>
        <h1>Forever simulator</h1>
        <p>
          Your character. Your next upgrade. Find the gear, talents and rotation that work together.
        </p>
      </header>
      <ForeverSimulatorClassSelector selectedClass={selectedClass?.slug ?? null} />
      <ForeverDpsRankingLinks />
      {process.env.NODE_ENV === "development" ? (
        <p>
          <Link href="/forever/simulator/review">Review local calculated builds →</Link>
        </p>
      ) : null}
      {selectedClass ? (
        <section
          className="simulator-profile-picker"
          id="simulator-profiles"
          aria-labelledby="simulator-profile-heading"
          style={{ "--forever-class": selectedClass.color } as React.CSSProperties}
        >
          <header>
            <Image
              className="forever-icon"
              src={withHelperBasePath(selectedClass.icon)}
              width={52}
              height={52}
              alt=""
            />
            <div>
              <span className="eyebrow">Choose your playstyle</span>
              <h2 id="simulator-profile-heading">{selectedClass.name}</h2>
            </div>
          </header>
          <div className="simulator-profile-options">
            {selectedClass.profiles.map((profile) => (
              <Link key={profile.slug} href={`/forever/simulator/${profile.slug}`}>
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.role === "tank"
                      ? "Threat, survival & equipment"
                      : "Damage, talents & equipment"}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <Link className="simulator-raid-link" href="/forever/simulator/raid">
        <span className="simulator-raid-mark" aria-hidden="true">
          ⚔
        </span>
        <span>
          <strong>Build a raid</strong>
          <small>Compare your lineup, party buffs and raid-wide damage.</small>
        </span>
        <span aria-hidden="true">→</span>
      </Link>
      <details className="simulator-evidence simulator-directory-evidence">
        <summary>Forever beta · Data and model coverage</summary>
        <p>
          Supported does not mean every beta mechanic is confirmed. Tank profiles have provisional
          incoming-damage and resource assumptions; healing-only engines are not implemented
          upstream.
        </p>
        {manifest ? (
          <p>
            {manifest.itemCount.toLocaleString()} selectable items ·{" "}
            {(manifest.currentItemCount ?? manifest.itemCount).toLocaleString()} current Forever
            records
            {manifest.provisionalItemCount
              ? ` · ${manifest.provisionalItemCount.toLocaleString()} provisional Classic pre-raid references`
              : ""}{" "}
            · {manifest.excludedModeledItems.toLocaleString()} projected items excluded · Engine{" "}
            {manifest.revision.slice(0, 10)}.
          </p>
        ) : (
          <p>
            The engine has not been prepared on this installation. Run{" "}
            <code>pnpm simulator:prepare</code> once, then refresh.
          </p>
        )}
        <Link href="/forever/simulator/data">
          Review current client extraction and model coverage →
        </Link>
        <Link href="/forever/encyclopedia/changes">
          Review official updates and data freshness →
        </Link>
      </details>
    </article>
  );
}
