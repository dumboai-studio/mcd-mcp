import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OrderApp } from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OrderApp />
  </StrictMode>,
);
