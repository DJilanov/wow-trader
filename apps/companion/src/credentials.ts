import { readFile, stat } from "node:fs/promises";

export async function resolveIngestionApiKey(apiKeyFilePath: string | null): Promise<string> {
  const apiKey = apiKeyFilePath
    ? await readProtectedApiKeyFile(apiKeyFilePath)
    : process.env.WOW_TRADER_INGEST_API_KEY;
  if (!apiKey || apiKey.length < 16) {
    throw new Error(
      apiKeyFilePath
        ? "The ingestion API key file must contain at least 16 characters"
        : "WOW_TRADER_INGEST_API_KEY must contain at least 16 characters",
    );
  }
  return apiKey;
}

async function readProtectedApiKeyFile(filePath: string): Promise<string> {
  const metadata = await stat(filePath);
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("The ingestion API key file must not be accessible by group or other users");
  }
  return (await readFile(filePath, "utf8")).trim();
}
