// Install native title tooltip suppression BEFORE anything renders
import "./lib/disableNativeTitleTooltips";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
