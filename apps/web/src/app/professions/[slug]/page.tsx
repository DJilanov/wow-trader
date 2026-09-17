import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "../../../components/data-unavailable";
import { JsonLd } from "../../../components/json-ld";
import { StatusPill } from "../../../components/status-pill";
import { getProfessionDetail } from "../../../lib/data";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";

interface ProfessionPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function generateMetadata({ params }: ProfessionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const fallback = createHelperMetadata({
    title: `${slug.replaceAll("-", " ")} — TBC Profession`,
    description: `TBC Classic ${slug.replaceAll("-", " ")} recipes and profession data from the audited KFC Helper catalog.`,
    path: `/tbc/encyclopedia/professions/${encodeURIComponent(slug)}`,
  });

  try {
    const profession = await getProfessionDetail(slug);
    if (!profession) return { ...fallback, robots: { index: false, follow: true } };
    return createHelperMetadata({
      title: `TBC ${profession.name} Recipes & Profession Guide`,
      description: `Browse ${profession.recipes.length.toLocaleString("en-US")} audited TBC ${profession.name} recipes with skill requirements, outputs, learning relationships, cooldown evidence, and exact spell IDs.`,
      path: `/tbc/encyclopedia/professions/${profession.slug}`,
      keywords: [
        `TBC ${profession.name}`,
        `TBC ${profession.name} recipes`,
        `${profession.name} profession guide`,
      ],
    });
  } catch {
    return fallback;
  }
}

export default async function ProfessionPage({
  params,
}: ProfessionPageProps): Promise<React.JSX.Element> {
  try {
    const profession = await getProfessionDetail((await params).slug);
    if (!profession) notFound();
    return (
      <>
        <JsonLd
          data={createBreadcrumbJsonLd([
            { name: "KFC Helper", path: "/" },
            { name: "TBC Encyclopedia", path: "/tbc/encyclopedia" },
            {
              name: profession.name,
              path: `/tbc/encyclopedia/professions/${profession.slug}`,
            },
          ])}
        />
        <article className="detail-page">
          <header className="detail-hero profession-hero">
            <div>
              <span className="eyebrow">Skill line {profession.skillLineId}</span>
              <h1>{profession.name}</h1>
              <p>
                {profession.recipes.length.toLocaleString()} crafting transformations in the
                published build.
              </p>
            </div>
            <div className="build-stamp">
              <span>Catalog source</span>
              <strong>{profession.build.version}</strong>
              <small>Build {profession.build.number}</small>
            </div>
          </header>
          <section className="section-block">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Complete index</span>
                <h2>Recipes</h2>
              </div>
              <span>{profession.recipes.length} records</span>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th>Skill</th>
                    <th>Kind</th>
                    <th>Extraction</th>
                  </tr>
                </thead>
                <tbody>
                  {profession.recipes.map((recipe) => (
                    <tr key={recipe.spellId}>
                      <td>
                        <Link href={`/tbc/encyclopedia/recipes/${recipe.spellId}`}>
                          <strong>{recipe.name}</strong>
                          <small>Spell {recipe.spellId}</small>
                        </Link>
                      </td>
                      <td>{recipe.requiredSkillRank}</td>
                      <td>{recipe.outputKind}</td>
                      <td>
                        <StatusPill value={recipe.extractionStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </article>
      </>
    );
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    return <DataUnavailable title="Profession data is unavailable" />;
  }
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
