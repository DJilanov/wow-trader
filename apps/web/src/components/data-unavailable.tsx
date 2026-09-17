export interface DataUnavailableProps {
  readonly title?: string;
}

export function DataUnavailable({
  title = "The data service is not ready",
}: DataUnavailableProps): React.JSX.Element {
  return (
    <section className="empty-state" role="status">
      <span className="eyebrow">Setup required</span>
      <h1>{title}</h1>
      <p>
        Start PostgreSQL, apply the migrations, import a validated catalog snapshot, and set
        <code> DATABASE_URL</code>. No sample prices are shown as real market data.
      </p>
    </section>
  );
}
