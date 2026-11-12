import Image from "next/image";
import Link from "next/link";
import {
  PROFESSION_LEVELING_PROFESSIONS,
  PROFESSION_LEVELING_QUESTIONS,
} from "../lib/profession-leveling-content";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./profession-leveling-page.module.css";

export function ProfessionLevelingGuide(): React.JSX.Element {
  return (
    <div className={styles.guide}>
      <section aria-labelledby="profession-recipes-heading">
        <span className="eyebrow">Explore the recipe catalog</span>
        <h2 id="profession-recipes-heading">Find your next craft</h2>
        <p>
          Browse the recipes behind your WoW Forever profession plan. Check materials, skill
          requirements and crafting outputs before spending your gold.
        </p>
        <nav className={styles.professions} aria-label="Profession recipe catalogs">
          {PROFESSION_LEVELING_PROFESSIONS.map((profession) => (
            <Link
              key={profession.slug}
              href={`/forever/encyclopedia/professions/${profession.slug}`}
            >
              <Image
                src={withHelperBasePath(`/wow-assets/professions/${profession.slug}.jpg`)}
                alt=""
                width={32}
                height={32}
              />
              <span>{profession.name}</span>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
      </section>
      <section className={styles.faq} aria-labelledby="profession-questions-heading">
        <div>
          <span className="eyebrow">Before you buy</span>
          <h2 id="profession-questions-heading">A better plan for your gold</h2>
          <p>
            A cheap craft can still be an expensive way to level. Compare the materials and the cost
            to learn it together.
          </p>
          <Link href="/forever/addon">Keep your AH prices up to date →</Link>
        </div>
        <div>
          {PROFESSION_LEVELING_QUESTIONS.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
