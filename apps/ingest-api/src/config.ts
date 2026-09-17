import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  INGEST_API_HOST: z.string().min(1).default("127.0.0.1"),
  INGEST_API_KEYS: z.string().min(16),
  INGEST_API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RAW_UPLOAD_DIR: z.string().min(1).default("./raw-uploads"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
});

export interface IngestApiConfig {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
  readonly apiKeys: readonly string[];
  readonly nodeEnvironment: "development" | "test" | "production";
  readonly rawUploadDirectory: string;
  readonly webOrigin: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): IngestApiConfig {
  const parsed = environmentSchema.parse(environment);
  const apiKeys = parsed.INGEST_API_KEYS.split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  if (apiKeys.some((key) => key.length < 16)) {
    throw new Error("Every ingestion API key must contain at least 16 characters");
  }

  return {
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.INGEST_API_HOST,
    port: parsed.INGEST_API_PORT,
    apiKeys,
    nodeEnvironment: parsed.NODE_ENV,
    rawUploadDirectory: parsed.RAW_UPLOAD_DIR,
    webOrigin: parsed.WEB_ORIGIN,
  };
}
