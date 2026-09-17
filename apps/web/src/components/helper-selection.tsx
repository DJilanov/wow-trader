import Image from "next/image";
import Link from "next/link";

interface HelperSelectionOption {
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly status: string;
  readonly image: {
    readonly src: string;
    readonly kind: "icon" | "logo";
  };
  readonly tone: "tbc" | "forever" | "trader" | "encyclopedia";
  readonly href?: string;
}

interface HelperSelectionProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly options: readonly HelperSelectionOption[];
  readonly backHref?: string;
  readonly backLabel?: string;
}

export function HelperSelection({
  eyebrow,
  title,
  description,
  options,
  backHref,
  backLabel,
}: HelperSelectionProps): React.JSX.Element {
  return (
    <article className="helper-selection-page">
      <header className="helper-selection-header">
        {backHref && backLabel ? (
          <Link className="helper-back-link" href={backHref}>
            <span aria-hidden="true">←</span> {backLabel}
          </Link>
        ) : null}
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <section className="helper-choice-grid" aria-label={title}>
        {options.map((option) => {
          const content = (
            <>
              <span
                className={`helper-choice-icon ${option.tone} ${option.image.kind}`}
                aria-hidden="true"
              >
                <Image
                  alt=""
                  height={option.image.kind === "logo" ? 90 : 56}
                  loading="eager"
                  src={option.image.src}
                  width={option.image.kind === "logo" ? 160 : 56}
                />
              </span>
              <span className="helper-choice-copy">
                <span className="eyebrow">{option.eyebrow}</span>
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
              <span className="helper-choice-status">
                {option.status}
                {option.href ? <span aria-hidden="true">→</span> : null}
              </span>
            </>
          );

          return option.href ? (
            <Link className="helper-choice-card" href={option.href} key={option.title}>
              {content}
            </Link>
          ) : (
            <div className="helper-choice-card unavailable" aria-disabled="true" key={option.title}>
              {content}
            </div>
          );
        })}
      </section>
    </article>
  );
}
