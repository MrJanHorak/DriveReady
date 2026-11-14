// Deployable entry point for the shared-space service (Railway, Render, Cloud Run,
// or any Node 22+ host). Configuration comes from environment variables; see
// DEPLOYMENT.md. Run with: npm run start:service
import { createServer } from "node:http";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createSharedAccessService } from "./sharedAccess.mjs";
import { createRateLimiter, createSharedGateway } from "./sharedGateway.mjs";
import { clientAddress, loadConfig } from "./config.mjs";

let config;
try { config = loadConfig(process.env); } catch (error) {
  console.error(`DriveReady shared service: ${error.message}`);
  process.exit(1);
}

const app = initializeApp({
  projectId: config.projectId,
  ...(config.usesEmulators ? {} : { credential: config.serviceAccount ? cert(config.serviceAccount) : applicationDefault() }),
});
const handler = createSharedGateway({
  service: createSharedAccessService({ db: getFirestore(app), auth: getAuth(app), isModerator: (email) => config.moderatorEmails.includes(email) }),
  allowedOrigins: config.allowedOrigins,
  clientKey: (req) => clientAddress(req, config.trustProxy),
  allow: createRateLimiter({ limit: config.rateLimitPerMinute }),
  // Structured, content-free request log: no bodies, tokens, IPs or account IDs.
  log: (entry) => console.log(JSON.stringify({ ...entry, at: new Date().toISOString() })),
});

const server = createServer(handler);
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(config.port, config.host, () => {
  console.log(`DriveReady shared service listening on ${config.host}:${config.port} for project ${config.projectId}${config.usesEmulators ? " (emulators)" : ""}; allowed origins: ${config.allowedOrigins.join(", ")}`);
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
