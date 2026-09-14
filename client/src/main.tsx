import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./workbench-overrides.css";
import { registerServiceWorker } from "./lib/pwa";

createRoot(document.getElementById("root")!).render(<App />);

// Production only; in dev the worker would serve cached builds over HMR. The path
// is derived from Vite's base URL so a subpath deployment registers the right scope.
registerServiceWorker();
