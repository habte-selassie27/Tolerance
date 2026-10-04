import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { createRouter } from "./router";
import "./globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("Tolerance could not find its mount point.");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createRouter()} />
  </StrictMode>,
);
