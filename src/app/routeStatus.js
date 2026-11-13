// A learner's route is "proposed" until the managing supervisor approves or declines
// it. Routes saved before approval existed have no status and count as approved.
/** @param {{ status?: string }} route @returns {"approved" | "proposed" | "declined"} */
export const routeStatus = (route) => route?.status === "proposed" || route?.status === "declined" ? route.status : "approved";
