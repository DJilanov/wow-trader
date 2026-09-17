interface ForeverWorldStateProps {
  readonly build: {
    readonly clientVersion: string;
    readonly buildNumber: number;
    readonly state: "published" | "review_required";
  };
}

export function ForeverWorldState({ build }: ForeverWorldStateProps): React.JSX.Element {
  return (
    <details className={`forever-world-state ${build.state}`}>
      <summary>
        <span className="forever-world-state-dot" aria-hidden="true" />
        <span>{build.state === "published" ? "Published snapshot" : "Review snapshot"}</span>
        <strong>{build.clientVersion}</strong>
        <small>Build {build.buildNumber}</small>
      </summary>
      <p>
        {build.state === "published"
          ? "This page uses the current published client snapshot."
          : "Extracted client evidence is visible for maintainer verification and is not published."}
      </p>
    </details>
  );
}
