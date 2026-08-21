import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import KidsApp from "./KidsApp";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/kids") ? <KidsApp /> : <App />}
  </React.StrictMode>
);
