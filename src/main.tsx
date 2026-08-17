import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App";
import { registerServiceWorker } from "./lib/registerServiceWorker";

if (import.meta.env.DEV) {
  void import("./lib/devSeed").then((module) => module.installDevHelpers());
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
