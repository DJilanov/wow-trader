import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { JsonLd } from "../../../components/json-ld";
import { getCompanionRelease } from "../../../lib/companion-release";
import { createHelperMetadata, HELPER_SITE_URL } from "../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "Download WoW Trader Collector for WoW Forever",
  description:
    "Install the WoW Trader Collector addon and desktop Companion to scan the WoW Forever Auction House and upload build-aware market data safely.",
  path: "/forever/addon",
  keywords: [
    "WoW Forever addon",
    "WoW Forever Auction House scanner",
    "WoW Trader Collector",
    "WoW Forever gold addon",
  ],
});

export default async function ForeverAddonPage(): Promise<React.JSX.Element> {
  const release = await getCompanionRelease();
  const recommendedAsset = release?.assets.find((asset) => asset.recommended) ?? null;
  const structuredData = release
    ? {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "WoW Trader Companion",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: release.assets.map((asset) => asset.platform).join(", "),
        softwareVersion: release.version,
        downloadUrl: `${HELPER_SITE_URL}/forever/addon`,
        isAccessibleForFree: true,
        description:
          "Installs the WoW Trader Collector addon and uploads completed Auction House scans after World of Warcraft saves them.",
        provider: { "@id": "https://kfcguild.online/#organization" },
      }
    : null;

  return (
    <article className="addon-page">
      {structuredData ? <JsonLd data={structuredData} /> : null}
      <header className="addon-hero">
        <Image
          alt="World of Warcraft Forever"
          className="addon-game-mark"
          height={144}
          priority
          src="/wow-assets/games/forever-logo.jpg"
          width={144}
        />
        <div>
          <span className="eyebrow">WoW Forever addon + desktop companion</span>
          <h1>Turn your Auction House scan into useful market intelligence.</h1>
          <p>
            The in-game Collector reads the Auction House. The Companion installs the addon, watches
            for saved scans, validates them, and sends only the collector data to KFC Helper.
          </p>
          <div className="addon-hero-actions">
            {recommendedAsset ? (
              <a className="primary-action" href={`/downloads/companion/${recommendedAsset.id}`}>
                Download {recommendedAsset.label}
              </a>
            ) : (
              <span className="primary-action disabled" aria-disabled="true">
                Release package unavailable
              </span>
            )}
            <Link className="secondary-action" href="/forever/trader">
              Open Forever Trader
            </Link>
          </div>
        </div>
      </header>

      {release ? (
        <section className="download-release" aria-labelledby="download-heading">
          <div className="download-release-heading">
            <div>
              <span className="eyebrow">Current release</span>
              <h2 id="download-heading">Companion {release.version}</h2>
            </div>
            <span className={`release-channel ${release.channel}`}>
              {release.channel === "public" ? "Public release" : "Maintainer alpha"}
            </span>
          </div>
          {release.channel === "maintainer-alpha" ? (
            <div className="download-warning" role="note">
              <strong>Early-access build</strong>
              <span>
                This release requires a private collector token and may be unsigned. Only approved
                testers should install it while public pairing and code signing are completed.
              </span>
            </div>
          ) : null}
          <div className="download-grid">
            {release.assets.map((asset) => (
              <article className="download-card" key={asset.id}>
                <div>
                  <span>{asset.platform === "macos" ? "macOS" : "Windows"}</span>
                  <h3>{asset.label}</h3>
                  <p>
                    {asset.architecture} · {formatBytes(asset.byteSize)} ·{" "}
                    {asset.signed ? "signed" : "unsigned alpha"}
                  </p>
                </div>
                <a href={`/downloads/companion/${asset.id}`}>Download</a>
                <code title={asset.sha256}>SHA-256 {asset.sha256.slice(0, 16)}…</code>
              </article>
            ))}
          </div>
          <ul className="release-notes">
            {release.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="release-meta">
            Collector {release.collectorVersion}
            {release.minimumMacOs ? ` · macOS ${release.minimumMacOs}+` : ""} · Published{" "}
            {new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(
              new Date(release.publishedAt),
            )}
          </p>
        </section>
      ) : (
        <section className="download-release download-unavailable">
          <h2>Release package is being prepared</h2>
          <p>The website will expose a download only when its version, size, and checksum agree.</p>
        </section>
      )}

      <section className="addon-steps" aria-labelledby="install-heading">
        <div>
          <span className="eyebrow">Installation</span>
          <h2 id="install-heading">One app, four clear steps</h2>
        </div>
        <ol>
          <li>
            <strong>Install the Companion</strong>
            <span>Open the downloaded package and launch WoW Trader Companion.</span>
          </li>
          <li>
            <strong>Install the Collector</strong>
            <span>The Companion detects Forever and installs or updates the in-game addon.</span>
          </li>
          <li>
            <strong>Scan in game</strong>
            <span>Open the Auction House and run /wowtrader scan from the addon panel.</span>
          </li>
          <li>
            <strong>Save and upload</strong>
            <span>Use /reload or log out. The Companion detects and uploads the saved scan.</span>
          </li>
        </ol>
      </section>

      <section className="addon-trust-grid" aria-label="Collector privacy and security">
        <div className="panel">
          <span className="eyebrow">What is collected</span>
          <h2>Auction market evidence</h2>
          <p>
            Product/build, realm, faction, scan timestamps, item market keys, price levels,
            quantities, listing counts, and scan-quality diagnostics.
          </p>
        </div>
        <div className="panel">
          <span className="eyebrow">What is not collected</span>
          <h2>No game login or payment data</h2>
          <p>
            The Companion never asks for your Battle.net password. Upload credentials are stored by
            the operating system and are excluded from settings, scan files, and logs.
          </p>
        </div>
        <div className="panel">
          <span className="eyebrow">Why a Companion is needed</span>
          <h2>Addons cannot upload directly</h2>
          <p>
            WoW writes SavedVariables only after a reload or logout. The desktop app handles the
            external upload after validating that saved collector payload.
          </p>
        </div>
      </section>
    </article>
  );
}

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(mebibytes >= 100 ? 0 : 1)} MB`;
}
