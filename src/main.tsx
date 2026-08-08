import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./styles.css";
import { App } from "./App";
import { SessionProvider } from "./lib/session";

document.documentElement.dataset.font = localStorage.getItem("yi-font-size") || "medium";
document.documentElement.dataset.theme = localStorage.getItem("yi-theme") || "system";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider><App /></SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);

