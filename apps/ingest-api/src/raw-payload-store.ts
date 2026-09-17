import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PayloadConflictError } from "./errors.js";

export interface RawPayloadStore {
  put(payloadId: string, envelopeHash: string, content: string): Promise<string>;
}

export class FileRawPayloadStore implements RawPayloadStore {
  readonly #rootDirectory: string;

  public constructor(rootDirectory: string) {
    this.#rootDirectory = path.resolve(rootDirectory);
  }

  public async put(payloadId: string, envelopeHash: string, content: string): Promise<string> {
    const directory = path.join(this.#rootDirectory, payloadId.slice(0, 2));
    const filePath = path.join(directory, `${payloadId}-${envelopeHash}.json`);
    await mkdir(directory, { recursive: true });

    try {
      await writeFile(filePath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error: unknown) {
      if (!isFileExistsError(error)) throw error;

      const existing = await readFile(filePath, "utf8");
      if (existing !== content) {
        throw new PayloadConflictError("An immutable raw payload path already has different data");
      }
    }

    await access(filePath, constants.R_OK);
    return `file://${filePath}`;
  }
}

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
