"use client";

import { useCallback, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

import { normalizeSeoRumRoute, type SeoRumMetric } from "../lib/seo-rum";
import { withHelperBasePath } from "../lib/site-path";

interface ReportedMetric {
  readonly name: string;
  readonly value: number;
  readonly rating?: string;
}

export function SeoWebVitals({
  build,
  sampleRate,
}: {
  readonly build: string;
  readonly sampleRate: number;
}): null {
  const sampled = useRef<boolean | null>(null);
  const report = useCallback(
    (metric: ReportedMetric): void => {
      if (sampled.current === null) sampled.current = randomSample() < sampleRate;
      if (!sampled.current || !isSupportedMetric(metric.name) || !isRating(metric.rating)) return;
      const routeTemplate = normalizeSeoRumRoute(window.location.pathname);
      if (!routeTemplate) return;
      const payload: SeoRumMetric = {
        schema: "seo-rum.v1",
        routeTemplate,
        build,
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        device: window.innerWidth <= 768 ? "mobile" : "desktop",
      };
      void fetch(withHelperBasePath("/api/v1/seo/vitals"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    },
    [build, sampleRate],
  );
  useReportWebVitals(report);
  return null;
}

function randomSample(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return (value[0] ?? 0) / 2 ** 32;
}

function isSupportedMetric(value: string): value is SeoRumMetric["metric"] {
  return ["CLS", "FCP", "INP", "LCP", "TTFB"].includes(value);
}

function isRating(value: string | undefined): value is SeoRumMetric["rating"] {
  return value === "good" || value === "needs-improvement" || value === "poor";
}
