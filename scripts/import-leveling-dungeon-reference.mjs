// Imports identity metadata only; embedded source JavaScript is never executed.
import process from "node:process";
import {
  DUNGEON_REFERENCE_URL,
  extractDungeonReference,
} from "./leveling-dungeon-reference-parser.mjs";
const response = await globalThis.fetch(DUNGEON_REFERENCE_URL, {
  signal: globalThis.AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Dungeon reference fetch failed: ${response.status}`);
const html = await response.text();
if (html.length > 8_000_000) throw new Error("Dungeon reference exceeds its size limit");
process.stdout.write(
  JSON.stringify(extractDungeonReference(html, new Date().toISOString().slice(0, 10)), null, 2) +
    "\n",
);
