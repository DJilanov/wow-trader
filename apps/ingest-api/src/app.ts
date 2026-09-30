import { createHash, timingSafeEqual } from "node:crypto";

import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  auctionScanUploadSchema,
  canonicalJson,
  marketIntelligencePackSchema,
  marketIntelligenceQuerySchema,
  publicDataStatusSchema,
  uploadReceiptSchema,
  uploadStatusSchema,
  worldDiagnosticsUploadSchema,
  type JsonValue,
} from "@wow-trader/contracts";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { PayloadChecksumError, PayloadConflictError } from "./errors.js";
import type { RawPayloadStore } from "./raw-payload-store.js";
import type { UploadRepository } from "./repositories.js";

export interface BuildAppOptions {
  readonly repository: UploadRepository;
  readonly rawPayloadStore: RawPayloadStore;
  readonly apiKeys: readonly string[];
  readonly webOrigin: string;
  readonly logger?: boolean;
}

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string(),
});

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  if (options.apiKeys.length === 0) {
    throw new Error("At least one ingestion API key is required");
  }

  const app = Fastify({
    bodyLimit: 32 * 1024 * 1024,
    logger: options.logger ?? false,
    requestIdHeader: "x-request-id",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: options.webOrigin,
    methods: ["GET", "POST"],
  });
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "WoW Trader API",
        version: "0.1.0",
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
  });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({ status: z.literal("ok") }),
        },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  app.get(
    "/v1/public/data-status",
    {
      schema: {
        response: {
          200: publicDataStatusSchema,
        },
      },
    },
    async () => options.repository.getPublicDataStatus(),
  );

  app.post(
    "/v1/uploads/auction-scan",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
      preHandler: createApiKeyAuthenticator(options.apiKeys),
      schema: {
        body: auctionScanUploadSchema,
        response: {
          202: uploadReceiptSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const canonicalData = canonicalJson(request.body.data as JsonValue);
      const calculatedChecksum = createHash("sha256").update(canonicalData).digest("hex");

      if (!safeStringEqual(calculatedChecksum, request.body.checksum)) {
        throw new PayloadChecksumError();
      }

      const canonicalEnvelope = canonicalJson(request.body as JsonValue);
      const envelopeHash = createHash("sha256").update(canonicalEnvelope).digest("hex");
      const rawPayloadUri = await options.rawPayloadStore.put(
        request.body.payloadId,
        envelopeHash,
        canonicalEnvelope,
      );
      const receipt = await options.repository.acceptAuctionScan(
        request.body,
        rawPayloadUri,
        envelopeHash,
      );

      return reply.code(202).send(receipt);
    },
  );

  app.post(
    "/v1/uploads/world-diagnostics",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
      preHandler: createApiKeyAuthenticator(options.apiKeys),
      schema: {
        body: worldDiagnosticsUploadSchema,
        response: {
          202: uploadReceiptSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const canonicalData = canonicalJson(request.body.data as JsonValue);
      const calculatedChecksum = createHash("sha256").update(canonicalData).digest("hex");
      if (!safeStringEqual(calculatedChecksum, request.body.checksum)) {
        throw new PayloadChecksumError();
      }

      const canonicalEnvelope = canonicalJson(request.body as JsonValue);
      const envelopeHash = createHash("sha256").update(canonicalEnvelope).digest("hex");
      const rawPayloadUri = await options.rawPayloadStore.put(
        request.body.payloadId,
        envelopeHash,
        canonicalEnvelope,
      );
      const receipt = await options.repository.acceptWorldDiagnostics(
        request.body,
        rawPayloadUri,
        envelopeHash,
      );
      return reply.code(202).send(receipt);
    },
  );

  app.get(
    "/v1/uploads/:payloadId",
    {
      preHandler: createApiKeyAuthenticator(options.apiKeys),
      schema: {
        params: z.object({ payloadId: z.string().uuid() }),
        response: {
          200: uploadStatusSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const upload = await options.repository.findUpload(request.params.payloadId);
      if (!upload) {
        return reply.code(404).send({
          error: "not_found",
          message: "No upload exists for this payload ID",
          requestId: request.id,
        });
      }

      return reply.code(200).send(upload);
    },
  );

  app.get(
    "/v1/market-intelligence",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
      preHandler: createApiKeyAuthenticator(options.apiKeys),
      schema: {
        querystring: marketIntelligenceQuerySchema,
        response: {
          200: marketIntelligencePackSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const pack = await options.repository.getMarketIntelligence(request.query);
      if (!pack) {
        return reply.code(404).send({
          error: "not_found",
          message:
            "No market intelligence exists for this exact product, build, realm, and faction",
          requestId: request.id,
        });
      }
      return reply.code(200).send(pack);
    },
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof PayloadChecksumError) {
      return reply.code(422).send({
        error: "checksum_mismatch",
        message: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof PayloadConflictError) {
      return reply.code(409).send({
        error: "payload_conflict",
        message: error.message,
        requestId: request.id,
      });
    }

    if (isValidationError(error)) {
      return reply.code(422).send({
        error: "validation_failed",
        message: error.message,
        requestId: request.id,
      });
    }

    request.log.error({ error: summarizeErrorForLog(error) }, "Unhandled request error");
    return reply.code(500).send({
      error: "internal_error",
      message: "The request could not be completed",
      requestId: request.id,
    });
  });

  return app;
}

function createApiKeyAuthenticator(apiKeys: readonly string[]) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token || !apiKeys.some((key) => safeStringEqual(key, token))) {
      await reply.code(401).send({
        error: "unauthorized",
        message: "A valid ingestion API key is required",
        requestId: request.id,
      });
    }
  };
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidationError(error: unknown): error is Error & { validation: unknown } {
  return error instanceof Error && "validation" in error && error.validation !== undefined;
}

interface ErrorLogSummary {
  readonly name: string;
  readonly message: string;
  readonly code: string | undefined;
  readonly cause:
    | {
        readonly name: string | undefined;
        readonly code: string | undefined;
        readonly severity: string | undefined;
        readonly routine: string | undefined;
      }
    | undefined;
}

function summarizeErrorForLog(error: unknown): ErrorLogSummary {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: "A non-Error value was thrown",
      code: undefined,
      cause: undefined,
    };
  }
  const cause = "cause" in error ? error.cause : undefined;
  const causeSummary =
    cause && typeof cause === "object"
      ? {
          name: readStringProperty(cause, "name"),
          code: readStringProperty(cause, "code"),
          severity: readStringProperty(cause, "severity"),
          routine: readStringProperty(cause, "routine"),
        }
      : undefined;
  return {
    name: error.name,
    message: error.message.split("\n", 1)[0]!.slice(0, 500),
    code: readStringProperty(error, "code"),
    cause:
      causeSummary && Object.values(causeSummary).some((value) => value !== undefined)
        ? causeSummary
        : undefined,
  };
}

function readStringProperty(value: object, key: string): string | undefined {
  const property = Reflect.get(value, key);
  return typeof property === "string" ? property : undefined;
}
