import Link from "next/link";

import type { RecipeDetail } from "../lib/data";
import type { ProductionMaterialNode, ProductionMethodNode } from "../lib/production-chain";
import { ItemIcon } from "./item-icon";

interface ProductionChainProps {
  readonly recipe: RecipeDetail;
}

export function ProductionChain({ recipe }: ProductionChainProps): React.JSX.Element {
  return (
    <section className="production-chain-section" aria-labelledby="production-chain-heading">
      <header className="section-heading production-chain-heading">
        <div>
          <span>Material provenance</span>
          <h2 id="production-chain-heading">How the inputs are made</h2>
          <p>
            Each branch ends at a material used directly by {recipe.name}. Quantities already
            include the number of intermediate crafts required for one final craft.
          </p>
        </div>
        <div className="production-chain-legend" aria-label="Production-chain legend">
          <span>
            <i className="legend-dot craftable" aria-hidden="true" /> Craftable
          </span>
          <span>
            <i className="legend-dot acquire" aria-hidden="true" /> Acquire
          </span>
          <span>
            <i className="legend-dot excluded" aria-hidden="true" /> Excluded cooldown
          </span>
        </div>
      </header>

      <ol className="production-root-list">
        {recipe.productionChain.map((material) => (
          <li key={material.itemId}>
            <MaterialBranch material={material} depth={0} />
          </li>
        ))}
      </ol>

      <div className="production-final-connector" aria-hidden="true">
        <span>All direct inputs</span>
        <b>↓</b>
      </div>
      <div className="production-final-card">
        <div>
          <span>Final craft</span>
          <strong>{recipe.name}</strong>
          <small>
            {recipe.profession.name} {recipe.requiredSkillRank} · one craft
          </small>
        </div>
        <div className="production-final-outputs">
          {recipe.outputs.map((output, index) =>
            output.itemId ? (
              <Link key={output.itemId} href={`/tbc/encyclopedia/items/${output.itemId}`}>
                <ItemIcon
                  fileDataId={output.iconFileDataId}
                  quality={output.quality ?? 0}
                  size="small"
                />
                <span>
                  <strong>{formatOutputQuantity(output)}</strong> {output.itemName}
                </span>
              </Link>
            ) : (
              <span key={index}>Enchantment {output.enchantmentId}</span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function MaterialBranch({
  material,
  depth,
}: {
  readonly material: ProductionMaterialNode;
  readonly depth: number;
}): React.JSX.Element {
  const eligibleMethods = material.methods.filter((method) => method.economicEligible);
  const timeGatedMethods = material.methods.filter((method) => method.timeGated);
  const uncertainMethods = material.methods.filter(
    (method) => !method.timeGated && !method.deterministic && !method.cyclic,
  );
  const cyclicMethods = material.methods.filter((method) => method.cyclic);
  const hasDetails =
    eligibleMethods.length +
      timeGatedMethods.length +
      uncertainMethods.length +
      cyclicMethods.length >
    0;
  const summary = (
    <>
      <ItemIcon fileDataId={material.iconFileDataId} quality={material.quality} size="small" />
      <span className="production-material-name">
        <strong>
          {material.requiredQuantity}× {material.name}
        </strong>
        <small>{materialStatus(material, eligibleMethods.length)}</small>
      </span>
      <span className={`production-state production-state-${material.state}`}>
        {material.state === "craftable" ? "Craftable" : "Acquire"}
      </span>
    </>
  );

  if (!hasDetails) {
    return (
      <div className={`production-material production-depth-${Math.min(depth, 3)}`}>
        <div className="production-material-summary">{summary}</div>
        {material.state === "depth_limit" ? (
          <p className="production-leaf-note">
            More producer methods exist, but this branch reached the five-step display limit.
          </p>
        ) : material.state === "cycle" ? (
          <p className="production-leaf-note">Cycle stopped here; acquire this amount directly.</p>
        ) : (
          <p className="production-leaf-note">
            No deterministic, non-cooldown producer is present in this client catalog. Acquire or
            use owned stock.
          </p>
        )}
      </div>
    );
  }

  return (
    <details
      className={`production-material production-depth-${Math.min(depth, 3)}`}
      open={depth < 2}
    >
      <summary className="production-material-summary">{summary}</summary>
      <div className="production-material-body">
        <MethodGroup methods={eligibleMethods} depth={depth} />
        {uncertainMethods.length > 0 ? (
          <details className="production-excluded-group">
            <summary>
              {uncertainMethods.length} variable-output method
              {uncertainMethods.length === 1 ? "" : "s"} · not used for guaranteed material totals
            </summary>
            <MethodGroup methods={uncertainMethods} depth={depth} />
          </details>
        ) : null}
        {timeGatedMethods.length > 0 ? (
          <details className="production-excluded-group production-time-gated-group">
            <summary>
              {timeGatedMethods.length} cooldown method{timeGatedMethods.length === 1 ? "" : "s"} ·
              informational only, excluded from all profit calculations
            </summary>
            <MethodGroup methods={timeGatedMethods} depth={depth} />
          </details>
        ) : null}
        {cyclicMethods.length > 0 ? (
          <details className="production-excluded-group">
            <summary>
              {cyclicMethods.length} circular method{cyclicMethods.length === 1 ? "" : "s"} ·
              excluded because the route consumes its own upstream material
            </summary>
            <MethodGroup methods={cyclicMethods} depth={depth} />
          </details>
        ) : null}
        {material.omittedMethodCount > 0 ? (
          <p className="production-leaf-note">
            {material.omittedMethodCount} additional producer method
            {material.omittedMethodCount === 1 ? " was" : "s were"} omitted to keep this chain
            readable.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function MethodGroup({
  methods,
  depth,
}: {
  readonly methods: readonly ProductionMethodNode[];
  readonly depth: number;
}): React.JSX.Element | null {
  if (methods.length === 0) return null;
  return (
    <div className="production-method-group">
      {methods.map((method, index) => (
        <div key={method.methodId} className="production-method-option">
          {index > 0 ? <span className="production-or">OR</span> : null}
          <MethodFlow method={method} depth={depth} />
        </div>
      ))}
    </div>
  );
}

function MethodFlow({
  method,
  depth,
}: {
  readonly method: ProductionMethodNode;
  readonly depth: number;
}): React.JSX.Element {
  return (
    <div className={`production-method ${method.timeGated ? "is-time-gated" : ""}`}>
      <div className="production-method-inputs">
        <span>Inputs for this step</span>
        {method.inputs.map((input) => (
          <MaterialBranch key={input.itemId} material={input} depth={depth + 1} />
        ))}
      </div>
      <div className="production-method-action">
        <span aria-hidden="true">→</span>
        <div>
          <small>{method.kind === "item_use" ? "Item conversion" : method.profession?.name}</small>
          {method.kind === "profession" ? (
            <Link href={`/tbc/encyclopedia/recipes/${method.spellId}`}>{method.name}</Link>
          ) : (
            <strong>{method.name}</strong>
          )}
          <small>{methodFacts(method)}</small>
        </div>
        <span aria-hidden="true">→</span>
      </div>
      <div className="production-method-output">
        <span>Creates</span>
        <Link href={`/tbc/encyclopedia/items/${method.output.itemId}`}>
          <ItemIcon
            fileDataId={method.output.iconFileDataId}
            quality={method.output.quality}
            size="small"
          />
          <span>
            <strong>{method.producedQuantity ?? formatMethodOutput(method)}×</strong>{" "}
            {method.output.name}
          </span>
        </Link>
        {method.leftoverQuantity && method.leftoverQuantity > 0 ? (
          <small>{method.leftoverQuantity} left over</small>
        ) : null}
      </div>
    </div>
  );
}

function materialStatus(material: ProductionMaterialNode, eligibleMethodCount: number): string {
  if (eligibleMethodCount > 0) {
    return `${eligibleMethodCount} deterministic non-cooldown method${
      eligibleMethodCount === 1 ? "" : "s"
    }`;
  }
  if (material.state === "cycle") return "Circular route stopped";
  if (material.state === "depth_limit") return "Display depth reached";
  return material.methods.length > 0
    ? "Only excluded producer methods found"
    : "No producer method in the client graph";
}

function methodFacts(method: ProductionMethodNode): string {
  const facts: string[] = [];
  if (method.profession) facts.push(`skill ${method.requiredSkillRank}`);
  if (method.crafts !== null) facts.push(`${method.crafts} craft${method.crafts === 1 ? "" : "s"}`);
  else facts.push("variable output");
  if (method.timeGated) {
    facts.push(
      `${formatDuration(Math.max(method.cooldownMs, method.categoryCooldownMs))} cooldown`,
    );
  }
  return facts.join(" · ");
}

function formatMethodOutput(method: ProductionMethodNode): string {
  return method.output.minimumQuantity === method.output.maximumQuantity
    ? String(method.output.minimumQuantity)
    : `${method.output.minimumQuantity}–${method.output.maximumQuantity}`;
}

function formatOutputQuantity(output: RecipeDetail["outputs"][number]): string {
  return output.minimumQuantity === output.maximumQuantity
    ? `${output.minimumQuantity}×`
    : `${output.minimumQuantity}–${output.maximumQuantity}×`;
}

function formatDuration(milliseconds: number): string {
  const hours = milliseconds / 3_600_000;
  if (hours >= 1) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  const minutes = milliseconds / 60_000;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`;
}
