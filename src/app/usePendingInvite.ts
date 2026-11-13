import { useEffect, useState } from "react";
import { INVITE_EVENT, loadPendingInvite } from "./inviteLink";

export type PendingInvite = { spaceId: string; token: string };

// The invitation this tab is holding, if any, kept up to date across components.
export function usePendingInvite(): PendingInvite | null {
  const [invite, setInvite] = useState<PendingInvite | null>(() => loadPendingInvite());
  useEffect(() => {
    const update = () => setInvite(loadPendingInvite());
    window.addEventListener(INVITE_EVENT, update);
    return () => window.removeEventListener(INVITE_EVENT, update);
  }, []);
  return invite;
}
