import Image from "next/image";
import type { Metadata } from "next";
import { LevelingSetup } from "../../../components/leveling-setup";
import { JsonLd } from "../../../components/json-ld";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../lib/seo";
import styles from "../../../components/leveling-experience.module.css";
import { getLevelingArchiveManifest } from "../../../lib/leveling-archive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Leveling — Solo, Chill & Group Routes",
  description:
    "Choose Alliance or Horde, your race and how you like to level. Browse quest brackets through level 60, track chapter progress and review explicit optional dungeon branches.",
  path: "/forever/leveling",
  keywords: ["WoW Forever leveling", "WoW Forever leveling guide", "WoW Forever group leveling"],
});

export default async function ForeverLevelingPage(): Promise<React.JSX.Element> {
  const archive = await getLevelingArchiveManifest();
  return (
    <article className={styles.page}>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "WoW Forever", path: "/forever" },
          { name: "Forever Leveling", path: "/forever/leveling" },
        ])}
      />
      <header className={styles.intro}>
        <div>
          <span className="eyebrow">Forever Leveling · free community tool</span>
          <h1>A path that fits your adventure.</h1>
          <p>
            Solo, unhurried or with friends. Pick your character, browse small leveling chapters and
            keep the next step close.
          </p>
        </div>
        <Image
          className={styles.introLogo}
          src="/wow-assets/games/forever-logo.jpg"
          width={160}
          height={108}
          alt="World of Warcraft Forever"
          priority
        />
      </header>
      <LevelingSetup />
      <p className={styles.footnote}>
        {archive ? (
          `Full authorized source: ${archive.chapters.length} guide variants and ${archive.chapters.reduce((total, chapter) => total + chapter.stepCount, 0).toLocaleString("en-US")} steps, including chapters through level 60 for both factions and every race. Source alternatives, game-state checks and some transitions still need review; this is not complete playtested coverage.`
        ) : (
          <>
            Coverage is growing: 157 extracted chapter variants are reference metadata; the original
            Alliance Westfall 13–15 quest list is available as a preview. Horde and complete 1–60
            instructions are not published yet.
          </>
        )}
      </p>
      <noscript>
        <p className={styles.notice}>
          Character setup needs JavaScript. You can still{" "}
          <a href="/forever/leveling/routes/alliance-human/chapters/chapter-125-13-15-westfall?edition=kfc">
            read the original Westfall preview
          </a>{" "}
          without creating an account.
        </p>
      </noscript>
    </article>
  );
}
