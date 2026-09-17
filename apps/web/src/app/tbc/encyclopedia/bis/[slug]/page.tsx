import type { AdaptedCatalogItem, EquipmentSlot } from "@wow-trader/bis";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "../../../../../components/data-unavailable";
import { ItemIcon } from "../../../../../components/item-icon";
import { JsonLd } from "../../../../../components/json-ld";
import { getTbcBisCatalog } from "../../../../../lib/bis-catalog";
import { getTbcBisList, TBC_BIS_CLASSES } from "../../../../../lib/bis-directory";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface BisPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

interface SlotGroup {
  readonly slot: EquipmentSlot;
  readonly label: string;
}

const slotGroups: readonly SlotGroup[] = [
  { slot: "head", label: "Head" },
  { slot: "neck", label: "Neck" },
  { slot: "shoulder", label: "Shoulder" },
  { slot: "back", label: "Back" },
  { slot: "chest", label: "Chest" },
  { slot: "wrist", label: "Wrist" },
  { slot: "hands", label: "Hands" },
  { slot: "waist", label: "Waist" },
  { slot: "legs", label: "Legs" },
  { slot: "feet", label: "Feet" },
  { slot: "finger1", label: "Rings" },
  { slot: "trinket1", label: "Trinkets" },
  { slot: "mainHand", label: "Main hand" },
  { slot: "offHand", label: "Off hand" },
  { slot: "ranged", label: "Ranged / relic" },
];

export async function generateMetadata({ params }: BisPageProps): Promise<Metadata> {
  const { slug } = await params;
  const list = getTbcBisList(slug);
  return list
    ? createHelperMetadata({
        title: `TBC ${list.specializationName} ${list.className} BiS Candidates`,
        description: `Audit the build-aware TBC ${list.specializationName} ${list.className} best-in-slot candidate frontier by equipment slot, item stats, restrictions, effects, and set evidence.`,
        path: `/tbc/encyclopedia/bis/${list.slug}`,
        keywords: [
          `TBC ${list.specializationName} ${list.className} BiS`,
          `${list.className} best in slot TBC`,
          `TBC ${list.className} gear`,
        ],
      })
    : createHelperMetadata({
        title: "TBC BiS Candidate Lists",
        description:
          "Build-aware TBC best-in-slot candidate workspaces by class and specialization.",
        path: `/tbc/encyclopedia/bis/${encodeURIComponent(slug)}`,
        noIndex: true,
      });
}

export function generateStaticParams(): { readonly slug: string }[] {
  return TBC_BIS_CLASSES.flatMap(({ lists }) => lists.map(({ slug }) => ({ slug })));
}

export default async function BisPage({ params }: BisPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const list = getTbcBisList(slug);
  if (!list) notFound();

  try {
    const catalog = await getTbcBisCatalog();
    if (!catalog) {
      return <DataUnavailable title="This BiS workspace is waiting for a published TBC catalog" />;
    }

    const candidates = catalog.items
      .filter(
        (item) =>
          item.requiredLevel <= 70 &&
          item.availability !== "unavailable" &&
          (item.allowedClassIds.length === 0 || item.allowedClassIds.includes(list.classId)),
      )
      .sort(compareCatalogCandidates);
    const verifiedCount = candidates.filter(
      ({ availability }) => availability === "available",
    ).length;
    const effectSpellIds = new Set(candidates.flatMap(({ effectSpellIds }) => effectSpellIds));
    const candidateSetIds = new Set(
      candidates.flatMap(({ setId }) => (setId === null ? [] : [setId])),
    );
    const setBonusCount = catalog.setBonuses.filter(({ setId }) =>
      candidateSetIds.has(setId),
    ).length;

    return (
      <>
        <JsonLd
          data={createBreadcrumbJsonLd([
            { name: "KFC Helper", path: "/" },
            { name: "TBC Encyclopedia", path: "/tbc/encyclopedia" },
            {
              name: `${list.specializationName} ${list.className}`,
              path: `/tbc/encyclopedia/bis/${list.slug}`,
            },
          ])}
        />
        <article className="encyclopedia-page bis-workspace-page">
          <header className="item-library-header">
            <div>
              <Link className="helper-back-link" href="/tbc/encyclopedia">
                <span aria-hidden="true">←</span> TBC Encyclopedia
              </Link>
              <span className="eyebrow">{roleLabel(list.role)} model</span>
              <h1>
                {list.specializationName} {list.className}
              </h1>
              <p>
                The client catalog is connected and normalized below. This page deliberately keeps
                high-item-level records as candidates until the spec model, effects, phase, gems,
                and enchants are validated together.
              </p>
            </div>
            <div className="bis-model-state" aria-label="BiS publication state">
              <span>Publication gate</span>
              <strong>Candidate data</strong>
              <small>Not yet a ranked BiS claim</small>
            </div>
          </header>

          <section className="bis-audit-grid" aria-label="Catalog adapter audit">
            <div>
              <span>Eligible base records</span>
              <strong>{candidates.length.toLocaleString()}</strong>
              <small>Level and class filtered</small>
            </div>
            <div>
              <span>Availability verified</span>
              <strong>{verifiedCount.toLocaleString()}</strong>
              <small>{(candidates.length - verifiedCount).toLocaleString()} provisional</small>
            </div>
            <div>
              <span>Item effects</span>
              <strong>{effectSpellIds.size.toLocaleString()}</strong>
              <small>Require exact model rules</small>
            </div>
            <div>
              <span>Set bonuses</span>
              <strong>{setBonusCount.toLocaleString()}</strong>
              <small>Activated by full loadout</small>
            </div>
          </section>

          <section className="bis-candidate-browser" aria-labelledby="candidate-browser-heading">
            <div className="encyclopedia-section-heading">
              <div>
                <span className="eyebrow">Adapter output</span>
                <h2 id="candidate-browser-heading">Candidate frontier by slot</h2>
              </div>
              <span>Previewed by item level for auditing—not scored as BiS.</span>
            </div>
            <div className="bis-slot-grid">
              {slotGroups.map((group) => {
                const slotCandidates = candidates.filter(({ slots }) => slots.includes(group.slot));
                return (
                  <section key={group.slot}>
                    <header>
                      <h3>{group.label}</h3>
                      <span>{slotCandidates.length.toLocaleString()} records</span>
                    </header>
                    {slotCandidates.length > 0 ? (
                      <div>
                        {slotCandidates.slice(0, 4).map((item) => (
                          <CandidateItem item={item} key={item.itemId} />
                        ))}
                      </div>
                    ) : (
                      <p>No class-eligible client records in this build.</p>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        </article>
      </>
    );
  } catch {
    return <DataUnavailable title="This BiS workspace is temporarily unavailable" />;
  }
}

function CandidateItem({ item }: { readonly item: AdaptedCatalogItem }): React.JSX.Element {
  return (
    <Link href={`/tbc/encyclopedia/items/${item.itemId}`}>
      <ItemIcon fileDataId={item.iconFileDataId} quality={item.quality} size="small" />
      <span>
        <strong>{item.name}</strong>
        <small>
          Item level {item.itemLevel} ·{" "}
          {item.availability === "available" ? "Verified" : "Client only"}
        </small>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

function compareCatalogCandidates(left: AdaptedCatalogItem, right: AdaptedCatalogItem): number {
  return (
    availabilityRank(right) - availabilityRank(left) ||
    right.itemLevel - left.itemLevel ||
    right.quality - left.quality ||
    left.itemId - right.itemId
  );
}

function availabilityRank(item: AdaptedCatalogItem): number {
  return item.availability === "available" ? 1 : 0;
}

function roleLabel(role: "damage" | "healing" | "tank"): string {
  if (role === "damage") return "DPS";
  if (role === "healing") return "Healing";
  return "Tank";
}
