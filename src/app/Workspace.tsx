import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebaseClient";
import FirebaseAccount from "./FirebaseAccount";
import { sharedAccessEnabled, sharedServiceMisconfigured } from "./sharedClient";
import { Card } from "./design";

// Main content area: the account panel and, when signed in, the shared-space pages.
export default function Workspace({ page, onNavigate, onBusyChange }: { page: string; onNavigate: (page: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(!!auth);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => { setUser(next); setAuthLoading(false); }, () => { setUser(null); setAuthLoading(false); });
  }, []);
  return <main className="relative flex-1 overflow-auto p-4 sm:p-6" style={{ display: page === "requirements" || page === "privacy" ? "none" : undefined }}><div className="mx-auto max-w-6xl space-y-5">
    {busy && <p role="status" className="rounded-lg bg-[#E4EFF2] p-3 text-sm text-[#095969]">Saving… Please wait before switching sections or signing out.</p>}
    {!sharedAccessEnabled && <Card className="p-5" aria-label="Setup required">
      <h2 className="text-base font-bold">DriveReady isn’t connected to its shared service</h2>
      {sharedServiceMisconfigured
        ? <p className="mt-2 text-sm text-amber-900">VITE_SHARED_API_URL is set but is not a valid https address.</p>
        : <p className="mt-2 text-sm text-muted-foreground">Learner spaces, routes and driving logs need the shared service.</p>}
      {import.meta.env.DEV && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Try everything locally with <code>npm run demo:shared</code>, then open http://127.0.0.1:4173/.</li>
        <li>Or set <code>VITE_SHARED_API_URL</code> in <code>.env.development.local</code> to your hosted service (see DEPLOYMENT.md) and restart <code>npm run dev</code>.</li>
      </ul>}
    </Card>}
    {sharedAccessEnabled && <FirebaseAccount user={user} loading={authLoading} view={!user || page === "account" ? "account" : "shared"} page={page} onNavigate={onNavigate} onBusyChange={setBusy} />}
  </div></main>;
}
