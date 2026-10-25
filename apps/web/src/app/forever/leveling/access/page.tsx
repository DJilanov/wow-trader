import type { Metadata } from "next";
import { GuideDownloadAccess } from "../../../../components/guide-download-access";
import { guideDiscordId, guideSignIn, guideSignOut } from "../../../../lib/guide-auth";
import { guideReturnPath, readGuideAccessSettings } from "../../../../lib/guide-access-config";
import styles from "../../../../components/leveling-experience.module.css";
import accessStyles from "../../../../components/leveling-restedxp-export.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "KFC Guide Access",
  robots: { index: false, follow: false },
};
interface AccessProps {
  readonly searchParams: Promise<{ readonly returnTo?: string; readonly error?: string }>;
}
export default async function GuideAccessPage({
  searchParams,
}: AccessProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const returnTo = guideReturnPath(query.returnTo);
  const settings = readGuideAccessSettings();
  let signedIn = false;
  try {
    signedIn = Boolean(await guideDiscordId());
  } catch {
    /* Access remains locked on authentication failure. */
  }
  async function signIn(): Promise<void> {
    "use server";
    if (readGuideAccessSettings().ready) await guideSignIn("discord", { redirectTo: returnTo });
  }
  async function signOut(): Promise<void> {
    "use server";
    await guideSignOut({ redirectTo: returnTo });
  }
  return (
    <article className={styles.page}>
      <header className={accessStyles.accessHeader}>
        <span className="eyebrow">KFC Guild</span>
        <h1>Guide access</h1>
        <p>The web guide is free. Sign in to check your KFC Certified role or supporter access.</p>
      </header>
      {query.error && (
        <p role="alert">
          Discord sign-in could not finish. Start a fresh sign-in below; no payment or access was
          changed.
        </p>
      )}
      {settings.ready && (
        <form action={signedIn ? signOut : signIn} className={accessStyles.accessForm}>
          <button type="submit" className={styles.button}>
            {signedIn ? "Sign out of Discord" : "Sign in with Discord"}
          </button>
        </form>
      )}
      <GuideDownloadAccess />
    </article>
  );
}
