import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "./app/providers";
import "./app/workspace.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
      <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
