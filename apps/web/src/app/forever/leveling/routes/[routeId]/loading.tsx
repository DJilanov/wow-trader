import styles from "../../../../../components/leveling-experience.module.css";

export default function LoadingLevelingRoute(): React.JSX.Element {
  return (
    <section className={styles.page} role="status" aria-live="polite" aria-busy="true">
      <span className="eyebrow">Forever Leveling</span>
      <h1>Preparing your chapter path…</h1>
      <p>
        Loading the route, quest rewards and dungeon preparation for your character. Your saved
        progress is kept.
      </p>
    </section>
  );
}
