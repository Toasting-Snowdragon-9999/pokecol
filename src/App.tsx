import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppHeader } from "./components/AppHeader";
import { CollectionProvider } from "./collection/CollectionProvider";
import { FindCardsPage } from "./features/find/FindCardsPage";
import { BinderPage } from "./features/binder/BinderPage";
import styles from "./App.module.css";

export default function App() {
  return (
    <CollectionProvider>
      <BrowserRouter>
        <div className={styles.shell}>
          <AppHeader />
          <main className={styles.main}>
            <Routes>
              <Route path="/" element={<Navigate to="/collection" replace />} />
              <Route path="/find" element={<FindCardsPage />} />
              <Route path="/collection" element={<BinderPage />} />
              <Route path="*" element={<Navigate to="/collection" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </CollectionProvider>
  );
}
