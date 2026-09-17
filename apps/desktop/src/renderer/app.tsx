import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { CompanionPhase, ProductKind } from "@wow-trader/companion-core";

import type { DesktopProductStatus, DesktopSnapshot } from "../shared/contracts.js";

interface ActionState {
  readonly key: string;
  readonly error: string | null;
}

const INITIAL_ACTION: ActionState = { key: "", error: null };

export function App(): ReactNode {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>(INITIAL_ACTION);
  const [credential, setCredential] = useState("");

  useEffect(() => {
    let mounted = true;
    const unsubscribe = window.wowTrader.subscribe((nextSnapshot) => {
      if (mounted) setSnapshot(nextSnapshot);
    });
    void window.wowTrader.getSnapshot().then(
      (nextSnapshot) => mounted && setSnapshot(nextSnapshot),
      (error: unknown) => mounted && setLoadError(errorMessage(error)),
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const perform = useCallback(
    async (key: string, operation: () => Promise<DesktopSnapshot>): Promise<boolean> => {
      setAction({ key, error: null });
      try {
        setSnapshot(await operation());
        setAction(INITIAL_ACTION);
        return true;
      } catch (error: unknown) {
        setAction({ key: "", error: errorMessage(error) });
        return false;
      }
    },
    [],
  );

  const submitCredential = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void perform("credential", () => window.wowTrader.saveCredential(credential)).then((saved) => {
      if (saved) setCredential("");
    });
  };

  if (loadError) {
    return (
      <main className="fatal-state">
        <Brand />
        <h1>Companion could not start</h1>
        <p>{loadError}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload application
        </button>
      </main>
    );
  }
  if (!snapshot) {
    return (
      <main className="loading-state" aria-busy="true">
        <Brand />
        <span className="spinner" aria-hidden="true" />
        <p>Looking for World of Warcraft…</p>
      </main>
    );
  }

  const status = statusPresentation(snapshot.companion.phase);
  const busy = action.key !== "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <span className="version">v{snapshot.appVersion}</span>
      </header>

      <section className={`status-hero status-${status.tone}`} aria-live="polite">
        <span className="status-orb" aria-hidden="true" />
        <div>
          <span className="eyebrow">{status.label}</span>
          <h1>{snapshot.companion.message}</h1>
          <p>{nextAction(snapshot.companion.phase)}</p>
        </div>
        {(snapshot.companion.phase === "offline" || snapshot.companion.phase === "error") && (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void perform("retry", window.wowTrader.retry)}
          >
            {action.key === "retry" ? "Retrying…" : "Retry upload"}
          </button>
        )}
      </section>

      {action.error && (
        <div className="notice error-notice" role="alert">
          <span>{action.error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setAction(INITIAL_ACTION)}
          >
            ×
          </button>
        </div>
      )}

      {!snapshot.credentialConfigured && (
        <section className="panel setup-panel">
          <div className="step-number">1</div>
          <div className="panel-copy">
            <span className="eyebrow">Connect this installation</span>
            <h2>Add your private collector token</h2>
            <p>
              Maintainer alpha only. The token is encrypted by your operating system and is never
              stored in settings or logs.
            </p>
            <form className="credential-form" onSubmit={submitCredential}>
              <label htmlFor="credential">Collector token</label>
              <div>
                <input
                  id="credential"
                  type="password"
                  autoComplete="off"
                  minLength={16}
                  required
                  value={credential}
                  onChange={(event) => setCredential(event.currentTarget.value)}
                  placeholder="Paste the token once"
                />
                <button
                  className="button primary"
                  type="submit"
                  disabled={credential.trim().length < 16 || busy}
                >
                  {action.key === "credential" ? "Saving…" : "Connect"}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {snapshot.legacyServiceDetected && (
        <div className="notice warning-notice">
          <div>
            <strong>Old background watcher detected</strong>
            <span>Disable it to prevent two uploaders from running together.</span>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void perform("legacy", () => window.wowTrader.disableLegacyService())}
          >
            Disable old watcher
          </button>
        </div>
      )}

      <section className="section-block" aria-labelledby="installations-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Game installations</span>
            <h2 id="installations-heading">Collector health</h2>
          </div>
          <div className="add-product-actions">
            <button
              type="button"
              onClick={() =>
                void perform("choose-tbc", () => window.wowTrader.chooseProductRoot("tbc"))
              }
              disabled={busy}
            >
              + TBC folder
            </button>
            <button
              type="button"
              onClick={() =>
                void perform("choose-forever", () => window.wowTrader.chooseProductRoot("forever"))
              }
              disabled={busy}
            >
              + Forever folder
            </button>
          </div>
        </div>
        {snapshot.products.length === 0 ? (
          <div className="empty-products">
            <GameMark kind="tbc" />
            <div>
              <h3>No World of Warcraft installation found</h3>
              <p>Choose your TBC or Forever product folder to get started.</p>
            </div>
          </div>
        ) : (
          <div className="product-grid">
            {snapshot.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                busyKey={action.key}
                onInstall={() =>
                  perform(`install-${product.id}`, () =>
                    window.wowTrader.installCollector(product.id),
                  )
                }
                onChoose={() =>
                  perform(`choose-${product.kind}`, () =>
                    window.wowTrader.chooseProductRoot(product.kind),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="scan-panel" aria-labelledby="scan-heading">
        <div className="scan-flow" aria-hidden="true">
          <span>AH</span>
          <i /> <span>SCAN</span>
          <i /> <span>/RELOAD</span>
          <i /> <span>TRADER</span>
        </div>
        <div>
          <span className="eyebrow">How collection works</span>
          <h2 id="scan-heading">Scan in game, save, and the rest is automatic.</h2>
          <p>
            Open the Auction House and run an Auctionator full scan. WoW writes the result after{" "}
            <code>/reload</code> or logout; the companion then validates and uploads it.
          </p>
        </div>
        <button
          className="button primary"
          type="button"
          disabled={busy || !snapshot.credentialConfigured}
          onClick={() => void perform("check", window.wowTrader.checkNow)}
        >
          {action.key === "check" ? "Checking…" : "Check for scans now"}
        </button>
      </section>

      <section className="two-column">
        <div className="panel settings-panel">
          <span className="eyebrow">Background behavior</span>
          <h2>Companion settings</h2>
          <Toggle
            label="Automatic uploads"
            description="Watch for saved scans while this app is running."
            checked={snapshot.settings.automaticUploads}
            disabled={busy}
            onChange={(enabled) =>
              void perform("automatic", () => window.wowTrader.setAutomaticUploads(enabled))
            }
          />
          <Toggle
            label="Start at login"
            description="Start quietly in the system tray."
            checked={snapshot.settings.startAtLogin}
            disabled={busy}
            onChange={(enabled) =>
              void perform("login", () => window.wowTrader.setStartAtLogin(enabled))
            }
          />
          <Toggle
            label="Notifications"
            description="Only upload success and actionable failures."
            checked={snapshot.settings.notificationsEnabled}
            disabled={busy}
            onChange={(enabled) =>
              void perform("notifications", () => window.wowTrader.setNotifications(enabled))
            }
          />
        </div>

        <div className="panel activity-panel">
          <span className="eyebrow">Recent activity</span>
          <h2>Processed scans</h2>
          {snapshot.recentActivity.length === 0 ? (
            <p className="muted-copy">No scans have been processed on this computer yet.</p>
          ) : (
            <ol>
              {snapshot.recentActivity.map((entry) => (
                <li key={`${entry.scanId}-${entry.occurredAt}`}>
                  <span className={`activity-dot ${entry.status}`} />
                  <div>
                    <strong>{entry.characterLabel ?? "Private character"}</strong>
                    <small>
                      {formatDate(entry.occurredAt)} · {entry.marketCount ?? "?"} markets ·{" "}
                      {entry.receipt ?? entry.status} · {shortId(entry.scanId)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <footer>
        <button type="button" onClick={() => void window.wowTrader.openTrader()}>
          Open Trader
        </button>
        <button type="button" onClick={() => void window.wowTrader.openLogs()}>
          Open logs
        </button>
        {snapshot.credentialConfigured && (
          <button
            className="danger-link"
            type="button"
            onClick={() => void perform("disconnect", window.wowTrader.removeCredential)}
          >
            Disconnect token
          </button>
        )}
        <span>Closing this window keeps the tray companion running.</span>
      </footer>
    </main>
  );
}

interface ProductCardProps {
  readonly product: DesktopProductStatus;
  readonly busyKey: string;
  readonly onInstall: () => Promise<unknown>;
  readonly onChoose: () => Promise<unknown>;
}

function ProductCard({ product, busyKey, onInstall, onChoose }: ProductCardProps): ReactNode {
  const collectorLabel = {
    ready: `Collector ${product.collectorVersion ?? "installed"}`,
    outdated: `Collector ${product.collectorVersion ?? "outdated"}`,
    missing: "Collector missing",
    unavailable: "Folder unavailable",
  }[product.collectorHealth];
  const needsInstall =
    product.collectorHealth === "missing" || product.collectorHealth === "outdated";
  return (
    <article className="product-card">
      <GameMark kind={product.kind} />
      <div className="product-title">
        <span className="eyebrow">{product.kind === "tbc" ? "TBC" : "Forever"}</span>
        <h3>{product.label}</h3>
      </div>
      <div className="health-list">
        <HealthRow
          good={product.rootExists}
          label={product.rootExists ? "Game folder found" : "Game folder missing"}
        />
        <HealthRow
          good={product.auctionatorInstalled}
          label={product.auctionatorInstalled ? "Auctionator detected" : "Auctionator not detected"}
        />
        <HealthRow good={product.collectorHealth === "ready"} label={collectorLabel} />
      </div>
      <dl>
        <div>
          <dt>Accounts found</dt>
          <dd>{product.collectorFileCount}</dd>
        </div>
        <div>
          <dt>Latest saved file</dt>
          <dd>
            {product.latestFileModifiedAt ? formatDate(product.latestFileModifiedAt) : "Not yet"}
          </dd>
        </div>
      </dl>
      <div className="product-actions">
        {needsInstall && product.rootExists && (
          <button
            className="button primary"
            type="button"
            disabled={busyKey !== ""}
            onClick={() => void onInstall()}
          >
            {busyKey === `install-${product.id}`
              ? "Installing…"
              : product.collectorHealth === "outdated"
                ? "Update collector"
                : "Install collector"}
          </button>
        )}
        <button
          className="button quiet"
          type="button"
          disabled={busyKey !== ""}
          onClick={() => void onChoose()}
        >
          Change folder
        </button>
      </div>
    </article>
  );
}

function HealthRow({ good, label }: { readonly good: boolean; readonly label: string }): ReactNode {
  return (
    <div className={good ? "health-good" : "health-warning"}>
      <span aria-hidden="true">{good ? "✓" : "!"}</span>
      {label}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (enabled: boolean) => void;
}): ReactNode {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function Brand(): ReactNode {
  return (
    <div className="brand">
      <span className="brand-mark">KFC</span>
      <div>
        <strong>WoW Trader</strong>
        <small>Desktop companion</small>
      </div>
    </div>
  );
}

function GameMark({ kind }: { readonly kind: ProductKind }): ReactNode {
  return (
    <div
      className={`game-mark game-${kind}`}
      aria-label={kind === "tbc" ? "The Burning Crusade" : "WoW Forever"}
    >
      <span>{kind === "tbc" ? "TBC" : "∞"}</span>
    </div>
  );
}

function statusPresentation(phase: CompanionPhase): {
  readonly label: string;
  readonly tone: string;
} {
  const values: Record<CompanionPhase, { readonly label: string; readonly tone: string }> = {
    setup_required: { label: "Setup required", tone: "warning" },
    paused: { label: "Automatic uploads paused", tone: "neutral" },
    waiting_for_saved_scan: { label: "Ready and watching", tone: "ready" },
    scan_detected: { label: "New scan detected", tone: "active" },
    uploading: { label: "Uploading securely", tone: "active" },
    processing: { label: "Server processing", tone: "active" },
    up_to_date: { label: "Everything is current", tone: "success" },
    offline: { label: "Connection unavailable", tone: "warning" },
    error: { label: "Action required", tone: "error" },
  };
  return values[phase];
}

function nextAction(phase: CompanionPhase): string {
  if (phase === "setup_required")
    return "Connect a token and make sure the collector addon is installed.";
  if (phase === "paused") return "Enable automatic uploads or check manually when you are ready.";
  if (phase === "waiting_for_saved_scan")
    return "Run an Auctionator full scan, then /reload or log out in WoW.";
  if (phase === "offline")
    return "Your scan stays on this computer and will retry after the connection returns.";
  if (phase === "error") return "Review the message, repair the setup if needed, then retry.";
  if (phase === "up_to_date")
    return "The Trader can now use the latest scan saved by this computer.";
  return "Keep the companion running while this finishes.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The requested action failed.";
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
