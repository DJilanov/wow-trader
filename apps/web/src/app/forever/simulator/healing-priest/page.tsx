import type { Metadata } from "next";
import { normalizeHealerLibrary } from "@wow-trader/forever-data/healer-workspace";
import console from "node:console";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HealerSimulatorWorkspace } from "../../../../components/healer-simulator-workspace";
import { readHealerLibrary, readHealerRelease } from "../../../../lib/healer-simulator";
import { getSimulatorClass } from "../../../../lib/forever-simulator-directory";
import { createHelperMetadata } from "../../../../lib/seo";
import { withHelperBasePath } from "../../../../lib/site-path";
import type { HealerLibrary, HealerRelease } from "@wow-trader/forever-data/healing-simulator";

export const dynamic = "force-dynamic";
interface HealerPageProps {
  readonly searchParams: Promise<{
    readonly release?: string | readonly string[];
    readonly build?: string | readonly string[];
  }>;
}
export async function generateMetadata({ searchParams }: HealerPageProps): Promise<Metadata> {
  const query = await searchParams;
  return createHelperMetadata({
    title: "WoW Forever Holy & Discipline Priest healing simulator",
    description:
      "Compare pre-raid Priest gear, healing talents, enchants and spell ranks. Test tank healing, stacked or spread groups and three- or five-minute mana endurance.",
    path: "/forever/simulator/healing-priest",
    noIndex: Boolean(query.release || query.build),
  });
}
export default async function HealerPage({
  searchParams,
}: HealerPageProps): Promise<React.JSX.Element> {
  const query = await searchParams,
    release = typeof query.release === "string" ? query.release : undefined,
    shared = typeof query.build === "string" ? query.build : undefined,
    priest = getSimulatorClass("priest")!;
  if (release && !/^[a-f0-9]{24}$/.test(release)) notFound();
  let manifest: HealerRelease | null = null;
  let library: HealerLibrary | null = null;
  try {
    manifest = await readHealerRelease(undefined, release);
    if (manifest) library = await readHealerLibrary(manifest);
  } catch (error: unknown) {
    console.error(
      "[healer-simulator] Priest library unavailable:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
  if (release && !manifest) notFound();
  return (
    <article
      className="forever-simulator-workspace"
      style={{ "--forever-class": priest.color } as React.CSSProperties}
    >
      <header className="simulator-workspace-header">
        <div>
          <Link className="helper-back-link" href="/forever/simulator?class=priest">
            ← Choose a class
          </Link>
          <div className="simulator-character-heading">
            <Image
              className="forever-icon"
              src={withHelperBasePath(priest.icon)}
              width={60}
              height={60}
              alt=""
            />
            <div>
              <span className="eyebrow">Forever · Priest</span>
              <h1>Priest healing</h1>
            </div>
          </div>
          <p>
            Build for the healing you need to cover. Compare equipment, talents, spell ranks and
            mana in a declared assignment.
          </p>
        </div>
        <nav aria-label="Priest simulator profiles">
          <Link href="/forever/simulator/shadow-priest">Shadow</Link>
          <Link href="/forever/simulator/smite-priest">Smite</Link>
          <Link href="/forever/simulator/healing-priest" aria-current="page">
            Healing
          </Link>
        </nav>
      </header>
      {manifest && library ? (
        <HealerSimulatorWorkspace
          key={manifest.release}
          library={normalizeHealerLibrary(library)}
          release={manifest.release}
          {...(shared ? { initialSharedBuild: shared } : {})}
        />
      ) : (
        <section className="panel" role="status">
          <h2>Priest healing is temporarily unavailable</h2>
          <p>
            The reviewed healing engine has not been published on this installation, or its files
            could not be verified. Existing damage and tank simulators are available.
          </p>
          <Link href="/forever/simulator">Choose another profile →</Link>
        </section>
      )}
    </article>
  );
}
