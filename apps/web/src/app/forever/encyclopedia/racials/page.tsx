import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverIcon } from "../../../../components/forever-icon";
import { getForeverSnapshot } from "../../../../lib/forever";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Racial Abilities",
  description:
    "Compare WoW Forever Alliance and Horde racials, compatible classes, and race-specific Priest abilities observed in the BlizzCon demo.",
  path: "/forever/encyclopedia/racials",
  keywords: ["WoW Forever racials", "WoW Forever races", "WoW Forever Priest racials"],
});

export default async function ForeverRacialsPage(): Promise<React.JSX.Element> {
  try {
    const snapshot = await getForeverSnapshot();
    if (!snapshot) return <DataUnavailable title="Forever racial data is waiting for review" />;
    return (
      <article className="forever-reference-page">
        <ReferenceHeader
          eyebrow="Alliance and Horde"
          title="Racial abilities"
          description="Compare the ten demo races and the class combinations observed for each. Priest race abilities remain separate because they are class-specific spells, not ordinary racials."
        />
        <ForeverEncyclopediaNav active="racials" />
        <div className="forever-faction-grid">
          {Object.entries(snapshot.data.racials).map(([faction, races]) => (
            <section className={`forever-faction ${faction.toLowerCase()}`} key={faction}>
              <h2>{faction}</h2>
              <div>
                {races.map((race) => (
                  <article className="forever-race-card" key={race.race}>
                    <header>
                      <ForeverIcon
                        alt=""
                        iconKey={race.icon}
                        snapshotChecksum={snapshot.checksum}
                      />
                      <span>
                        <strong>{race.race}</strong>
                        <small>{race.classes.join(" · ")}</small>
                      </span>
                    </header>
                    <ul className="forever-ability-list">
                      {race.abilities.map(([name, description, icon]) => (
                        <AbilityRow
                          description={description}
                          icon={icon}
                          key={name}
                          name={name}
                          snapshotChecksum={snapshot.checksum}
                        />
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        {Object.entries(snapshot.data.class_racials).map(([className, classRacials]) => (
          <section className="forever-class-racials" key={className}>
            <div className="forever-section-heading">
              <div>
                <span className="eyebrow">Class-specific racial spells</span>
                <h2>{className} race abilities</h2>
              </div>
              <p>{classRacials.note}</p>
            </div>
            <div className="forever-class-racial-grid">
              {Object.entries(classRacials.races).map(([race, abilities]) => (
                <article key={race}>
                  <h3>{race}</h3>
                  <ul className="forever-ability-list">
                    {abilities.map(([name, description, icon]) => (
                      <AbilityRow
                        description={description}
                        icon={icon}
                        key={name}
                        name={name}
                        snapshotChecksum={snapshot.checksum}
                      />
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <small className="forever-source-line">{classRacials.sources}</small>
          </section>
        ))}
        <ForeverSnapshotNotice generated={snapshot.generated} checksum={snapshot.checksum} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever racial data is temporarily unavailable" />;
  }
}

function ReferenceHeader({
  description,
  eyebrow,
  title,
}: {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <header className="forever-reference-hero">
      <Link className="helper-back-link" href="/forever/encyclopedia">
        <span aria-hidden="true">←</span> Forever Encyclopedia
      </Link>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function AbilityRow({
  description,
  icon,
  name,
  snapshotChecksum,
}: {
  readonly description: string;
  readonly icon: string;
  readonly name: string;
  readonly snapshotChecksum: string;
}): React.JSX.Element {
  return (
    <li>
      <ForeverIcon alt="" iconKey={icon} snapshotChecksum={snapshotChecksum} />
      <span>
        <strong>{name}</strong>
        <small>{description}</small>
      </span>
    </li>
  );
}
