import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErreurGlobale from "./components/ErreurGlobale";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErreurGlobale>
      <App />
    </ErreurGlobale>
  </React.StrictMode>
);
