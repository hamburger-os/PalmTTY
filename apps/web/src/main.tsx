import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import { AmbientBackground } from "./AmbientBackground.js";
import { App } from "./App.js";
import { I18nProvider } from "./i18n.js";
import {
  ThemeProvider,
  initializeThemeDocument
} from "./theme.js";
import "./styles.css";

initializeThemeDocument();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AmbientBackground />
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
