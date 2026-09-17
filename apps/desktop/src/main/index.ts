import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CompanionPhase } from "@wow-trader/companion-core";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  protocol,
  session,
  Tray,
  type IpcMainInvokeEvent,
} from "electron";

import {
  IPC_INVOKE_CHANNEL,
  IPC_SNAPSHOT_CHANNEL,
  rendererCommandSchema,
  rendererResultSchema,
  type DesktopSnapshot,
  type RendererResult,
} from "../shared/contracts.js";
import { DesktopController } from "./controller.js";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const LOCAL_SCHEME = "wow-trader";
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: DesktopController | null = null;
let currentSnapshot: DesktopSnapshot | null = null;
let isQuitting = false;
let shutdownStarted = false;
let shutdownComplete = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

if (hasSingleInstanceLock) {
  app.on("second-instance", showWindow);
  app.whenReady().then(boot).catch(showFatalError);
  app.on("activate", showWindow);
  app.on("before-quit", (event) => {
    isQuitting = true;
    if (!controller || shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    void controller.stop().finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  });
}

async function boot(): Promise<void> {
  await configureRendererProtocol();
  configureSessionSecurity();
  controller = new DesktopController(app.getPath("userData"));
  controller.subscribe((snapshot) => {
    currentSnapshot = snapshot;
    rebuildTrayMenu(snapshot);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_SNAPSHOT_CHANNEL, snapshot);
    }
  });
  registerIpc();
  await controller.initialize();
  createWindow();
  createTray();
  powerMonitor.on("resume", () => {
    void controller?.invoke({ type: "check_now" }).catch(showActionError);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 740,
    minWidth: 620,
    minHeight: 580,
    show: true,
    backgroundColor: "#08080a",
    title: "WoW Trader Companion",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void mainWindow.loadURL(rendererEntryUrl()).then(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  }, showFatalError);
}

function createTray(): void {
  tray = new Tray(createTrayIcon("waiting_for_saved_scan"));
  tray.setToolTip("WoW Trader Companion");
  tray.on("click", toggleWindow);
  if (currentSnapshot) rebuildTrayMenu(currentSnapshot);
}

function rebuildTrayMenu(snapshot: DesktopSnapshot): void {
  if (!tray) return;
  tray.setImage(createTrayIcon(snapshot.companion.phase));
  tray.setToolTip(`WoW Trader Companion — ${phaseLabel(snapshot.companion.phase)}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: phaseLabel(snapshot.companion.phase), enabled: false },
      { type: "separator" },
      { label: "Open Companion", click: showWindow },
      {
        label: "Check for scans now",
        click: () => void controller?.invoke({ type: "check_now" }).catch(showActionError),
      },
      {
        label: "Automatic uploads",
        type: "checkbox",
        checked: snapshot.settings.automaticUploads,
        click: (item) =>
          void controller
            ?.invoke({ type: "set_automatic", enabled: item.checked })
            .catch(showActionError),
      },
      { type: "separator" },
      {
        label: "Open Trader",
        click: () => void controller?.invoke({ type: "open_trader" }).catch(showActionError),
      },
      {
        label: "Open logs",
        click: () => void controller?.invoke({ type: "open_logs" }).catch(showActionError),
      },
      { type: "separator" },
      {
        label: "Quit WoW Trader Companion",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function registerIpc(): void {
  ipcMain.handle(IPC_INVOKE_CHANNEL, async (event: IpcMainInvokeEvent, value: unknown) => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) {
      return rendererResultSchema.parse({
        ok: false,
        code: "untrusted_sender",
        message: "This request did not come from the companion window.",
      });
    }
    const command = rendererCommandSchema.safeParse(value);
    if (!command.success) {
      return rendererResultSchema.parse({
        ok: false,
        code: "invalid_request",
        message: "The companion received an invalid request.",
      });
    }
    try {
      if (!controller) throw new Error("The companion is still starting.");
      return rendererResultSchema.parse({
        ok: true,
        snapshot: await controller.invoke(command.data),
      });
    } catch (error: unknown) {
      return toRendererError(error);
    }
  });
}

function toRendererError(error: unknown): RendererResult {
  const message = error instanceof Error ? error.message : "The requested action failed.";
  return rendererResultSchema.parse({
    ok: false,
    code: classifyActionError(message),
    message,
  });
}

function classifyActionError(message: string): string {
  if (/credential|storage|encryption/i.test(message)) return "credential_error";
  if (/collector|addon/i.test(message)) return "addon_error";
  if (/folder|directory|product/i.test(message)) return "product_error";
  return "action_failed";
}

function configureSessionSecurity(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          ],
        },
      });
    });
  }
}

async function configureRendererProtocol(): Promise<void> {
  if (!app.isPackaged) return;
  const rendererRoot = path.dirname(path.dirname(fileURLToPath(MAIN_WINDOW_WEBPACK_ENTRY)));
  protocol.handle(LOCAL_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "renderer") return new Response("Not found", { status: 404 });
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const requestedPath = path.resolve(rendererRoot, relativePath);
    const relative = path.relative(rendererRoot, requestedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return new Response("Not found", { status: 404 });
    }
    try {
      return new Response(await readFile(requestedPath), {
        headers: { "content-type": contentTypeFor(requestedPath) },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function rendererEntryUrl(): string {
  return app.isPackaged
    ? `${LOCAL_SCHEME}://renderer/main_window/index.html`
    : MAIN_WINDOW_WEBPACK_ENTRY;
}

function isTrustedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (app.isPackaged) return url.protocol === `${LOCAL_SCHEME}:` && url.hostname === "renderer";
    const expected = new URL(MAIN_WINDOW_WEBPACK_ENTRY);
    return url.protocol === expected.protocol && url.host === expected.host;
  } catch {
    return false;
  }
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) mainWindow.hide();
  else showWindow();
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showActionError(error: unknown): void {
  const message = error instanceof Error ? error.message : "The requested action failed.";
  new Notification({ title: "WoW Trader Companion", body: message }).show();
}

function showFatalError(error: unknown): void {
  showActionError(error);
  app.quit();
}

function phaseLabel(phase: CompanionPhase): string {
  const labels: Record<CompanionPhase, string> = {
    setup_required: "Setup required",
    paused: "Automatic uploads paused",
    waiting_for_saved_scan: "Waiting for a saved scan",
    scan_detected: "Scan detected",
    uploading: "Uploading scan",
    processing: "Processing scan",
    up_to_date: "Up to date",
    offline: "Offline — scan safely queued",
    error: "Needs attention",
  };
  return labels[phase];
}

function createTrayIcon(phase: CompanionPhase): Electron.NativeImage {
  const color =
    phase === "error" || phase === "offline"
      ? "#d85b4b"
      : phase === "paused" || phase === "setup_required"
        ? "#9c9484"
        : phase === "up_to_date"
          ? "#78a856"
          : "#d7913a";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#121218" stroke="${color}" stroke-width="2"/><path d="M8 10h3l2 12 3-8 3 8 2-12h3" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"/></svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
