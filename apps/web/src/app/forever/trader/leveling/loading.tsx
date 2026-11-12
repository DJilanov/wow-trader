export default function Loading(): React.JSX.Element {
  return (
    <section className="empty-state" role="status" aria-busy="true">
      <h1>Profession leveling</h1>
      <p>Loading recipes and Auction House prices…</p>
    </section>
  );
}
