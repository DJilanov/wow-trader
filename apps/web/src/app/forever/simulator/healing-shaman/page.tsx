import type { Metadata } from "next";
import console from "node:console";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ShamanHealerGroupPayload,
  ShamanHealerLibraryIndex,
} from "@wow-trader/forever-data/shaman-healer-library";
import type {
  ShamanHealerPresentation,
  ShamanHealerRelease,
} from "@wow-trader/forever-data/shaman-healer-release";
import { ShamanHealerWorkspace } from "../../../../components/shaman-healer-workspace";
import {
  readShamanHealerGroup,
  readShamanHealerIndex,
  readShamanHealerPresentation,
  readShamanHealerRelease,
  isShamanHealerAvailable,
} from "../../../../lib/shaman-healer-simulator";
import { getSimulatorClass } from "../../../../lib/forever-simulator-directory";
import { createHelperMetadata } from "../../../../lib/seo";
import { withHelperBasePath } from "../../../../lib/site-path";

export const dynamic = "force-dynamic";
interface ShamanPageProps {
  readonly searchParams: Promise<{
    readonly release?: string | readonly string[];
    readonly build?: string | readonly string[];
  }>;
}
export async function generateMetadata({ searchParams }: ShamanPageProps): Promise<Metadata> {
  const query = await searchParams;
  const indexable = !query.release && !query.build && (await isShamanHealerAvailable());
  return createHelperMetadata({
    title: "WoW Forever Shaman healing simulator",
    description:
      "Compare pre-raid Shaman equipment, talents, enchants and spell ranks for direct healing and Riptide support in declared healing assignments.",
    path: "/forever/simulator/healing-shaman",
    noIndex: !indexable,
  });
}
export default async function ShamanPage({
  searchParams,
}: ShamanPageProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const release = typeof query.release === "string" ? query.release : undefined;
  const shared = typeof query.build === "string" ? query.build : undefined;
  if (release && !/^[a-f0-9]{24}$/.test(release)) notFound();
  const shaman = getSimulatorClass("shaman")!;
  let manifest: ShamanHealerRelease | null = null;
  let index: ShamanHealerLibraryIndex | null = null;
  let presentation: ShamanHealerPresentation | null = null;
  let initialGroup: ShamanHealerGroupPayload | null = null;
  try {
    manifest = await readShamanHealerRelease(undefined, release);
    if (manifest) {
      index = await readShamanHealerIndex(manifest);
      presentation = await readShamanHealerPresentation(manifest, index);
      initialGroup = await readShamanHealerGroup(manifest, index, "riptide-support|group|1|1-4-11");
    }
  } catch (error: unknown) {
    console.error(
      "[healer-simulator] Shaman library unavailable:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
  if (release && !manifest) notFound();
  return (
    <article
      className="forever-simulator-workspace"
      style={{ "--forever-class": shaman.color } as React.CSSProperties}
    >
      <header className="simulator-workspace-header">
        <div>
          <Link className="helper-back-link" href="/forever/simulator?class=shaman">
            ← Choose a class
          </Link>
          <div className="simulator-character-heading">
            <Image
              className="forever-icon"
              src={withHelperBasePath(shaman.icon)}
              width={60}
              height={60}
              alt=""
            />
            <div>
              <span className="eyebrow">Forever · Shaman</span>
              <h1>Shaman healing</h1>
            </div>
          </div>
          <p>
            Build for the healing your group needs. Compare direct heals and Riptide support with
            complete pre-raid loadouts.
          </p>
        </div>
        <nav aria-label="Shaman simulator profiles">
          <Link href="/forever/simulator/elemental-shaman">Damage</Link>
          <Link href="/forever/simulator/enhancement-shaman">Enhancement</Link>
          <Link href="/forever/simulator/healing-shaman" aria-current="page">
            Healing
          </Link>
        </nav>
      </header>
      {manifest && index && presentation && initialGroup ? (
        <ShamanHealerWorkspace
          key={manifest.release}
          index={index}
          presentation={presentation}
          initialGroup={initialGroup}
          release={manifest.release}
          {...(shared ? { initialSharedBuild: shared } : {})}
        />
      ) : (
        <section className="panel" role="status">
          <h2>Shaman healing is temporarily unavailable</h2>
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
