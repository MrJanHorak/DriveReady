
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import "./styles/index.css";
  import { takeInviteFromLocation } from "./app/inviteLink";

  // Move an invitation from the address into this tab before anything renders.
  takeInviteFromLocation();

  createRoot(document.getElementById("root")!).render(<App />);
  