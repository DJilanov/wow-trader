import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function isMainModule(importMetaUrl, argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  try {
    return realpathSync(resolve(argvEntry)) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}
