"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { hasNewerMarketScan } from "../lib/market-scan-refresh";

const STATUS_POLL_INTERVAL_MILLISECONDS = 30_000;

interface MarketScanAutoRefreshProps {
  readonly clientProduct: string;
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: string;
  readonly initialCompletedAt: string;
}

export function MarketScanAutoRefresh({
  clientProduct,
  region,
  realmId,
  auctionHouseType,
  initialCompletedAt,
}: MarketScanAutoRefreshProps): React.JSX.Element {
  const router = useRouter();
  const renderedCompletedAt = useRef(initialCompletedAt);
  const pendingCompletedAt = useRef<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    renderedCompletedAt.current = initialCompletedAt;
    if (
      pendingCompletedAt.current &&
      !hasNewerMarketScan(pendingCompletedAt.current, initialCompletedAt)
    ) {
      pendingCompletedAt.current = null;
      setMessage("Results updated from the latest Auction House scan.");
    }
  }, [initialCompletedAt]);

  useEffect(() => {
    let stopped = false;
    let activeRequest: AbortController | null = null;

    const checkForScan = async (): Promise<void> => {
      if (document.visibilityState !== "visible" || !navigator.onLine || activeRequest) return;
      activeRequest = new AbortController();
      const search = new URLSearchParams({
        product: clientProduct,
        region,
        realm: realmId,
        auctionHouseType,
      });
      try {
        const response = await fetch(`/api/v1/market-scan-status?${search.toString()}`, {
          cache: "no-store",
          signal: activeRequest.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        const completedAt = readCompletedAt(body);
        if (
          !stopped &&
          response.ok &&
          completedAt &&
          hasNewerMarketScan(completedAt, renderedCompletedAt.current)
        ) {
          pendingCompletedAt.current = completedAt;
          setMessage("New Auction House scan detected. Updating results…");
          router.refresh();
        }
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("Automatic scan check will retry in the background.");
        }
      } finally {
        activeRequest = null;
      }
    };

    const interval = window.setInterval(
      () => void checkForScan(),
      STATUS_POLL_INTERVAL_MILLISECONDS,
    );
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void checkForScan();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void checkForScan();

    return () => {
      stopped = true;
      activeRequest?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [auctionHouseType, clientProduct, realmId, region, router]);

  return (
    <span aria-live="polite" className="market-auto-refresh-status" role="status">
      {message}
    </span>
  );
}

function readCompletedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("completedAt" in value)) return null;
  return typeof value.completedAt === "string" ? value.completedAt : null;
}
