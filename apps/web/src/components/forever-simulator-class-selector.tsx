import Image from "next/image";
import Link from "next/link";
import { getSimulatorClassDirectory } from "../lib/forever-simulator-directory";
import { withHelperBasePath } from "../lib/site-path";

interface ForeverSimulatorClassSelectorProps {
  readonly selectedClass: string | null;
  readonly healingPriestReady?: boolean;
  readonly healingDruidReady?: boolean;
}

export function ForeverSimulatorClassSelector({
  selectedClass,
  healingPriestReady = false,
  healingDruidReady = false,
}: ForeverSimulatorClassSelectorProps): React.JSX.Element {
  return (
    <section
      className="forever-class-directory simulator-class-selector"
      aria-labelledby="simulator-classes-heading"
    >
      <div className="forever-section-heading">
        <div>
          <span className="eyebrow">Build a character</span>
          <h2 id="simulator-classes-heading">Choose your class</h2>
        </div>
        <p>Pick a class, then compare your gear, talents and rotation.</p>
      </div>
      <div className="forever-class-grid">
        {getSimulatorClassDirectory().map((entry) => (
          <Link
            key={entry.slug}
            href={entry.href}
            aria-current={selectedClass === entry.slug ? "true" : undefined}
            style={{ "--forever-class": entry.color } as React.CSSProperties}
          >
            <Image
              className="forever-icon"
              src={withHelperBasePath(entry.icon)}
              width={52}
              height={52}
              alt=""
            />
            <span>
              <strong>{entry.name}</strong>
              <small>
                {(entry.name === "Priest" && healingPriestReady) ||
                (entry.name === "Druid" && healingDruidReady)
                  ? entry.description + " · Healing"
                  : entry.description}
              </small>
              <span>
                {entry.profiles.length === 1
                  ? "Open simulator"
                  : `${entry.profiles.length + ((entry.name === "Priest" && healingPriestReady) || (entry.name === "Druid" && healingDruidReady) ? 1 : 0)} profiles · Choose your playstyle`}
              </span>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
        ))}
      </div>
    </section>
  );
}
