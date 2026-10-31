"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { traderTradeSchema, traderWatchSchema, type TraderWatch } from "@wow-trader/contracts";
import { summarizeTradeLedger } from "@wow-trader/market";
import type { loadTraderAccount } from "../lib/trader-account-data";
import { copperInputValue, goldInputToCopper } from "../lib/trader-account-form";
import { formatCopper } from "../lib/format";
import { withHelperBasePath } from "../lib/site-path";
import {
  refreshTraderWatches,
  saveSyncedTraderWatch,
  useSyncedTraderWatches,
} from "../lib/trader-watch-sync";
import { watchedMarketItemHref, watchedMarketItemKey } from "../lib/market-watchlist";
import styles from "./trader-account.module.css";

function accountTime(value: string): string {
  return value.slice(0, 16).replace("T", " ") + " UTC";
}

type AccountData = Awaited<ReturnType<typeof loadTraderAccount>>;
const previewSchema = z.object({
  code: z.string(),
  label: z.string(),
  expiresAt: z.string().datetime(),
});
const errorSchema = z.object({ message: z.string().max(300).optional() });
export function TraderAccount({
  initial,
  pairingCode,
  fingerprint,
}: {
  readonly initial: AccountData;
  readonly pairingCode: string | null;
  readonly fingerprint: string;
}): React.JSX.Element {
  const router = useRouter(),
    watches = useSyncedTraderWatches();
  const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(null);
  const [previewError, setPreviewError] = useState(""),
    [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [time, setTime] = useState("");
  const pendingEntry = useRef<{ signature: string; eventId: string } | null>(null);
  const summary = summarizeTradeLedger(initial.trades);
  useEffect(() => {
    void refreshTraderWatches(true);
  }, []);
  useEffect(() => {
    const date = new Date();
    setTime(
      new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
    );
  }, []);
  useEffect(() => {
    if (!pairingCode) return;
    const abort = new AbortController();
    void fetch(withHelperBasePath(`/api/trader/pairing/preview?code=${pairingCode}`), {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response: Response): Promise<void> => {
        if (!response.ok)
          throw new Error(
            "This pairing code has expired or was already used. Start a new connection in Companion.",
          );
        setPreview(previewSchema.parse(await response.json()));
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted)
          setPreviewError(
            cause instanceof Error ? cause.message : "The pairing code could not be checked.",
          );
      });
    return () => abort.abort();
  }, [pairingCode]);
  async function post(action: string, value: unknown): Promise<void> {
    const response = await fetch(withHelperBasePath("/api/trader/" + action), {
      method: "POST",
      headers: { "content-type": "application/json", "x-trader-account": fingerprint },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      const parsed = errorSchema.safeParse(await response.json().catch(() => null));
      throw new Error(
        parsed.success && parsed.data.message
          ? parsed.data.message
          : "This change could not be saved. Please retry.",
      );
    }
  }
  async function perform(work: () => Promise<void>, message: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This change could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function record(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    await perform(async (): Promise<void> => {
      const character = initial.characters.find((row) => row.snapshotId === data.get("character"));
      if (!character) throw new Error("Select an uploaded character first.");
      const kind = String(data.get("kind"));
      const value = {
        product: character.product,
        clientBuild: character.clientBuild,
        market: `${character.region}|${character.realm}|${String(data.get("house"))}`,
        characterName: character.name,
        itemId: Number(data.get("itemId")),
        itemName: String(data.get("itemName")),
        quantity: Number(data.get("quantity")),
        kind,
        amountCopper: goldInputToCopper(data.get("amount")) ?? "0",
        auctionFeeCopper: goldInputToCopper(data.get("fee")),
        depositCopper: goldInputToCopper(data.get("deposit")),
        occurredAt: new Date(String(data.get("time"))).toISOString(),
        evidence: "manual",
      };
      const signature = JSON.stringify(value);
      if (pendingEntry.current?.signature !== signature)
        pendingEntry.current = { signature, eventId: crypto.randomUUID() };
      const entry = traderTradeSchema.parse({
        ...value,
        eventId: pendingEntry.current.eventId,
        sourceKey: "manual:" + pendingEntry.current.eventId,
      });
      await post("ledger", entry);
      pendingEntry.current = null;
      form.reset();
    }, "Manual entry saved. It remains separate from confirmed mailbox receipts.");
  }
  return (
    <>
      <nav className={styles.navigation} aria-label="Personal Trader tools">
        <Link href={withHelperBasePath("/forever/trader?mode=items")}>Auction House prices</Link>
        <Link href={withHelperBasePath("/forever/trader/plan")}>My gold plan</Link>
        <Link href={withHelperBasePath("/forever/addon")}>Get Companion</Link>
      </nav>
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      ) : null}
      {pairingCode ? (
        <section className={`${styles.panel} ${styles.pairing}`}>
          <h2>{approved ? "Installation approved" : "Connect this installation"}</h2>
          {approved ? (
            <p>
              Return to Companion. It will finish connecting automatically within a few seconds.
            </p>
          ) : preview ? (
            <>
              <p>
                Only approve this if you started the connection and this code matches Companion.
              </p>
              <strong className={styles.code}>{pairingCode}</strong>
              <p>
                {preview.label} · expires {new Date(preview.expiresAt).toLocaleTimeString()}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(async (): Promise<void> => {
                    await post("pairing/approve", { code: pairingCode });
                    setApproved(true);
                  }, "Companion can now complete its connection.")
                }
              >
                Approve installation
              </button>
            </>
          ) : (
            <p role={previewError ? "alert" : "status"}>
              {previewError || "Checking your pairing code…"}
            </p>
          )}
        </section>
      ) : null}
      <section className={styles.panel}>
        <h2>Connected installations</h2>
        <p>
          In Companion, choose Connect account and approve its matching code here. Up to five
          installations can connect. Revocation stops future uploads and private sync; existing
          records stay in your account.
        </p>
        {initial.devices.length ? (
          <ul className={styles.list}>
            {initial.devices.map((device) => (
              <li key={device.id}>
                <div className={styles.row}>
                  <strong>{device.label}</strong>
                  {device.revokedAt ? (
                    <span>Disconnected</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          () => post("devices/revoke", { id: device.id }),
                          "Installation disconnected.",
                        )
                      }
                    >
                      Revoke access
                    </button>
                  )}
                </div>
                <small>
                  {device.lastSeenAt
                    ? `Last synchronized ${accountTime(device.lastSeenAt)}`
                    : "Waiting for first private sync"}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No installations connected yet. Maintainer token uploads do not claim ownership of
            private characters.
          </p>
        )}
      </section>
      <section className={styles.panel}>
        <h2>Characters and professions</h2>
        <p>
          Log into each alt, open its professions, then /reload to save and upload. Material
          planning uses character stock observed within the last hour and the exact matching game
          build.
        </p>
        {initial.characters.length ? (
          <div className={styles.grid}>
            {initial.characters.map((character) => (
              <article className={styles.panel} key={character.snapshotId}>
                <h3>{character.name}</h3>
                <small>
                  {character.realm} · {character.faction} · build {character.clientBuild}
                </small>
                <p>
                  {character.professions
                    .map(
                      (profession) =>
                        `${profession.name} ${profession.skillLevel}${profession.recipeListComplete ? "" : " (partial recipe list)"}`,
                    )
                    .join(" · ") || "No opened professions recorded"}
                </p>
                <p>
                  {character.recipes.length} known recipes · {character.inventory.length} material
                  stacks/types · {character.inventoryScope}
                </p>
                <small>Observed {accountTime(character.observedAt)}</small>
              </article>
            ))}
          </div>
        ) : (
          <p>No account-owned character snapshots yet.</p>
        )}
      </section>
      <section className={styles.panel}>
        <h2>Watched items and alerts</h2>
        <p>
          Maximum buy price is per unit; minimum profit covers the whole suggested purchase after
          the AH cut. Alerts require fresh scans and enough history. Companion syncs these settings
          into the addon; /reload activates them in game.
        </p>
        {!watches.loaded ? (
          <p role="status">Loading watches…</p>
        ) : watches.connected && watches.items.length ? (
          watches.items.map((item) => (
            <WatchEditor
              key={watchedMarketItemKey(item)}
              item={item}
              onSave={async (value: TraderWatch): Promise<void> => {
                await perform(
                  () => saveSyncedTraderWatch(value),
                  "Watch limits saved. Companion will pick them up on its next sync.",
                );
              }}
              busy={busy || watches.busy}
            />
          ))
        ) : (
          <p>Choose Watch item beside an Auction House result to add your first target.</p>
        )}
        {watches.error ? <p role="alert">{watches.error}</p> : null}
      </section>
      <section className={styles.panel}>
        <h2>Actual trade ledger</h2>
        <p>
          Enable Trade receipts in the addon and collect completed auction mail normally. Only
          successful supported invoice collections are recorded. This view summarizes up to 10,000
          of your latest records; unknown costs and fees are shown explicitly.
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>Recorded purchase spending</dt>
            <dd>{formatCopper(summary.purchaseCostCopper)}</dd>
          </div>
          <div>
            <dt>Recorded gross sales</dt>
            <dd>{formatCopper(summary.grossSalesCopper)}</dd>
          </div>
          <div>
            <dt>Known sale fees</dt>
            <dd>{formatCopper(summary.knownSaleFeesCopper)}</dd>
          </div>
          <div>
            <dt>Known matched margin, after recorded losses</dt>
            <dd>{formatCopper(summary.matchedMarginCopper)}</dd>
          </div>
        </dl>
        <p>
          {summary.confirmedMailEvents} mailbox receipts · {summary.manualEvents} manual entries ·{" "}
          {summary.matchedUnits} sale units with matched purchases and known fees ·{" "}
          {summary.unmatchedSaleUnits} without a purchase cost · {summary.saleUnitsWithUnknownFees}{" "}
          with unknown fees · {summary.expiryEventsWithUnknownDeposits} expiry/cancellation records
          with unknown deposits.
        </p>
        <details>
          <summary>Add an actual trade manually</summary>
          <p>
            Enter total gold for this event, rather than a unit price. Leave unknown fees or
            deposits empty. A recorded collection time does not establish the auction’s sale time.
          </p>
          {initial.characters.length ? (
            <form className={styles.form} onSubmit={(event) => void record(event)} aria-busy={busy}>
              <label>
                Character
                <select name="character" required>
                  {initial.characters.map((character) => (
                    <option value={character.snapshotId} key={character.snapshotId}>
                      {character.name} · {character.realm}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Auction House
                <select name="house" defaultValue="unknown">
                  <option value="unknown">Unknown</option>
                  <option value="alliance">Alliance</option>
                  <option value="horde">Horde</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label>
                Event
                <select name="kind">
                  <option value="purchase">Purchase</option>
                  <option value="sale">Sale</option>
                  <option value="expired">Expired auction</option>
                  <option value="cancelled">Cancelled auction</option>
                </select>
              </label>
              <label>
                Item ID
                <input type="number" name="itemId" min="1" max="100000000" required />
              </label>
              <label>
                Item name
                <input name="itemName" maxLength={200} required />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  name="quantity"
                  min="1"
                  max="1000000"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                Total price (gold)
                <input name="amount" type="number" min="0" max="999999999" step="0.0001" required />
              </label>
              <label>
                Known sale fee (gold)
                <input name="fee" type="number" min="0" max="999999999" step="0.0001" />
              </label>
              <label>
                Known deposit (gold)
                <input name="deposit" type="number" min="0" max="999999999" step="0.0001" />
              </label>
              <label>
                Observed at (your local time)
                <input
                  name="time"
                  type="datetime-local"
                  value={time}
                  onChange={(event) => setTime(event.currentTarget.value)}
                  required
                />
              </label>
              <button type="submit" disabled={busy}>
                Save manual entry
              </button>
            </form>
          ) : (
            <p>
              Upload an account-owned character first so entries can be tied to its realm and game
              build.
            </p>
          )}
        </details>
        {initial.trades.length ? (
          <details>
            <summary>Recent records ({initial.trades.length})</summary>
            <ul className={styles.list}>
              {initial.trades.slice(0, 50).map((trade) => (
                <li key={trade.eventId}>
                  <strong>
                    {trade.kind} · {trade.quantity} {trade.itemName} ·{" "}
                    {formatCopper(trade.amountCopper)}
                  </strong>
                  <small>
                    {trade.characterName} · {trade.market.split("|").join(" / ")} ·{" "}
                    {trade.evidence === "manual" ? "Manual entry" : "Mailbox receipt"} ·{" "}
                    {accountTime(trade.occurredAt)}
                  </small>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p>
            No actual trades recorded yet. Public auction listings do not count as completed sales.
          </p>
        )}
      </section>
    </>
  );
}
function WatchEditor({
  item,
  busy,
  onSave,
}: {
  readonly item: TraderWatch;
  readonly busy: boolean;
  readonly onSave: (item: TraderWatch) => Promise<void>;
}): React.JSX.Element {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await onSave(
        traderWatchSchema.parse({
          ...item,
          maximumBuyCopper: goldInputToCopper(form.get("buy")),
          minimumProfitCopper: goldInputToCopper(form.get("profit")) ?? "0",
          maximumUnits: Number(form.get("units")),
          cooldownMinutes: Number(form.get("cooldown")),
        }),
      );
    } catch {
      setError("Check the buy price, profit, quantity and alert interval.");
    }
  }
  return (
    <details className={styles.watch}>
      <summary>
        {item.name} · {item.market.split("|").join(" / ")}
      </summary>
      <Link href={watchedMarketItemHref(item)}>View market evidence →</Link>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <label>
          Maximum unit price (gold)
          <input
            name="buy"
            type="number"
            min="0.0001"
            max="999999999"
            step="0.0001"
            defaultValue={copperInputValue(item.maximumBuyCopper)}
            placeholder="Use conservative policy"
          />
        </label>
        <label>
          Minimum total profit (gold)
          <input
            name="profit"
            type="number"
            min="0"
            max="999999999"
            step="0.0001"
            defaultValue={copperInputValue(item.minimumProfitCopper)}
          />
        </label>
        <label>
          Maximum units
          <input
            name="units"
            type="number"
            min="1"
            max="100"
            defaultValue={item.maximumUnits}
            required
          />
        </label>
        <label>
          Alert interval (minutes)
          <input
            name="cooldown"
            type="number"
            min="5"
            max="1440"
            defaultValue={item.cooldownMinutes}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          Save limits
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </details>
  );
}
