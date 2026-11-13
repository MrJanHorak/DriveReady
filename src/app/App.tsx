import { useEffect, useState } from "react";
import { ClipboardList, FileText, LayoutDashboard, Map, Navigation, Shield, UserCircle2, Users } from "lucide-react";
import Workspace from "./Workspace";
import StateRequirements from "./StateRequirements";
import Privacy from "./Privacy";
import { sharedAccessEnabled } from "./sharedClient";
import { loadPendingInvite, takeInviteFromLocation } from "./inviteLink";
import { heading, mono } from "./design";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { id: "routes", label: "Routes", icon: <Map size={17} /> },
  { id: "logs", label: "Driving Logs", icon: <FileText size={17} /> },
  { id: "requirements", label: "State Requirements", icon: <ClipboardList size={17} /> },
  { id: "shared", label: "People & access", icon: <Users size={17} /> },
  { id: "account", label: "Account", icon: <UserCircle2 size={17} /> },
  { id: "privacy", label: "Privacy", icon: <Shield size={17} /> },
];

export default function App() {
  // Someone opening an invitation link lands on People & access to review it.
  const [activeNav, setActiveNav] = useState(() => loadPendingInvite() ? "shared" : "dashboard");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const opened = () => { if (takeInviteFromLocation()) setActiveNav("shared"); };
    window.addEventListener("hashchange", opened);
    return () => window.removeEventListener("hashchange", opened);
  }, []);
  // Without a shared service only the state requirements and account pages are useful.
  const nav = sharedAccessEnabled ? navItems : navItems.filter((item) => ["requirements", "account", "privacy"].includes(item.id));
  const page = nav.some((item) => item.id === activeNav) ? activeNav : "account";
  const title = nav.find((item) => item.id === page)?.label ?? "Dashboard";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return <div className="relative flex h-full w-full overflow-hidden bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
    <aside className="flex w-16 flex-shrink-0 flex-col border-r border-border bg-card sm:w-[228px]">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-4 sm:px-5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9]"><Navigation size={14} className="text-white" aria-hidden="true" /></div>
        <span className="hidden text-sm font-bold tracking-tight text-foreground sm:inline" style={heading}>DriveReady</span>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 overflow-y-auto p-2 sm:px-3 sm:py-4">
        <p className="mb-2 hidden px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:block" style={mono}>Main</p>
        {nav.map((item) => {
          const active = page === item.id;
          return <button key={item.id} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined} disabled={busy} onClick={() => setActiveNav(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 disabled:opacity-50 ${active ? "bg-[#E4EFF2] text-[#0C7A8D]" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <span className={active ? "text-[#0C7A8D]" : "text-muted-foreground"}>{item.icon}</span><span className="hidden sm:inline">{item.label}</span>
            {active && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#0C7A8D] sm:block" aria-hidden="true" />}
          </button>;
        })}
      </nav>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center border-b border-border bg-card px-5 sm:px-6"><div><h1 className="text-lg font-bold leading-none text-foreground" style={heading}>{title}</h1><p className="mt-1 text-xs text-muted-foreground">{today}</p></div></header>
      {page === "requirements" && <StateRequirements />}
      {page === "privacy" && <Privacy />}
      <Workspace page={page} onNavigate={setActiveNav} onBusyChange={setBusy} />
    </div>
  </div>;
}
