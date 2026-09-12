import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PwaUpdatePrompt } from "./components/PwaControls";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /><PwaUpdatePrompt /></StrictMode>);
