import { resolve } from "node:path";
import {
  getPublishedOfficialNotes,
  readOfficialNotesHealth,
  type OfficialNotesHealth,
  type PublishedOfficialNotes,
} from "@wow-trader/forever-data/updates-server";
import { getDatabase } from "./database";

export interface ForeverOfficialUpdates {
  readonly publication: PublishedOfficialNotes | null;
  readonly health: OfficialNotesHealth | null;
}

export async function getForeverOfficialUpdates(): Promise<ForeverOfficialUpdates> {
  const directory = resolve(
    /* turbopackIgnore: true */ process.env.FOREVER_UPDATES_ROOT ||
      "../../artifacts/forever-updates",
  );
  const health = await readOfficialNotesHealth(directory).catch(() => null);
  try {
    const publication = await getPublishedOfficialNotes(getDatabase(), directory);
    return { publication, health };
  } catch {
    // The last validated local publication remains useful during a database outage.
    return {
      publication: await getPublishedOfficialNotes(null, directory).catch(() => null),
      health,
    };
  }
}
