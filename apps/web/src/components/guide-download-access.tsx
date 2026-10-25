"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { GUIDE_HOME } from "../lib/guide-access-config";
import { withHelperBasePath } from "../lib/site-path";
import { LevelingRestedXpExport } from "./leveling-restedxp-export";
import type { CampaignPlan, PremadeProgress } from "@wow-trader/leveling";
import styles from "./leveling-experience.module.css";
import exportStyles from "./leveling-restedxp-export.module.css";

const accessSchema = z.object({
  state: z.enum(["unavailable", "signed_out", "certified", "supporter", "restricted"]),
  downloadsEnabled: z.boolean(),
  paymentsEnabled: z.boolean(),
  payment: z.enum(["none", "pending", "paid", "approved", "failed", "revoked", "unavailable"]),
});
interface GuideAccessProps {
  readonly plan?: CampaignPlan;
  readonly progress?: PremadeProgress;
}

export function GuideDownloadAccess({ plan, progress }: GuideAccessProps): React.JSX.Element {
  const [access, setAccess] = useState<z.infer<typeof accessSchema> | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function refresh(signal?: AbortSignal): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch(withHelperBasePath("/api/v1/guide-access"), {
        cache: "no-store",
        signal: signal ?? AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error("Access check unavailable. Try again shortly.");
      setAccess(accessSchema.parse(await response.json()));
      setError(null);
    } catch (failure: unknown) {
      if (!signal?.aborted)
        setError(failure instanceof Error ? failure.message : "Access check unavailable.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return (): void => controller.abort();
  }, []);
  const entitled = access?.state === "certified" || access?.state === "supporter";
  async function checkout(): Promise<void> {
    if (paying) return;
    setPaying(true);
    setError(null);
    try {
      const response = await fetch(withHelperBasePath("/api/v1/guide-support"), {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(35_000),
      });
      if (!response.ok)
        throw new Error(
          "Checkout could not start. Check access before trying again; do not pay twice.",
        );
      const value = z.object({ checkoutUrl: z.url() }).parse(await response.json());
      const url = new URL(value.checkoutUrl);
      if (
        url.protocol !== "https:" ||
        !["checkout.revolut.com", "sandbox-checkout.revolut.com"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port
      )
        throw new Error("Invalid payment destination.");
      window.location.assign(url.href);
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Checkout unavailable.");
      setPaying(false);
    }
  }
  if (entitled && access.downloadsEnabled && plan && progress)
    return <LevelingRestedXpExport plan={plan} progress={progress} mode="member" />;
  const returnTo = plan
    ? `${GUIDE_HOME}/routes/alliance-${plan.race}?plan=premade&class=${plan.leaderClass || "warrior"}`
    : GUIDE_HOME;
  return (
    <section
      className={`${styles.continueCard} ${exportStyles.panel}`}
      aria-labelledby="guide-download-heading"
      data-guide-access={loading ? "loading" : (access?.state ?? "unavailable")}
    >
      <span className="eyebrow">KFC guide edition</span>
      <h2 id="guide-download-heading">Your route, in RestedXP</h2>
      <p>
        The web planner and reader are free. Addon ZIP and paste-import downloads are included with
        the KFC Certified role or approved US$9.99 supporter access.
      </p>
      {loading ? (
        <p role="status">Checking download access…</p>
      ) : (
        <>
          {access?.state === "signed_out" && plan && (
            <a
              className={styles.button}
              href={`${GUIDE_HOME}/access?returnTo=${encodeURIComponent(returnTo)}`}
            >
              Sign in with Discord
            </a>
          )}
          {access?.state === "unavailable" && (
            <p>Download access is temporarily unavailable. You can still use the full web guide.</p>
          )}
          {access?.state === "restricted" && (
            <p>
              Joining KFC Discord is not enough: free downloads require the KFC Certified role.
              Supporter payments are verified separately.
            </p>
          )}
          {entitled && (
            <p>
              Your {access?.state === "certified" ? "KFC Certified" : "supporter"} access is
              verified.{" "}
              {access?.downloadsEnabled
                ? "Open your selected route to download its guide."
                : "The downloadable edition is still awaiting release approval; the web guide is available now."}
            </p>
          )}
          {access?.payment === "pending" && (
            <p role="status">
              Payment is pending. Do not pay again; check access after Revolut confirms it.
            </p>
          )}
          {access?.payment === "paid" && (
            <p role="status">
              Payment received. Staff approval is pending. Do not pay again; contact KFC staff with
              your Discord account.
            </p>
          )}
          {access?.payment === "revoked" && (
            <p>Supporter access is inactive. Contact KFC staff before making another payment.</p>
          )}
          {access?.paymentsEnabled &&
            access.state === "restricted" &&
            ["none", "failed", "pending"].includes(access.payment) && (
              <>
                <p>
                  One-time US$9.99 contribution. Access unlocks after payment verification and staff
                  approval.
                </p>
                <button
                  type="button"
                  className={styles.button}
                  disabled={paying}
                  onClick={(): void => {
                    void checkout();
                  }}
                >
                  {paying
                    ? "Opening Revolut…"
                    : access.payment === "pending"
                      ? "Resume Revolut payment"
                      : "Support KFC · US$9.99"}
                </button>
              </>
            )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={exportStyles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.quietButton}
          type="button"
          disabled={loading || paying}
          onClick={(): void => {
            void refresh();
          }}
        >
          Check access
        </button>
        <a className={styles.quietButton} href={returnTo}>
          Return to free web guide
        </a>
        {access && !["signed_out", "unavailable"].includes(access.state) && (
          <a href={`${GUIDE_HOME}/access`}>Account</a>
        )}
      </div>
    </section>
  );
}
