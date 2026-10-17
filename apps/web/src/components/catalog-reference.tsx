import {
  referenceIndexGaps,
  type ReferenceClientItem,
  type ReferenceRecord,
} from "@wow-trader/reference-data";

interface CatalogReferenceProps {
  readonly record: ReferenceRecord | null;
  readonly clientItem?: ReferenceClientItem;
}

export function CatalogReference({
  record,
  clientItem,
}: CatalogReferenceProps): React.JSX.Element | null {
  if (!record) return null;
  const gaps = referenceIndexGaps(record, clientItem);
  return (
    <section className="panel" aria-labelledby="catalog-reference-heading">
      <span className="eyebrow">Attributed external reference</span>
      <h2 id="catalog-reference-heading">
        {record.kind === "item"
          ? "Item details & source context"
          : "Quest requirements, objectives & rewards"}
      </h2>
      <p>
        <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer">
          Wowhead {record.game === "forever" ? "Forever" : "TBC"} reference
        </a>
        {" · "}Captured{" "}
        <time dateTime={record.capturedAt}>
          {new Date(record.capturedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}
        </time>
        . These facts are kept separate from our exact-build client records and player observations.
        A listed source is not our own verified drop or a guarantee of current availability.
      </p>
      {gaps.length > 0 && (
        <p role="status">
          <strong>Partial reference.</strong> Missing:{" "}
          {gaps.map((gap) => missingDetailLabel(gap)).join(", ")}.
        </p>
      )}
      {record.tooltipLines.length > 0 && (
        <ul>
          {record.tooltipLines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {record.quickFacts.length > 0 && (
        <>
          <h3>Requirements & quest facts</h3>
          <ul>
            {record.quickFacts.map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        </>
      )}
      {record.objectives.length > 0 && (
        <>
          <h3>Objectives</h3>
          {record.objectives.map((objective, index) => (
            <p key={index}>{objective}</p>
          ))}
        </>
      )}
      {record.description && (
        <>
          <h3>Quest text</h3>
          <p>{record.description}</p>
        </>
      )}
      {record.rewards.length > 0 && (
        <>
          <h3>Rewards & gains</h3>
          <ul>
            {record.rewards.map((reward, index) => (
              <li key={index}>{reward}</li>
            ))}
          </ul>
        </>
      )}
      {record.relations.length > 0 && (
        <>
          <h3>{record.kind === "item" ? "Acquisition & use references" : "Quest contacts"}</h3>
          <ul>
            {record.relations.map((relation, index) => (
              <li key={index}>
                {relation.relation.replaceAll("-", " ")}:{" "}
                <a
                  href={`https://www.wowhead.com/${record.game}/${relation.kind}=${relation.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {relation.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function missingDetailLabel(gap: string): string {
  const labels: Readonly<Record<string, string>> = {
    missing_item_classification: "item type",
    missing_item_tooltip: "full tooltip",
    missing_acquisition_or_use_context: "acquisition or crafting sources",
    missing_quest_objectives: "objectives",
    missing_quest_requirements: "level requirements",
    missing_quest_giver: "quest giver",
    missing_quest_rewards: "rewards",
    missing_client_detail_str: "verified Strength",
    missing_client_detail_agi: "verified Agility",
    missing_client_detail_sta: "verified Stamina",
    missing_client_detail_int: "verified Intellect",
    missing_client_detail_spi: "verified Spirit",
    missing_client_detail_dmgmin1: "verified minimum weapon damage",
    missing_client_detail_dmgmax1: "verified maximum weapon damage",
    missing_client_detail_speed: "verified weapon speed",
  };
  return labels[gap] ?? gap.replace(/^missing_client_detail_/, "verified ").replaceAll("_", " ");
}
