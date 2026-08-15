import { NavLink } from "react-router";
import { useCollection } from "../collection/context";
import { useWishlist } from "../wishlist/context";
import { GameSwitcher } from "./GameSwitcher";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { uniqueCards, totalCards } = useCollection();
  const { count: wishlistCount } = useWishlist();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  return (
    <header className={styles.header}>
      <GameSwitcher />

      <nav className={styles.nav} aria-label="Main">
        <NavLink to="/find" className={linkClass}>
          Find Cards
        </NavLink>
        <NavLink to="/collection" className={linkClass}>
          My Collection
        </NavLink>
        <NavLink to="/wishlist" className={linkClass}>
          Wishlist
          {wishlistCount > 0 && <span className={styles.badge}>{wishlistCount}</span>}
        </NavLink>
      </nav>

      <p className={styles.count}>
        <span className={styles.countValue}>{uniqueCards}</span> cards
        {totalCards > uniqueCards && <span>({totalCards} with dupes)</span>}
      </p>
    </header>
  );
}
