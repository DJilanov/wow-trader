import {
  appendCompanionActivity,
  readCompanionState,
  writeCompanionState,
  type CompanionState,
} from "./state.js";
import {
  companionSnapshotSchema,
  productConfigurationSchema,
  type CompanionPhase,
  type CompanionSnapshot,
  type ProductConfiguration,
} from "./contracts.js";
import {
  discoverCollectorSavedVariables,
  readFileSignature,
  signaturesMatch,
  type FileSignature,
} from "./discovery.js";
import { readCollectorSavedVariables } from "./saved-variables.js";
import { nextWatchRetry, type WatchRetry } from "./retry.js";
import {
  createAuctionScanUpload,
  uploadAuctionScan,
  waitForAuctionScanProcessed,
} from "./upload.js";

const DEFAULT_POLL_INTERVAL_MILLISECONDS = 2_000;
const MANUAL_STABILITY_DELAY_MILLISECONDS = 250;

export interface CompanionServiceOptions {
  readonly endpoint: URL;
  readonly statePath: string;
  readonly products: readonly ProductConfiguration[];
  readonly automaticUploads?: boolean;
  readonly apiKey?: string | null;
  readonly pollIntervalMilliseconds?: number;
  readonly now?: () => Date;
}

export interface CompanionService {
  start(): Promise<void>;
  stop(): Promise<void>;
  setCredential(apiKey: string | null): Promise<void>;
  setAutomaticUploads(enabled: boolean): Promise<void>;
  checkNow(): Promise<CompanionSnapshot>;
  retryFailed(): Promise<CompanionSnapshot>;
  updateProducts(products: readonly ProductConfiguration[]): Promise<void>;
  getSnapshot(): CompanionSnapshot;
  subscribe(listener: (snapshot: CompanionSnapshot) => void): () => void;
}

export class DefaultCompanionService implements CompanionService {
  readonly #endpoint: URL;
  readonly #statePath: string;
  readonly #pollIntervalMilliseconds: number;
  readonly #now: () => Date;
  readonly #listeners = new Set<(snapshot: CompanionSnapshot) => void>();
  readonly #observedSignatures = new Map<string, FileSignature>();
  readonly #processedSignatures = new Map<string, string>();
  readonly #retries = new Map<string, WatchRetry>();
  #products: ProductConfiguration[];
  #automaticUploads: boolean;
  #apiKey: string | null;
  #state: CompanionState | null = null;
  #snapshot: CompanionSnapshot;
  #timer: NodeJS.Timeout | null = null;
  #abortController: AbortController | null = null;
  #activeReconciliation: Promise<CompanionSnapshot> | null = null;
  #rerunRequested = false;
  #running = false;

  public constructor(options: CompanionServiceOptions) {
    assertSecureEndpoint(options.endpoint);
    this.#endpoint = new URL(options.endpoint);
    this.#statePath = options.statePath;
    this.#products = parseProducts(options.products);
    this.#automaticUploads = options.automaticUploads ?? true;
    this.#apiKey = normalizeApiKey(options.apiKey ?? null);
    this.#pollIntervalMilliseconds =
      options.pollIntervalMilliseconds ?? DEFAULT_POLL_INTERVAL_MILLISECONDS;
    if (
      !Number.isSafeInteger(this.#pollIntervalMilliseconds) ||
      this.#pollIntervalMilliseconds < 500 ||
      this.#pollIntervalMilliseconds > 60_000
    ) {
      throw new RangeError("pollIntervalMilliseconds must be between 500 and 60000");
    }
    this.#now = options.now ?? (() => new Date());
    this.#snapshot = this.#makeSnapshot(
      this.#apiKey && this.#products.some((product) => product.enabled)
        ? this.#automaticUploads
          ? "waiting_for_saved_scan"
          : "paused"
        : "setup_required",
      "Companion is initializing.",
    );
  }

  public async start(): Promise<void> {
    if (this.#running) return;
    this.#state = await readCompanionState(this.#statePath);
    const latestProcessed = this.#state.activities.find(
      (activity) => activity.status === "processed",
    );
    if (latestProcessed) {
      this.#snapshot = companionSnapshotSchema.parse({
        ...this.#snapshot,
        lastProcessedAt: latestProcessed.occurredAt,
        lastProcessedScanId: latestProcessed.scanId,
        activeCharacterLabel: latestProcessed.characterLabel,
      });
    }
    this.#running = true;
    this.#abortController = new AbortController();
    this.#timer = setInterval(() => {
      if (this.#automaticUploads) void this.#enqueueReconciliation(false);
    }, this.#pollIntervalMilliseconds);
    if (this.#automaticUploads) await this.#enqueueReconciliation(false);
    else this.#publish("paused", "Automatic uploads are paused.");
  }

  public async stop(): Promise<void> {
    this.#running = false;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#abortController?.abort(new Error("Companion service stopped"));
    this.#abortController = null;
    try {
      await this.#activeReconciliation;
    } catch {
      // Cancellation is expected during application shutdown.
    }
  }

  public async setCredential(apiKey: string | null): Promise<void> {
    this.#apiKey = normalizeApiKey(apiKey);
    if (!this.#apiKey) this.#publish("setup_required", "Pair this installation to upload scans.");
    else if (this.#automaticUploads && this.#running) await this.#enqueueReconciliation(true);
  }

  public async setAutomaticUploads(enabled: boolean): Promise<void> {
    this.#automaticUploads = enabled;
    if (!enabled) {
      this.#publish("paused", "Automatic uploads are paused.");
      return;
    }
    if (this.#running) await this.#enqueueReconciliation(true);
  }

  public async checkNow(): Promise<CompanionSnapshot> {
    return this.#enqueueReconciliation(true);
  }

  public async retryFailed(): Promise<CompanionSnapshot> {
    this.#retries.clear();
    return this.#enqueueReconciliation(true);
  }

  public async updateProducts(products: readonly ProductConfiguration[]): Promise<void> {
    this.#products = parseProducts(products);
    this.#observedSignatures.clear();
    this.#processedSignatures.clear();
    this.#retries.clear();
    if (this.#automaticUploads && this.#running) await this.#enqueueReconciliation(true);
  }

  public getSnapshot(): CompanionSnapshot {
    return this.#snapshot;
  }

  public subscribe(listener: (snapshot: CompanionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => this.#listeners.delete(listener);
  }

  async #enqueueReconciliation(manual: boolean): Promise<CompanionSnapshot> {
    if (this.#activeReconciliation) {
      this.#rerunRequested = this.#rerunRequested || manual;
      await this.#activeReconciliation;
      return this.#snapshot;
    }

    this.#activeReconciliation = this.#runReconciliation(manual).finally(() => {
      this.#activeReconciliation = null;
    });
    await this.#activeReconciliation;
    if (this.#rerunRequested) {
      this.#rerunRequested = false;
      return this.#enqueueReconciliation(true);
    }
    return this.#snapshot;
  }

  async #runReconciliation(manual: boolean): Promise<CompanionSnapshot> {
    if (!this.#state) this.#state = await readCompanionState(this.#statePath);
    const enabledProducts = this.#products.filter((product) => product.enabled);
    if (enabledProducts.length === 0) {
      return this.#publish("setup_required", "Add and enable a World of Warcraft installation.");
    }
    if (!this.#apiKey) {
      return this.#publish("setup_required", "Pair this installation to upload scans.");
    }
    if (!manual && !this.#automaticUploads) {
      return this.#publish("paused", "Automatic uploads are paused.");
    }

    const pathsByProduct = await Promise.all(
      enabledProducts.map(async (product) => ({
        product,
        paths: await discoverCollectorSavedVariables(product.rootPath),
      })),
    );
    const currentPaths = new Set(pathsByProduct.flatMap(({ paths }) => paths));
    this.#removeMissingPaths(currentPaths);
    this.#publishProducts(pathsByProduct);

    let pendingScanCount = 0;
    let processedAny = false;
    for (const { product, paths } of pathsByProduct) {
      for (const filePath of paths) {
        const signature = await this.#readStableSignature(filePath, manual);
        if (!signature) continue;
        const signatureKey = signatureKeyFor(signature);
        if (this.#processedSignatures.get(filePath) === signatureKey) continue;
        const retryKey = `${filePath}:${signatureKey}`;
        const retry = this.#retries.get(retryKey);
        if (!manual && retry && retry.notBefore > this.#now().getTime()) continue;

        try {
          const savedVariables = await readCollectorSavedVariables(filePath);
          const uploadedIds = new Set(this.#state.uploadedScanIds);
          const pending = savedVariables.scans.filter((scan) => !uploadedIds.has(scan.scanId));
          pendingScanCount += pending.length;
          for (const scan of pending) {
            const characterLabel = scan.sourceCharacter
              ? `${scan.sourceCharacter.name}-${scan.sourceCharacter.realmId}`
              : null;
            this.#publish("scan_detected", "A new saved scan was detected.", {
              activeScanId: scan.scanId,
              activeCharacterLabel: characterLabel,
              pendingScanCount,
            });
            const upload = createAuctionScanUpload(savedVariables, scan);
            this.#publish("uploading", "Uploading Auction House scan…", {
              activeScanId: scan.scanId,
              activeCharacterLabel: characterLabel,
              pendingScanCount,
            });
            const receipt = await uploadAuctionScan(this.#endpoint, this.#apiKey, upload, {
              signal: this.#abortController?.signal,
            });
            if (receipt.status === "accepted") {
              this.#publish("processing", "The server is processing the scan…", {
                activeScanId: scan.scanId,
                activeCharacterLabel: characterLabel,
                pendingScanCount,
              });
              await waitForAuctionScanProcessed(this.#endpoint, this.#apiKey, receipt.payloadId, {
                signal: this.#abortController?.signal,
              });
            }
            uploadedIds.add(scan.scanId);
            this.#state = appendCompanionActivity(
              {
                ...this.#state,
                uploadedScanIds: [...uploadedIds],
              },
              {
                scanId: scan.scanId,
                productId: product.id,
                status: "processed",
                occurredAt: this.#now().toISOString(),
                characterLabel,
                message: receipt.duplicate ? "Processed duplicate confirmed" : "Upload processed",
                realmId: scan.realmId,
                marketCount: scan.itemSnapshots.length,
                receipt: receipt.duplicate ? "duplicate" : "processed",
              },
            );
            await writeCompanionState(this.#statePath, this.#state);
            pendingScanCount = Math.max(0, pendingScanCount - 1);
            processedAny = true;
            this.#publish("up_to_date", "Scan processed successfully.", {
              activeScanId: null,
              activeCharacterLabel: characterLabel,
              pendingScanCount,
              lastProcessedAt: this.#now().toISOString(),
              lastProcessedScanId: scan.scanId,
            });
          }
          this.#processedSignatures.set(filePath, signatureKey);
          this.#retries.delete(retryKey);
        } catch (error: unknown) {
          if (this.#abortController?.signal.aborted) throw error;
          const nextRetry = nextWatchRetry(retry, this.#now().getTime());
          this.#retries.set(retryKey, nextRetry);
          const message = error instanceof Error ? error.message : "Unknown companion failure";
          return this.#publish(isOfflineError(error) ? "offline" : "error", message, {
            errorCode: classifyError(error),
            pendingScanCount,
          });
        }
      }
    }

    if (processedAny) return this.#snapshot;
    return this.#publish(
      currentPaths.size > 0 ? "up_to_date" : "waiting_for_saved_scan",
      currentPaths.size > 0
        ? "All saved scans are up to date."
        : "Waiting for a saved scan. Run /reload or log out after scanning.",
      { pendingScanCount, activeScanId: null, activeCharacterLabel: null, errorCode: null },
    );
  }

  async #readStableSignature(filePath: string, manual: boolean): Promise<FileSignature | null> {
    const signature = await readFileSignature(filePath);
    const previous = this.#observedSignatures.get(filePath);
    this.#observedSignatures.set(filePath, signature);
    if (previous && signaturesMatch(previous, signature)) return signature;
    if (!manual) return null;
    await delay(MANUAL_STABILITY_DELAY_MILLISECONDS, this.#abortController?.signal);
    const confirmed = await readFileSignature(filePath);
    this.#observedSignatures.set(filePath, confirmed);
    return signaturesMatch(signature, confirmed) ? confirmed : null;
  }

  #removeMissingPaths(currentPaths: ReadonlySet<string>): void {
    for (const knownPath of this.#observedSignatures.keys()) {
      if (!currentPaths.has(knownPath)) {
        this.#observedSignatures.delete(knownPath);
        this.#processedSignatures.delete(knownPath);
      }
    }
  }

  #publishProducts(
    entries: readonly {
      readonly product: ProductConfiguration;
      readonly paths: readonly string[];
    }[],
  ): void {
    this.#snapshot = companionSnapshotSchema.parse({
      ...this.#snapshot,
      products: this.#products.map((product) => ({
        ...product,
        collectorFileCount:
          entries.find((entry) => entry.product.id === product.id)?.paths.length ?? 0,
      })),
      updatedAt: this.#now().toISOString(),
    });
    this.#emit();
  }

  #publish(
    phase: CompanionPhase,
    message: string,
    updates: Partial<CompanionSnapshot> = {},
  ): CompanionSnapshot {
    this.#snapshot = companionSnapshotSchema.parse({
      ...this.#snapshot,
      ...updates,
      phase,
      automaticUploads: this.#automaticUploads,
      message,
      updatedAt: this.#now().toISOString(),
    });
    this.#emit();
    return this.#snapshot;
  }

  #makeSnapshot(phase: CompanionPhase, message: string): CompanionSnapshot {
    return companionSnapshotSchema.parse({
      phase,
      automaticUploads: this.#automaticUploads,
      products: this.#products.map((product) => ({ ...product, collectorFileCount: 0 })),
      pendingScanCount: 0,
      activeScanId: null,
      activeCharacterLabel: null,
      lastProcessedAt: null,
      lastProcessedScanId: null,
      message,
      errorCode: null,
      updatedAt: this.#now().toISOString(),
    });
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

function parseProducts(products: readonly ProductConfiguration[]): ProductConfiguration[] {
  const parsed = products.map((product) => productConfigurationSchema.parse(product));
  if (new Set(parsed.map(({ id }) => id)).size !== parsed.length) {
    throw new Error("Companion product IDs must be unique");
  }
  return parsed;
}

function normalizeApiKey(apiKey: string | null): string | null {
  if (apiKey === null || apiKey.trim().length === 0) return null;
  const normalized = apiKey.trim();
  if (normalized.length < 16)
    throw new Error("The ingestion API key must contain at least 16 characters");
  return normalized;
}

function signatureKeyFor(signature: FileSignature): string {
  return `${signature.size}:${signature.modifiedAtMilliseconds}`;
}

function classifyError(error: unknown): string {
  if (error instanceof SyntaxError) return "invalid_saved_variables";
  if (isOfflineError(error)) return "network_unavailable";
  if (error instanceof Error && /unauthorized|401|credential|api key/i.test(error.message))
    return "authentication_failed";
  if (error instanceof Error && /rejected/i.test(error.message)) return "upload_rejected";
  return "companion_error";
}

function isOfflineError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && /fetch failed|network|offline/i.test(error.message))
  );
}

function assertSecureEndpoint(endpoint: URL): void {
  const loopback = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
    throw new Error("The endpoint must use HTTPS unless it is a localhost development server");
  }
}

function delay(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    if (signal?.aborted) {
      rejectPromise(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      rejectPromise(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolvePromise();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
