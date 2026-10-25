import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "../../../components/data-unavailable";
import { ItemIcon } from "../../../components/item-icon";
import { JsonLd } from "../../../components/json-ld";
import { ProductionChain } from "../../../components/production-chain";
import { StatusPill } from "../../../components/status-pill";
import { TBC_CATALOG_PAGE_CONFIG, type CatalogPageConfig } from "../../../lib/catalog-page-config";
import { getRecipeDetail, type RecipeDetail } from "../../../lib/data";
import { formatCopper } from "../../../lib/format";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../lib/seo";

export const revalidate = 3_600;

interface RecipePageProps {
  readonly params: Promise<{ readonly spellId: string }>;
}

export async function createCatalogRecipeMetadata(
  { params }: RecipePageProps,
  config: CatalogPageConfig,
): Promise<Metadata> {
  const { spellId } = await params;
  const numericSpellId = Number(spellId);
  const fallback = createHelperMetadata({
    title: `${config.gameLabel} Recipe ${spellId}`,
    description: `${config.gameLabel} crafting recipe ${spellId} in the build-aware KFC Helper profession database.`,
    path: `${config.encyclopediaBasePath}/recipes/${encodeURIComponent(spellId)}`,
    noIndex: !Number.isSafeInteger(numericSpellId) || numericSpellId <= 0,
  });
  if (!Number.isSafeInteger(numericSpellId) || numericSpellId <= 0) return fallback;

  try {
    const recipe = await getRecipeDetail(numericSpellId, config.clientProduct);
    if (!recipe) return { ...fallback, robots: { index: false, follow: true } };
    return createHelperMetadata({
      title: `${recipe.name} — ${config.gameLabel} ${recipe.profession.name} Recipe`,
      description: `${recipe.name} (spell ${recipe.recipeSpellId}) for ${config.gameLabel} ${recipe.profession.name}: exact reagents, outputs, skill ${recipe.requiredSkillRank}, learning evidence, cooldowns, and material chain.`,
      path: `${config.encyclopediaBasePath}/recipes/${recipe.recipeSpellId}`,
      keywords: [
        recipe.name,
        `${recipe.name} recipe`,
        `${config.gameLabel} ${recipe.profession.name} recipes`,
      ],
    });
  } catch {
    return fallback;
  }
}

export function generateMetadata(props: RecipePageProps): Promise<Metadata> {
  return createCatalogRecipeMetadata(props, TBC_CATALOG_PAGE_CONFIG);
}

export default async function RecipePage({ params }: RecipePageProps): Promise<React.JSX.Element> {
  return CatalogRecipePage({ params, config: TBC_CATALOG_PAGE_CONFIG });
}

export async function CatalogRecipePage({
  params,
  config,
}: RecipePageProps & { readonly config: CatalogPageConfig }): Promise<React.JSX.Element> {
  const spellId = Number((await params).spellId);
  if (!Number.isSafeInteger(spellId) || spellId <= 0) notFound();
  try {
    const recipe = await getRecipeDetail(spellId, config.clientProduct);
    if (!recipe) notFound();
    return (
      <>
        <JsonLd
          data={createBreadcrumbJsonLd([
            { name: "KFC Helper", path: "/" },
            {
              name: recipe.profession.name,
              path: `${config.encyclopediaBasePath}/professions/${recipe.profession.slug}`,
            },
            {
              name: recipe.name,
              path: `${config.encyclopediaBasePath}/recipes/${recipe.recipeSpellId}`,
            },
          ])}
        />
        <article className="detail-page">
          <header className="detail-hero recipe-hero">
            <div>
              <span className="eyebrow">Crafting spell {recipe.recipeSpellId}</span>
              <h1>{recipe.name}</h1>
              <p>
                <Link href={`${config.encyclopediaBasePath}/professions/${recipe.profession.slug}`}>
                  {recipe.profession.name}
                </Link>{" "}
                · skill {recipe.requiredSkillRank}
              </p>
            </div>
            <div className="build-stamp">
              <StatusPill value={recipe.extractionStatus} />
              <strong>{recipe.build.version}</strong>
              <small>Build {recipe.build.number}</small>
            </div>
          </header>

          <section className="direct-recipe-section" aria-labelledby="direct-recipe-heading">
            <header className="section-heading direct-recipe-heading">
              <div>
                <span>Exact game formula</span>
                <h2 id="direct-recipe-heading">Direct recipe</h2>
                <p>
                  These are the materials placed directly into the {recipe.profession.name} craft.
                  Their own ingredients are expanded separately below.
                </p>
              </div>
            </header>
            <div className="flow-panel" aria-label="Direct recipe transformation">
              <div>
                <span>Direct inputs</span>
                {recipe.inputs.length ? (
                  recipe.inputs.map((input) => (
                    <Link
                      key={input.itemId}
                      href={`${config.encyclopediaBasePath}/items/${input.itemId}`}
                    >
                      <ItemIcon
                        fileDataId={input.iconFileDataId}
                        product={config.clientProduct}
                        quality={input.quality}
                        size="small"
                      />
                      <span>
                        <strong>{input.quantity}×</strong> {input.name}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p>No item reagents.</p>
                )}
              </div>
              <div className="direct-craft-action">
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
                <small>
                  {recipe.profession.name} {recipe.requiredSkillRank}
                </small>
              </div>
              <div>
                <span>Final output</span>
                {recipe.outputs.map((output, index) =>
                  output.itemId ? (
                    <Link
                      key={output.itemId}
                      href={`${config.encyclopediaBasePath}/items/${output.itemId}`}
                    >
                      <ItemIcon
                        fileDataId={output.iconFileDataId}
                        product={config.clientProduct}
                        quality={output.quality ?? 0}
                        size="small"
                      />
                      <span>
                        <strong>{quantityLabel(output)}</strong> {output.itemName}
                      </span>
                    </Link>
                  ) : (
                    <p key={index}>Enchantment {output.enchantmentId}</p>
                  ),
                )}
              </div>
            </div>
          </section>

          <ProductionChain
            recipe={recipe}
            encyclopediaBasePath={config.encyclopediaBasePath}
            product={config.clientProduct}
          />

          <section className="detail-grid">
            <div className="panel">
              <h2>Constraints</h2>
              <dl className="metric-list">
                <div>
                  <dt>Craft time</dt>
                  <dd>{formatDuration(recipe.craftTimeMs)}</dd>
                </div>
                <div>
                  <dt>Direct cooldown</dt>
                  <dd>{formatDuration(recipe.cooldownMs)}</dd>
                </div>
                <div>
                  <dt>Shared cooldown</dt>
                  <dd>{formatDuration(recipe.categoryCooldownMs)}</dd>
                </div>
                <div>
                  <dt>Cooldown category</dt>
                  <dd>{recipe.cooldownCategoryId ?? "None"}</dd>
                </div>
                <div>
                  <dt>Output kind</dt>
                  <dd>{recipe.outputKind}</dd>
                </div>
              </dl>
            </div>
            <div className="panel">
              <h2>How it is learned</h2>
              {recipe.teachingItems.length ||
              recipe.trainers.length ||
              recipe.referenceTrainers.length ? (
                <>
                  {recipe.teachingItems.length ? (
                    <ul className="link-list" aria-label="Teaching items">
                      {recipe.teachingItems.map((item) => (
                        <li key={item.itemId}>
                          <Link
                            className="detail-item"
                            href={`${config.encyclopediaBasePath}/items/${item.itemId}`}
                          >
                            <ItemIcon
                              fileDataId={item.iconFileDataId}
                              product={config.clientProduct}
                              quality={item.quality}
                              size="small"
                            />
                            {item.name}
                          </Link>
                          <span>
                            {item.referenceLabel ?? `Client teaching item ${item.itemId}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {recipe.referenceTrainers.length ? (
                    <>
                      <h3>Trainer references</h3>
                      <ul className="link-list" aria-label="Referenced trainers">
                        {recipe.referenceTrainers.map((trainer) => (
                          <li key={trainer.sourceId}>
                            <Link href={`${config.encyclopediaBasePath}/npcs/${trainer.sourceId}`}>
                              {trainer.name}
                            </Link>
                            <span>{trainer.referenceLabel}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <p className="inline-empty">
                    External teaching references and name matches do not guarantee current realm
                    availability. Live trainer observations are listed separately.
                  </p>
                  {recipe.trainers.length ? (
                    <ul className="link-list" aria-label="Observed trainers">
                      {recipe.trainers.map((trainer) => (
                        <li key={trainer.sourceId}>
                          <span>
                            <strong>{trainer.sourceName ?? `Trainer ${trainer.sourceId}`}</strong>
                            <small>
                              {trainer.serviceName}
                              {trainer.serviceRank ? ` · ${trainer.serviceRank}` : ""}
                            </small>
                          </span>
                          <span>
                            {formatCopper(trainer.moneyCost)} · observed trainer UI
                            {trainer.allFiltersEnabled ? "" : " · partial filters"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="inline-empty">
                  No teaching item relationship is present. This commonly means a trainer, quest, or
                  server-controlled source; it does not prove availability.
                </p>
              )}
            </div>
          </section>
          <aside className="evidence-note">
            <strong>Evidence boundary</strong>
            <p>
              The client proves this crafting topology is shipped in build {recipe.build.number}. It
              does not, by itself, prove the drop source, drop rate, phase, or realm availability.
            </p>
          </aside>
        </article>
      </>
    );
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    return <DataUnavailable title="Recipe data is unavailable" />;
  }
}

function quantityLabel(output: RecipeDetailOutput): string {
  return output.minimumQuantity === output.maximumQuantity
    ? `${output.minimumQuantity}×`
    : `${output.minimumQuantity}–${output.maximumQuantity}×`;
}

type RecipeDetailOutput = RecipeDetail["outputs"][number];

function formatDuration(milliseconds: number): string {
  if (milliseconds === 0) return "None";
  const hours = milliseconds / 3_600_000;
  if (hours >= 1) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
  const seconds = milliseconds / 1_000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} seconds`;
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
