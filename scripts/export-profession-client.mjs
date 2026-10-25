import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { createDatabase } from "../packages/db/dist/index.js";

const { values } = parseArgs({
  options: { output: { type: "string" }, "expected-build": { type: "string" } },
  strict: true,
});
if (!values.output || !values["expected-build"] || !process.env.DATABASE_URL)
  throw new Error(
    "Pass --output and --expected-build with the existing read-only DATABASE_URL environment",
  );
const database = createDatabase(process.env.DATABASE_URL);
try {
  const data = await database.client.begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`SET LOCAL statement_timeout='30s'`;
      const [build] =
        await sql`SELECT id,product,build_number AS "buildNumber",client_version AS "clientVersion",locale FROM game_build WHERE product='wow_classic_beta' AND locale='enUS' AND status='published' ORDER BY published_at DESC LIMIT 1`;
      if (!build || build.buildNumber !== Number(values["expected-build"]))
        throw new Error("Published client build changed; re-audit before exporting");
      const items =
        await sql`SELECT item_id AS "itemId",name,description,class_id AS "classId",subclass_id AS "subclassId",required_level AS "requiredLevel",required_skill_id AS "requiredSkillId",required_skill_rank AS "requiredSkillRank" FROM item_version WHERE build_id=${build.id} ORDER BY item_id`;
      const spells =
        await sql`SELECT s.spell_id AS "spellId",s.name,s.description FROM spell_version s JOIN recipe_version r ON r.build_id=s.build_id AND r.recipe_spell_id=s.spell_id WHERE s.build_id=${build.id} ORDER BY s.spell_id`;
      const recipes =
        await sql`SELECT recipe_spell_id AS "recipeSpellId",profession_skill_line_id AS "professionSkillLineId",raw_record AS "rawRecord" FROM recipe_version WHERE build_id=${build.id} ORDER BY recipe_spell_id`;
      const professions =
        await sql`SELECT skill_line_id AS "skillLineId",name FROM profession_version WHERE build_id=${build.id} ORDER BY skill_line_id`;
      const recipeOutputs =
        await sql`SELECT recipe_spell_id AS "recipeSpellId",output_item_id AS "outputItemId" FROM recipe_output WHERE build_id=${build.id} ORDER BY recipe_spell_id,slot`;
      const recipeTeachingItems =
        await sql`SELECT recipe_spell_id AS "recipeSpellId",teaching_item_id AS "teachingItemId" FROM recipe_teaching_item WHERE build_id=${build.id} ORDER BY recipe_spell_id,teaching_item_id`;
      return {
        schema: "profession-client-review.v1",
        build,
        items,
        spells,
        recipes,
        professions,
        recipeOutputs,
        recipeTeachingItems,
      };
    },
  );
  const bytes = gzipSync(`${JSON.stringify(data)}\n`);
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes, { mode: 0o600, flag: "wx" });
  process.stdout.write(
    `${JSON.stringify({ output, build: data.build, items: data.items.length, recipes: data.recipes.length, teachingItems: data.recipeTeachingItems.length, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length })}\n`,
  );
} finally {
  await database.close();
}
