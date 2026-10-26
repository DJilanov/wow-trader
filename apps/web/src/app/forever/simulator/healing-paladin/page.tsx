import type { Metadata } from "next";
import console from "node:console";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  PaladinHealerGroupPayload,
  PaladinHealerLibraryIndex,
} from "@wow-trader/forever-data/paladin-healer-library-payloads";
import type {
  PaladinHealerPresentation,
  PaladinHealerRelease,
} from "@wow-trader/forever-data/paladin-healer-release";
import { PaladinHealerWorkspace } from "../../../../components/paladin-healer-workspace";
import {
  readPaladinHealerGroup,
  readPaladinHealerIndex,
  readPaladinHealerPresentation,
  readPaladinHealerRelease,
  isPaladinHealerAvailable,
} from "../../../../lib/paladin-healer-simulator";
import { getSimulatorClass } from "../../../../lib/forever-simulator-directory";
import { createHelperMetadata } from "../../../../lib/seo";
import { withHelperBasePath } from "../../../../lib/site-path";

export const dynamic = "force-dynamic";
interface PaladinPageProps {
  readonly searchParams: Promise<{
    readonly release?: string | readonly string[];
    readonly build?: string | readonly string[];
  }>;
}
export async function generateMetadata({ searchParams }: PaladinPageProps): Promise<Metadata> {
  const query = await searchParams;
  const indexable = !query.release && !query.build && (await isPaladinHealerAvailable());
  return createHelperMetadata({
    title: "WoW Forever Paladin healing simulator",
    description:
      "Compare pre-raid Paladin equipment, talents, enchants and spell ranks for direct healing and Light's Vigil support in declared healing assignments.",
    path: "/forever/simulator/healing-paladin",
    noIndex: !indexable,
  });
}
export default async function PaladinPage({
  searchParams,
}: PaladinPageProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const release = typeof query.release === "string" ? query.release : undefined;
  const shared = typeof query.build === "string" ? query.build : undefined;
  if (release && !/^[a-f0-9]{24}$/.test(release)) notFound();
  const paladin = getSimulatorClass("paladin")!;
  let manifest: PaladinHealerRelease | null = null;
  let index: PaladinHealerLibraryIndex | null = null;
  let presentation: PaladinHealerPresentation | null = null;
  let initialGroup: PaladinHealerGroupPayload | null = null;
  try {
    manifest = await readPaladinHealerRelease(undefined, release);
    if (manifest) {
      index = await readPaladinHealerIndex(manifest);
      presentation = await readPaladinHealerPresentation(manifest, index);
      initialGroup = await readPaladinHealerGroup(
        manifest,
        index,
        "direct-healing-support|group|1:4,11",
      );
    }
  } catch (error: unknown) {
    console.error(
      "[healer-simulator] Paladin library unavailable:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
  if (release && !manifest) notFound();
  return (
    <article
      className="forever-simulator-workspace"
      style={{ "--forever-class": paladin.color } as React.CSSProperties}
    >
      <header className="simulator-workspace-header">
        <div>
          <Link className="helper-back-link" href="/forever/simulator?class=paladin">
            ← Choose a class
          </Link>
          <div className="simulator-character-heading">
            <Image
              className="forever-icon"
              src={withHelperBasePath(paladin.icon)}
              width={60}
              height={60}
              alt=""
            />
            <div>
              <span className="eyebrow">Forever · Paladin</span>
              <h1>Paladin healing</h1>
            </div>
          </div>
          <p>
            Build for the healing your group needs. Compare direct heals and Light&apos;s Vigil
            support with complete pre-raid loadouts.
          </p>
        </div>
        <nav aria-label="Paladin simulator profiles">
          <Link href="/forever/simulator/retribution-paladin">Damage</Link>
          <Link href="/forever/simulator/protection-paladin">Protection</Link>
          <Link href="/forever/simulator/healing-paladin" aria-current="page">
            Healing
          </Link>
        </nav>
      </header>
      {manifest && index && presentation && initialGroup ? (
        <PaladinHealerWorkspace
          key={manifest.release}
          index={index}
          presentation={presentation}
          initialGroup={initialGroup}
          release={manifest.release}
          {...(shared ? { initialSharedBuild: shared } : {})}
        />
      ) : (
        <section className="panel" role="status">
          <h2>Paladin healing is temporarily unavailable</h2>
          <p>
            The healing engine has not been published on this installation, or its files could not
            be verified. Existing damage and tank simulators are available.
          </p>
          <Link href="/forever/simulator">Choose another profile →</Link>
        </section>
      )}
    </article>
  );
}
