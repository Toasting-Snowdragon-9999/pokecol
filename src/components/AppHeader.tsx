import { NavLink } from "react-router";
import { useCollection } from "../collection/context";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { uniqueCards, totalCards } = useCollection();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  return (
    <header className={styles.header}>
      <NavLink to="/collection" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.brandName}>PokéCol</span>
      </NavLink>

      <nav className={styles.nav} aria-label="Main">
        <NavLink to="/find" className={linkClass}>
          Find Cards
        </NavLink>
        <NavLink to="/collection" className={linkClass}>
          My Collection
        </NavLink>
      </nav>

      <p className={styles.count}>
        <span className={styles.countValue}>{uniqueCards}</span> cards
        {totalCards > uniqueCards && <span>({totalCards} with dupes)</span>}
      </p>
    </header>
  );
}
