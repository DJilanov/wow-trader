import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { safeStorage } from "electron";

export async function readCredential(userDataPath: string): Promise<string | null> {
  try {
    const encrypted = await readFile(credentialPath(userDataPath));
    const decrypted = await safeStorage.decryptStringAsync(encrypted);
    if (decrypted.shouldReEncrypt) await writeCredential(userDataPath, decrypted.result);
    return decrypted.result;
  } catch (error: unknown) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writeCredential(userDataPath: string, credential: string): Promise<void> {
  const normalized = credential.trim();
  if (normalized.length < 16) throw new Error("The ingestion credential is too short");
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure operating-system credential storage is unavailable");
  }
  const encrypted = await safeStorage.encryptStringAsync(normalized);
  const filePath = credentialPath(userDataPath);
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await mkdir(userDataPath, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, encrypted, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export async function removeCredential(userDataPath: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(credentialPath(userDataPath), { force: true });
}

function credentialPath(userDataPath: string): string {
  return path.join(userDataPath, "credential.bin");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
