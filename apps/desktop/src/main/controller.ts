import { execFile } from "node:child_process";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  companionSnapshotSchema,
  readCompanionState,
  type CompanionSnapshot,
  type ProductKind,
} from "@wow-trader/companion-core";
import { app, dialog, Notification, shell } from "electron";

import {
  desktopSnapshotSchema,
  type DesktopSettings,
  type DesktopSnapshot,
  type RendererCommand,
} from "../shared/contracts.js";
import { readCredential, removeCredential, writeCredential } from "./credential-store.js";
import {
  createProductConfiguration,
  discoverDefaultProducts,
  inspectProducts,
  installCollector,
} from "./products.js";
import { companionStatePath, readDesktopSettings, writeDesktopSettings } from "./settings-store.js";
import { CompanionUtilityHost } from "./utility-host.js";

const execute = promisify(execFile);
const TRADER_URL = "https://helper.kfcguild.online/tbc/trader";
const LEGACY_LABEL = "online.kfcguild.wow-trader-companion";

export class DesktopController {
  readonly #userDataPath: string;
  readonly #utility = new CompanionUtilityHost();
  readonly #listeners = new Set<(snapshot: DesktopSnapshot) => void>();
  #settings: DesktopSettings | null = null;
  #credential: string | null = null;
  #companion: CompanionSnapshot = emptyCompanionSnapshot();
  #snapshot: DesktopSnapshot | null = null;
  #lastNotifiedPhase: string | null = null;
  #lastLogKey: string | null = null;
  #activeRefresh: Promise<DesktopSnapshot> | null = null;
  #refreshRequested = false;

  public constructor(userDataPath: string) {
    this.#userDataPath = userDataPath;
  }

  public async initialize(): Promise<DesktopSnapshot> {
    const detectedProducts = await discoverDefaultProducts();
    this.#settings = await readDesktopSettings(this.#userDataPath, detectedProducts);
    this.#credential = await readCredential(this.#userDataPath);
    this.#utility.subscribe((snapshot) => {
      this.#companion = snapshot;
      this.#requestRefresh();
    });
    this.#utility.subscribeErrors((message) => {
      this.#companion = companionSnapshotSchema.parse({
        ...this.#companion,
        phase: "error",
        message,
        errorCode: "utility_error",
        updatedAt: new Date().toISOString(),
      });
      this.#requestRefresh();
    });
    await this.#utility.start({
      type: "configure",
      endpoint: this.#settings.endpoint,
      statePath: companionStatePath(this.#userDataPath),
      products: this.#settings.products,
      automaticUploads: this.#settings.automaticUploads,
      credential: this.#credential,
    });
    if (this.#settings.startAtLogin) app.setLoginItemSettings({ openAtLogin: true });
    return this.#refreshSnapshot();
  }

  public async invoke(command: RendererCommand): Promise<DesktopSnapshot> {
    const settings = this.#requireSettings();
    switch (command.type) {
      case "get_snapshot":
        return this.getSnapshot();
      case "check_now":
        this.#utility.send({ type: "check_now" });
        break;
      case "retry":
        this.#utility.send({ type: "retry" });
        break;
      case "set_automatic":
        this.#settings = { ...settings, automaticUploads: command.enabled };
        await this.#persistSettings();
        this.#utility.send({ type: "set_automatic", enabled: command.enabled });
        break;
      case "set_start_at_login":
        this.#settings = { ...settings, startAtLogin: command.enabled };
        app.setLoginItemSettings({ openAtLogin: command.enabled });
        await this.#persistSettings();
        break;
      case "set_notifications":
        this.#settings = { ...settings, notificationsEnabled: command.enabled };
        await this.#persistSettings();
        break;
      case "choose_product_root":
        await this.#chooseProductRoot(command.product);
        break;
      case "install_collector":
        await this.#installCollector(command.productId);
        break;
      case "save_credential":
        await writeCredential(this.#userDataPath, command.credential);
        this.#credential = command.credential.trim();
        this.#utility.send({ type: "set_credential", credential: this.#credential });
        break;
      case "remove_credential":
        await removeCredential(this.#userDataPath);
        this.#credential = null;
        this.#utility.send({ type: "set_credential", credential: null });
        break;
      case "disable_legacy_service":
        await disableLegacyService();
        break;
      case "open_trader":
        await shell.openExternal(TRADER_URL);
        break;
      case "open_logs":
        await mkdir(this.#logsPath(), { recursive: true });
        await shell.openPath(this.#logsPath());
        break;
    }
    return this.#refreshSnapshot();
  }

  public getSnapshot(): DesktopSnapshot {
    if (!this.#snapshot) throw new Error("Desktop controller is not initialized");
    return this.#snapshot;
  }

  public subscribe(listener: (snapshot: DesktopSnapshot) => void): () => void {
    this.#listeners.add(listener);
    if (this.#snapshot) listener(this.#snapshot);
    return () => this.#listeners.delete(listener);
  }

  public async stop(): Promise<void> {
    await this.#utility.stop();
  }

  async #chooseProductRoot(kind: ProductKind): Promise<void> {
    const result = await dialog.showOpenDialog({
      title: kind === "tbc" ? "Choose The Burning Crusade folder" : "Choose WoW Forever folder",
      properties: ["openDirectory"],
    });
    const rootPath = result.filePaths[0];
    if (result.canceled || !rootPath) return;
    const settings = this.#requireSettings();
    const product = createProductConfiguration(kind, rootPath);
    const products = [...settings.products.filter((entry) => entry.kind !== kind), product];
    this.#settings = { ...settings, products };
    await this.#persistSettings();
    this.#utility.send({ type: "update_products", products });
  }

  async #installCollector(productId: string): Promise<void> {
    const settings = this.#requireSettings();
    const product = settings.products.find((entry) => entry.id === productId);
    if (!product) throw new Error("The selected WoW product is not configured");
    const sourceDirectory = app.isPackaged
      ? path.join(process.resourcesPath, "WowTraderCollector")
      : path.resolve(app.getAppPath(), "../addon/WowTraderCollector");
    await installCollector(product, sourceDirectory);
  }

  async #persistSettings(): Promise<void> {
    await writeDesktopSettings(this.#userDataPath, this.#requireSettings());
  }

  async #refreshSnapshot(): Promise<DesktopSnapshot> {
    if (this.#activeRefresh) {
      this.#refreshRequested = true;
      await this.#activeRefresh;
      return this.#snapshot ?? this.#refreshSnapshot();
    }
    this.#activeRefresh = this.#buildSnapshot().finally(() => {
      this.#activeRefresh = null;
    });
    const snapshot = await this.#activeRefresh;
    if (this.#refreshRequested) {
      this.#refreshRequested = false;
      return this.#refreshSnapshot();
    }
    return snapshot;
  }

  async #buildSnapshot(): Promise<DesktopSnapshot> {
    const settings = this.#requireSettings();
    const state = await readCompanionState(companionStatePath(this.#userDataPath));
    this.#snapshot = desktopSnapshotSchema.parse({
      companion: this.#companion,
      settings,
      credentialConfigured: this.#credential !== null,
      legacyServiceDetected: await legacyServiceExists(),
      products: await inspectProducts(settings.products),
      recentActivity: state.activities.slice(0, 12),
      appVersion: app.getVersion(),
    });
    await this.#writeLog(this.#snapshot);
    this.#notify(this.#snapshot);
    for (const listener of this.#listeners) listener(this.#snapshot);
    return this.#snapshot;
  }

  #requestRefresh(): void {
    void this.#refreshSnapshot().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Desktop status refresh failed";
      this.#companion = companionSnapshotSchema.parse({
        ...this.#companion,
        phase: "error",
        message,
        errorCode: "desktop_refresh_failed",
        updatedAt: new Date().toISOString(),
      });
      if (this.#snapshot) {
        this.#snapshot = desktopSnapshotSchema.parse({
          ...this.#snapshot,
          companion: this.#companion,
        });
        for (const listener of this.#listeners) listener(this.#snapshot);
      }
    });
  }

  #notify(snapshot: DesktopSnapshot): void {
    if (
      !snapshot.settings.notificationsEnabled ||
      snapshot.companion.phase === this.#lastNotifiedPhase
    )
      return;
    this.#lastNotifiedPhase = snapshot.companion.phase;
    if (snapshot.companion.phase === "up_to_date" && snapshot.companion.lastProcessedScanId) {
      new Notification({
        title: "Auction House scan uploaded",
        body: "Trader data is now up to date.",
      }).show();
    } else if (snapshot.companion.phase === "error") {
      new Notification({
        title: "WoW Trader needs attention",
        body: snapshot.companion.message,
      }).show();
    }
  }

  async #writeLog(snapshot: DesktopSnapshot): Promise<void> {
    const logKey = JSON.stringify({
      phase: snapshot.companion.phase,
      message: snapshot.companion.message,
      errorCode: snapshot.companion.errorCode,
      activeScanId: snapshot.companion.activeScanId,
    });
    if (logKey === this.#lastLogKey) return;
    this.#lastLogKey = logKey;
    await mkdir(this.#logsPath(), { recursive: true, mode: 0o700 });
    const record = {
      at: new Date().toISOString(),
      phase: snapshot.companion.phase,
      message: snapshot.companion.message,
      errorCode: snapshot.companion.errorCode,
      activeScanId: snapshot.companion.activeScanId,
    };
    const logPath = path.join(this.#logsPath(), "activity.jsonl");
    await rotateLogIfNeeded(logPath);
    await appendFile(logPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  #logsPath(): string {
    return path.join(this.#userDataPath, "logs");
  }

  #requireSettings(): DesktopSettings {
    if (!this.#settings) throw new Error("Desktop settings are not initialized");
    return this.#settings;
  }
}

async function rotateLogIfNeeded(filePath: string): Promise<void> {
  try {
    const details = await stat(filePath);
    if (details.size >= 2 * 1_024 * 1_024) {
      const archivePath = `${filePath}.1`;
      await rm(archivePath, { force: true });
      await rename(filePath, archivePath);
    }
  } catch (error: unknown) {
    if (!isMissingFileError(error)) throw error;
  }
}

function emptyCompanionSnapshot(): CompanionSnapshot {
  return companionSnapshotSchema.parse({
    phase: "setup_required",
    automaticUploads: true,
    products: [],
    pendingScanCount: 0,
    activeScanId: null,
    activeCharacterLabel: null,
    lastProcessedAt: null,
    lastProcessedScanId: null,
    message: "Companion is starting…",
    errorCode: null,
    updatedAt: new Date().toISOString(),
  });
}

async function legacyServiceExists(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  try {
    await stat(legacyServicePath());
    return true;
  } catch (error: unknown) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

async function disableLegacyService(): Promise<void> {
  if (process.platform !== "darwin") return;
  const userId = process.getuid?.();
  if (userId === undefined) throw new Error("Could not determine the current macOS user ID");
  const filePath = legacyServicePath();
  try {
    await execute("launchctl", ["bootout", `gui/${userId}`, filePath]);
  } catch {
    // It is safe to remove a stale plist when the service is already unloaded.
  }
  await rm(filePath, { force: true });
}

function legacyServicePath(): string {
  return path.join(homedir(), `Library/LaunchAgents/${LEGACY_LABEL}.plist`);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
