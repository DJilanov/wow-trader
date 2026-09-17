"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_POLL_INTERVAL_MILLISECONDS = 30_000;

interface MarketScanAutoRefreshProps {
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: string;
  readonly initialCompletedAt: string;
}

export function MarketScanAutoRefresh({
  region,
  realmId,
  auctionHouseType,
  initialCompletedAt,
}: MarketScanAutoRefreshProps): React.JSX.Element {
  const router = useRouter();
  const latestCompletedAt = useRef(initialCompletedAt);
  const [message, setMessage] = useState("");

  useEffect(() => {
    latestCompletedAt.current = initialCompletedAt;
  }, [initialCompletedAt]);

  useEffect(() => {
    let stopped = false;
    let activeRequest: AbortController | null = null;

    const checkForScan = async (): Promise<void> => {
      if (document.visibilityState !== "visible" || !navigator.onLine || activeRequest) return;
      activeRequest = new AbortController();
      const search = new URLSearchParams({ region, realm: realmId, auctionHouseType });
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
          Date.parse(completedAt) > Date.parse(latestCompletedAt.current)
        ) {
          latestCompletedAt.current = completedAt;
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

    return () => {
      stopped = true;
      activeRequest?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [auctionHouseType, realmId, region, router]);

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
