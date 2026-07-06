/**
 * Client entry point — mounts the {@link App} root component into `#root`
 * and pulls in the Kumo design-token and global stylesheets.
 *
 * @module client/main
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/kumo-tokens.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
