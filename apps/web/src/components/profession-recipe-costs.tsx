"use client";
import { useState } from "react";
import { formatCopper } from "../lib/format";
import { copperToGold, goldToCopper } from "../lib/profession-leveling-settings";
import type { LevelingRecipe, ProfessionLevelingOptions } from "../lib/profession-leveling-types";
import styles from "./profession-leveling.module.css";

export function ProfessionRecipeCosts({
  recipes,
  options,
  onChange: update,
}: {
  readonly recipes: readonly LevelingRecipe[];
  readonly options: ProfessionLevelingOptions;
  readonly onChange: (options: ProfessionLevelingOptions) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [costInputs, setCostInputs] = useState<Readonly<Record<string, string>>>({});
  const filtered = recipes.filter((recipe) =>
    recipe.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <details className={styles.recipes}>
      <summary>
        Known recipes &amp; learning costs{" "}
        <small>
          {options.knownRecipeIds.length} learned · {recipes.length} recipes
        </small>
      </summary>
      <p>
        Learning is charged once. Unknown prices are excluded until you enter their cost or mark the
        recipe as learned. Only mark recipes this character can use.
      </p>
      <label>
        Find a recipe
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by recipe name"
        />
      </label>
      <div className={styles.recipeList}>
        {filtered.map((recipe) => (
          <div key={recipe.id} className={styles.recipeRow}>
            <label>
              <input
                type="checkbox"
                checked={options.knownRecipeIds.includes(recipe.id)}
                onChange={(event) =>
                  update({
                    ...options,
                    knownRecipeIds: event.target.checked
                      ? [...options.knownRecipeIds, recipe.id]
                      : options.knownRecipeIds.filter((id) => id !== recipe.id),
                  })
                }
              />
              <span>
                {recipe.name}
                <small>
                  {options.knownRecipeIds.includes(recipe.id)
                    ? "Already learned"
                    : "Mark as learned"}{" "}
                  ·{" "}
                  {recipe.requiredSkillKnown === false
                    ? "learning skill unknown"
                    : `skill ${recipe.requiredSkill}`}
                  {recipe.restriction ? " · restricted" : ""}
                </small>
              </span>
            </label>
            <div>
              <small>
                {recipe.acquisition.length
                  ? recipe.acquisition.some((entry) => entry.itemId)
                    ? "Recipe purchase included from AH"
                    : `Trainer fee from ${formatCopper(recipe.acquisition.reduce((best, entry) => (BigInt(entry.costCopper) < best ? BigInt(entry.costCopper) : best), BigInt(recipe.acquisition[0]!.costCopper)))}`
                  : "Learning price missing"}
              </small>
              <label>
                Override learning cost (gold)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 2.50"
                  disabled={options.knownRecipeIds.includes(recipe.id)}
                  aria-label={`${recipe.name} learning cost in gold`}
                  value={
                    costInputs[recipe.id] ??
                    (options.recipeCosts[recipe.id] !== undefined
                      ? copperToGold(options.recipeCosts[recipe.id]!)
                      : "")
                  }
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    setCostInputs({ ...costInputs, [recipe.id]: event.target.value });
                    if (value && goldToCopper(value) === null) {
                      event.target.setCustomValidity(
                        "Enter a gold amount with up to four decimal places.",
                      );
                      update({
                        ...options,
                        recipeCosts: { ...options.recipeCosts, [recipe.id]: value },
                      });
                      return;
                    }
                    event.target.setCustomValidity("");
                    const recipeCosts = { ...options.recipeCosts };
                    if (value) recipeCosts[recipe.id] = goldToCopper(value)!;
                    else delete recipeCosts[recipe.id];
                    update({ ...options, recipeCosts });
                  }}
                />
              </label>
              {recipe.requiredSkillKnown === false ? (
                <label>
                  Skill required to learn
                  <input
                    type="number"
                    min={1}
                    max={300}
                    disabled={options.knownRecipeIds.includes(recipe.id)}
                    aria-label={`${recipe.name} skill required to learn`}
                    required={
                      options.recipeCosts[recipe.id] !== undefined &&
                      !options.knownRecipeIds.includes(recipe.id)
                    }
                    value={options.recipeSkills?.[recipe.id] ?? ""}
                    onChange={(event) => {
                      const recipeSkills = { ...options.recipeSkills };
                      if (event.target.value) recipeSkills[recipe.id] = Number(event.target.value);
                      else delete recipeSkills[recipe.id];
                      update({ ...options, recipeSkills });
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
        ))}
        {!filtered.length ? <p>No matching recipes.</p> : null}
      </div>
    </details>
  );
}
