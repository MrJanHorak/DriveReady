// Local emulator-only adapter for the demo and browser tests. It refuses to run
// against anything but the demo emulators and accepts loopback connections only.
// The deployable entry point is server/main.mjs.
import { createSharedAccessService } from "./sharedAccess.mjs";
import { createSharedGateway } from "./sharedGateway.mjs";

const DEFAULT_ORIGIN = "http://127.0.0.1:4173";

export function createLocalSharedGateway({ db, auth, origin = DEFAULT_ORIGIN }) {
  if (![DEFAULT_ORIGIN, "http://127.0.0.1:4174"].includes(origin)) throw new Error("Local demo origin required.");
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" || db.projectId !== "demo-driveready" || auth.app.options.projectId !== "demo-driveready") {
    throw new Error("Local demo Auth and Firestore emulators are required.");
  }
  return createSharedGateway({
    // Demo moderators: the fictional manager, plus moderator@… test accounts.
    service: createSharedAccessService({ db, auth, isModerator: (email) => email === "manager@example.test" || /^moderator(-[a-z0-9-]+)?@example\.test$/.test(email) }),
    allowedOrigins: [origin],
    acceptConnection: (req) => ["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.localAddress),
  });
}
