import { contextBridge, ipcRenderer } from "electron";

import type { ProductKind } from "@wow-trader/companion-core";

import {
  desktopSnapshotSchema,
  IPC_INVOKE_CHANNEL,
  IPC_SNAPSHOT_CHANNEL,
  rendererResultSchema,
  type DesktopSnapshot,
  type RendererCommand,
} from "../shared/contracts.js";
import type { WowTraderDesktopApi } from "../shared/desktop-api.js";

async function invoke(command: RendererCommand): Promise<DesktopSnapshot> {
  const result = rendererResultSchema.parse(await ipcRenderer.invoke(IPC_INVOKE_CHANNEL, command));
  if (!result.ok) throw new Error(result.message);
  return result.snapshot;
}

const api: WowTraderDesktopApi = {
  getSnapshot: () => invoke({ type: "get_snapshot" }),
  checkNow: () => invoke({ type: "check_now" }),
  retry: () => invoke({ type: "retry" }),
  setAutomaticUploads: (enabled) => invoke({ type: "set_automatic", enabled }),
  setStartAtLogin: (enabled) => invoke({ type: "set_start_at_login", enabled }),
  setNotifications: (enabled) => invoke({ type: "set_notifications", enabled }),
  chooseProductRoot: (product: ProductKind) => invoke({ type: "choose_product_root", product }),
  installCollector: (productId) => invoke({ type: "install_collector", productId }),
  saveCredential: (credential) => invoke({ type: "save_credential", credential }),
  removeCredential: () => invoke({ type: "remove_credential" }),
  disableLegacyService: () => invoke({ type: "disable_legacy_service" }),
  openTrader: () => invoke({ type: "open_trader" }),
  openLogs: () => invoke({ type: "open_logs" }),
  subscribe: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      const result = desktopSnapshotSchema.safeParse(value);
      if (result.success) listener(result.data);
    };
    ipcRenderer.on(IPC_SNAPSHOT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(IPC_SNAPSHOT_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld("wowTrader", api);
