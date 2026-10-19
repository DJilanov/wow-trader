import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DataUnavailable } from "../../../components/data-unavailable";
import { EncyclopediaTypeahead } from "../../../components/encyclopedia-typeahead";
import { ItemHoverTooltip } from "../../../components/item-hover-tooltip";
import { ItemIcon } from "../../../components/item-icon";
import {
  getEncyclopediaData,
  parseEncyclopediaSection,
  type EncyclopediaData,
  type EncyclopediaSection,
} from "../../../lib/encyclopedia";
import { TBC_BIS_CLASSES } from "../../../lib/bis-directory";
import { TBC_CATALOG_PAGE_CONFIG, type CatalogPageConfig } from "../../../lib/catalog-page-config";
import { createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";

type SearchParamValue = string | readonly string[] | undefined;

interface EncyclopediaPageProps {
  readonly searchParams: Promise<{
    readonly q?: SearchParamValue;
    readonly type?: SearchParamValue;
  }>;
}

export async function createCatalogDirectoryMetadata(
  { searchParams }: EncyclopediaPageProps,
  config: CatalogPageConfig,
): Promise<Metadata> {
  const raw = await searchParams;
  const hasSearchState = Boolean(getParam(raw.q) || getParam(raw.type));
  return createHelperMetadata({
    title: `${config.gameLabel} Item, Recipe & Profession Encyclopedia`,
    description: `Search audited ${config.gameLabel} items and profession recipes with reagents, outputs, teaching links, stats, requirements, and exact game IDs.`,
    path: `${config.encyclopediaBasePath}${config.clientProduct === TBC_CATALOG_PAGE_CONFIG.clientProduct ? "" : "/catalog"}`,
    keywords: [
      `${config.gameLabel} item database`,
      `${config.gameLabel} recipe database`,
      `${config.gameLabel} profession database`,
      `${config.gameLabel} item IDs`,
      `${config.gameLabel} crafting recipes`,
    ],
    noIndex: hasSearchState,
  });
}

export function generateMetadata(props: EncyclopediaPageProps): Promise<Metadata> {
  return createCatalogDirectoryMetadata(props, TBC_CATALOG_PAGE_CONFIG);
}

const sections: readonly { readonly value: EncyclopediaSection; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "items", label: "Items" },
  { value: "recipes", label: "Recipes" },
  { value: "professions", label: "Professions" },
];

export default async function EncyclopediaPage({
  searchParams,
}: EncyclopediaPageProps): Promise<React.JSX.Element> {
  return CatalogDirectoryPage({
    searchParams,
    config: TBC_CATALOG_PAGE_CONFIG,
    catalogPath: TBC_CATALOG_PAGE_CONFIG.encyclopediaBasePath,
    showBis: true,
  });
}

export async function CatalogDirectoryPage({
  searchParams,
  config,
  catalogPath,
  showBis,
}: EncyclopediaPageProps & {
  readonly config: CatalogPageConfig;
  readonly catalogPath: string;
  readonly showBis: boolean;
}): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const query = getParam(raw.q) ?? "";
  const section = parseEncyclopediaSection(getParam(raw.type));

  try {
    const data = await getEncyclopediaData(query, section, config.clientProduct);
    if (!data) {
      return (
        <DataUnavailable
          title={`The ${config.encyclopediaLabel} is waiting for a published catalog build`}
        />
      );
    }

    const resultCount = data.items.length + data.recipes.length + data.professions.length;
    return (
      <article className="encyclopedia-page">
        <header className="encyclopedia-hero">
          <div>
            <Link className="helper-back-link" href={config.encyclopediaBasePath}>
              <span aria-hidden="true">←</span> {config.encyclopediaLabel}
            </Link>
            <span className="eyebrow">
              {config.gameLabel} build {data.build.buildNumber}
            </span>
            <h1>Azeroth, indexed.</h1>
            <p>
              Search client-extracted items, crafting recipes, professions, or an exact item, spell,
              or skill-line ID.
            </p>
          </div>
          <div className="encyclopedia-build-stamp">
            <span>Published catalog</span>
            <strong>{data.build.version}</strong>
            <small>{data.build.product}</small>
          </div>
        </header>

        <EncyclopediaTypeahead
          basePath={catalogPath}
          initialQuery={data.query}
          placeholder="Item, recipe, profession, or exact ID…"
          section={section}
        />

        <nav className="encyclopedia-tabs" aria-label="Encyclopedia record type">
          {sections.map((option) => (
            <Link
              className={section === option.value ? "active" : undefined}
              href={encyclopediaHref(catalogPath, data.query, option.value)}
              key={option.value}
            >
              {option.label}
              {option.value !== "all" ? (
                <small>{data.counts[option.value].toLocaleString()}</small>
              ) : null}
            </Link>
          ))}
        </nav>

        {data.query.length === 1 && !data.searched ? (
          <div className="encyclopedia-notice" role="status">
            Enter one more character to search names, or enter a complete numeric ID.
          </div>
        ) : null}

        {data.query.length === 0 ? (
          <EncyclopediaStart
            data={data}
            encyclopediaBasePath={config.encyclopediaBasePath}
            showBis={showBis}
          />
        ) : data.searched && resultCount > 0 ? (
          <EncyclopediaResults
            data={data}
            encyclopediaBasePath={config.encyclopediaBasePath}
            product={config.clientProduct}
            resultCount={resultCount}
          />
        ) : data.searched ? (
          <div className="workspace-empty encyclopedia-empty">
            <strong>No catalog records found</strong>
            <p>Try a broader name, an exact item/spell ID, or another record type.</p>
          </div>
        ) : null}
      </article>
    );
  } catch {
    return <DataUnavailable title={`The ${config.encyclopediaLabel} is temporarily unavailable`} />;
  }
}

function EncyclopediaStart({
  data,
  encyclopediaBasePath,
  showBis,
}: {
  readonly data: EncyclopediaData;
  readonly encyclopediaBasePath: string;
  readonly showBis: boolean;
}): React.JSX.Element {
  return (
    <section className="encyclopedia-start" aria-labelledby="browse-professions-heading">
      <div className="encyclopedia-counts" aria-label="Catalog coverage">
        <div>
          <strong>{data.counts.items.toLocaleString()}</strong>
          <span>Items</span>
        </div>
        <div>
          <strong>{data.counts.recipes.toLocaleString()}</strong>
          <span>Recipes</span>
        </div>
        <div>
          <strong>{data.counts.professions.toLocaleString()}</strong>
          <span>Professions</span>
        </div>
      </div>
      <div className="encyclopedia-section-heading">
        <div>
          <span className="eyebrow">Browse the archive</span>
          <h2 id="browse-professions-heading">Professions</h2>
        </div>
        <span>Every relationship points back to the published client build.</span>
      </div>
      <ProfessionResults
        encyclopediaBasePath={encyclopediaBasePath}
        professions={data.professions}
      />
      {showBis ? <BisDirectory /> : null}
    </section>
  );
}

function BisDirectory(): React.JSX.Element {
  return (
    <section className="encyclopedia-bis-section" aria-labelledby="bis-lists-heading">
      <div className="encyclopedia-section-heading">
        <div>
          <span className="eyebrow">Build-aware loadouts</span>
          <h2 id="bis-lists-heading">BiS lists</h2>
        </div>
        <span>
          Catalog candidates first; a list publishes only after its mechanics model passes.
        </span>
      </div>
      <div className="encyclopedia-bis-grid">
        {TBC_BIS_CLASSES.map((gameClass) => (
          <article
            className="encyclopedia-bis-class"
            key={gameClass.classId}
            style={{ "--class-color": gameClass.color } as React.CSSProperties}
          >
            <header>
              <span aria-hidden="true">
                <Image
                  alt=""
                  height={38}
                  loading="eager"
                  src={`/wow-assets/classes/${gameClass.className.toLowerCase()}.jpg`}
                  width={38}
                />
              </span>
              <div>
                <h3>{gameClass.className}</h3>
                <small>{gameClass.lists.length} loadout workspaces</small>
              </div>
            </header>
            <div>
              {gameClass.lists.map((list) => (
                <Link href={`/tbc/encyclopedia/bis/${list.slug}`} key={list.slug}>
                  <span>{list.specializationName}</span>
                  <small>{roleLabel(list.role)}</small>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function roleLabel(role: "damage" | "healing" | "tank"): string {
  if (role === "damage") return "DPS";
  if (role === "healing") return "Healer";
  return "Tank";
}

function EncyclopediaResults({
  data,
  encyclopediaBasePath,
  product,
  resultCount,
}: {
  readonly data: EncyclopediaData;
  readonly encyclopediaBasePath: string;
  readonly product: CatalogPageConfig["clientProduct"];
  readonly resultCount: number;
}): React.JSX.Element {
  return (
    <section className="encyclopedia-results" aria-live="polite">
      <div className="encyclopedia-result-summary">
        <span>
          {resultCount} result{resultCount === 1 ? "" : "s"} for <strong>“{data.query}”</strong>
        </span>
        <small>Up to {data.resultLimit} records per type</small>
      </div>

      {data.items.length > 0 ? (
        <ResultSection title="Items" count={data.items.length}>
          <div className="encyclopedia-item-grid">
            {data.items.map((item) => (
              <div className="encyclopedia-item-result" key={item.itemId}>
                <Link
                  aria-describedby={`item-preview-${item.itemId}`}
                  className="encyclopedia-item-card"
                  href={`${encyclopediaBasePath}/items/${item.itemId}`}
                >
                  <ItemIcon
                    fileDataId={item.iconFileDataId}
                    product={product}
                    quality={item.quality}
                    size="large"
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      Item {item.itemId} · {item.className}
                    </small>
                    <span>
                      Item level {item.itemLevel}
                      {item.requiredLevel > 0 ? ` · Requires level ${item.requiredLevel}` : ""}
                    </span>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
                <ItemHoverTooltip id={`item-preview-${item.itemId}`} item={item} />
              </div>
            ))}
          </div>
        </ResultSection>
      ) : null}

      {data.recipes.length > 0 ? (
        <ResultSection title="Recipes" count={data.recipes.length}>
          <div className="encyclopedia-recipe-list">
            {data.recipes.map((recipe) => (
              <Link
                className="encyclopedia-recipe-row"
                href={`${encyclopediaBasePath}/recipes/${recipe.recipeSpellId}`}
                key={recipe.recipeSpellId}
              >
                <span className="encyclopedia-record-icon" aria-hidden="true">
                  R
                </span>
                <span>
                  <strong>{recipe.name}</strong>
                  <small>
                    Spell {recipe.recipeSpellId} · {recipe.professionName} · {recipe.outputKind}
                  </small>
                </span>
                <span className="encyclopedia-record-meta">
                  Skill {recipe.requiredSkillRank}
                  {recipe.hasCooldown ? <small>Cooldown</small> : null}
                  {recipe.extractionStatus !== "complete" ? (
                    <small>{recipe.extractionStatus.replaceAll("_", " ")}</small>
                  ) : null}
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </ResultSection>
      ) : null}

      {data.professions.length > 0 ? (
        <ResultSection title="Professions" count={data.professions.length}>
          <ProfessionResults
            encyclopediaBasePath={encyclopediaBasePath}
            professions={data.professions}
          />
        </ResultSection>
      ) : null}
    </section>
  );
}

function ProfessionResults({
  professions,
  encyclopediaBasePath,
}: {
  readonly professions: EncyclopediaData["professions"];
  readonly encyclopediaBasePath: string;
}): React.JSX.Element {
  return (
    <div className="encyclopedia-profession-grid">
      {professions.map((profession) => (
        <Link
          href={`${encyclopediaBasePath}/professions/${profession.slug}`}
          key={profession.skillLineId}
        >
          <span className="encyclopedia-record-icon profession" aria-hidden="true">
            <Image
              alt=""
              height={38}
              loading="eager"
              src={`/wow-assets/professions/${profession.slug}.jpg`}
              width={38}
            />
          </span>
          <span>
            <strong>{profession.name}</strong>
            <small>Skill line {profession.skillLineId}</small>
          </span>
          <span>{profession.recipeCount.toLocaleString()} recipes</span>
        </Link>
      ))}
    </div>
  );
}

function ResultSection({
  title,
  count: resultCount,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="encyclopedia-result-section">
      <div className="encyclopedia-section-heading">
        <h2>{title}</h2>
        <span>{resultCount} shown</span>
      </div>
      {children}
    </section>
  );
}

function encyclopediaHref(basePath: string, query: string, section: EncyclopediaSection): string {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (section !== "all") search.set("type", section);
  const suffix = search.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function getParam(value: SearchParamValue): string | undefined {
  return typeof value === "string" ? value : value?.at(-1);
}
