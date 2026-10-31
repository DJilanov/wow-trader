import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { TraderAccount } from "../../../../components/trader-account";
import { guideDiscordId, guideSignIn, guideSignOut } from "../../../../lib/guide-auth";
import { readGuideAccessSettings } from "../../../../lib/guide-access-config";
import { loadTraderAccount } from "../../../../lib/trader-account-data";
import { withHelperBasePath } from "../../../../lib/site-path";
import styles from "../../../../components/trader-account.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Trader account",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly code?: string }>;
}): Promise<React.JSX.Element> {
  const { code: candidate } = await searchParams;
  const code =
    typeof candidate === "string" && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(candidate) ? candidate : null;
  const returnTo = "/tools/forever/trader/account" + (code ? `?code=${code}` : "");
  const settings = readGuideAccessSettings();
  const ownerId = await guideDiscordId();
  async function signIn(): Promise<void> {
    "use server";
    if (readGuideAccessSettings().ready) await guideSignIn("discord", { redirectTo: returnTo });
  }
  async function signOut(): Promise<void> {
    "use server";
    await guideSignOut({ redirectTo: "/tools/forever/trader/account" });
  }
  if (!ownerId)
    return (
      <article className={styles.shell}>
        <header>
          <span className="eyebrow">WoW Trader · private account</span>
          <h1>Your characters. Your gold plan.</h1>
          <p>
            Connect Companion to keep your characters, actual trade receipts and watched-item limits
            together across devices. Public scan prices remain available to everyone.
          </p>
        </header>
        <section className={styles.panel}>
          <h2>{code ? "Sign in to approve Companion" : "Connect with Discord"}</h2>
          {code ? (
            <p>
              After signing in, compare code <strong>{code}</strong> with the one shown in Companion
              before approving the installation.
            </p>
          ) : null}
          {settings.ready ? (
            <form action={signIn}>
              <button type="submit">Sign in with Discord</button>
            </form>
          ) : (
            <p role="status">
              Account sign-in is temporarily unavailable. You can still browse public market prices.
            </p>
          )}
          <p>
            We use your Discord account ID to keep your data private. Your Discord password stays
            with Discord.
          </p>
        </section>
        <Link href={withHelperBasePath("/forever/trader?mode=items")}>
          Browse Auction House prices →
        </Link>
      </article>
    );
  let data: Awaited<ReturnType<typeof loadTraderAccount>>;
  try {
    data = await loadTraderAccount(ownerId);
  } catch {
    return (
      <article className={styles.shell}>
        <h1>My Trader account</h1>
        <p role="alert">
          Your private data is temporarily unavailable. Please reload this page to retry.
        </p>
      </article>
    );
  }
  return (
    <article className={styles.shell}>
      <header className={styles.row}>
        <div>
          <span className="eyebrow">WoW Trader · private account</span>
          <h1>My Trader account</h1>
        </div>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <TraderAccount
        initial={data}
        pairingCode={code}
        fingerprint={createHash("sha256")
          .update("trader-account:" + ownerId)
          .digest("hex")}
      />
    </article>
  );
}
