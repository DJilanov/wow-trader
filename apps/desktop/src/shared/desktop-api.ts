import type { ProductKind } from "@wow-trader/companion-core";

import type { DesktopSnapshot } from "./contracts.js";

export interface WowTraderDesktopApi {
  getSnapshot(): Promise<DesktopSnapshot>;
  checkNow(): Promise<DesktopSnapshot>;
  retry(): Promise<DesktopSnapshot>;
  setAutomaticUploads(enabled: boolean): Promise<DesktopSnapshot>;
  setStartAtLogin(enabled: boolean): Promise<DesktopSnapshot>;
  setNotifications(enabled: boolean): Promise<DesktopSnapshot>;
  chooseProductRoot(product: ProductKind): Promise<DesktopSnapshot>;
  installCollector(productId: string): Promise<DesktopSnapshot>;
  saveCredential(credential: string): Promise<DesktopSnapshot>;
  removeCredential(): Promise<DesktopSnapshot>;
  disableLegacyService(): Promise<DesktopSnapshot>;
  openTrader(): Promise<DesktopSnapshot>;
  openLogs(): Promise<DesktopSnapshot>;
  subscribe(listener: (snapshot: DesktopSnapshot) => void): () => void;
}

declare global {
  interface Window {
    readonly wowTrader: WowTraderDesktopApi;
  }
}
