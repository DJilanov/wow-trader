"use client";

export default function LocalReviewError({
  reset,
}: {
  readonly reset: () => void;
}): React.JSX.Element {
  return (
    <section className="panel" role="alert">
      <h1>Local build evidence could not be verified</h1>
      <p>No build link was loaded. Check the saved campaign evidence before importing a result.</p>
      <button type="button" onClick={reset}>
        Retry evidence check
      </button>
    </section>
  );
}
