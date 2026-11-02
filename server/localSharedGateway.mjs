// Local emulator-only adapter. It does not start a server and must not be deployed.
import { createSharedAccessService } from "./sharedAccess.mjs";

const ORIGIN = "http://127.0.0.1:4173";
const MAX_BODY = 4096;
const routes = Object.freeze({
  "/v1/spaces": { action: "createSpace", fields: ["learnerName"] },
  "/v1/invitations": { action: "createInvitation", fields: ["spaceId", "recipientEmail", "role"] },
  "/v1/invitations/preview": { action: "previewInvitation", fields: ["spaceId", "token"] },
  "/v1/invitations/accept": { action: "acceptInvitation", fields: ["spaceId", "token"] },
  "/v1/invitations/cancel": { action: "cancelInvitation", fields: ["spaceId", "token"] },
  "/v1/invitations/list": { action: "listInvitations", fields: ["spaceId", "cursor"] },
  "/v1/invitations/cancel-by-id": { action: "cancelInvitationById", fields: ["spaceId", "invitationId"] },
  "/v1/members/remove": { action: "removeMember", fields: ["spaceId", "memberUid"] },
  "/v1/drives": { action: "createDrive", fields: ["spaceId", "operationId", "date", "minutes", "nightMinutes", "notes", "supervisorPresentUid"] },
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) {
        if (!rejected) { rejected = true; reject(new Error("too large")); }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

export function createLocalSharedGateway({ db, auth }) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" || db.projectId !== "demo-driveready" || auth.app.options.projectId !== "demo-driveready") {
    throw new Error("Local demo Auth and Firestore emulators are required.");
  }
  const service = createSharedAccessService({ db, auth });
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    const respond = (status, data) => {
      if (res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };
    const failure = { error: "Request could not be completed." };
    if (!["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.localAddress)) { respond(403, failure); return; }
    if (req.url === "/health" && req.method === "GET" && !req.headers.origin) { respond(200, { ok: true }); return; }
    if (req.headers.origin !== ORIGIN) { respond(403, failure); return; }
    res.setHeader("Access-Control-Allow-Origin", ORIGIN);
    if (!Object.hasOwn(routes, req.url)) { respond(404, failure); return; }
    if (req.method === "OPTIONS") {
      if (req.headers["access-control-request-method"] !== "POST") { respond(405, failure); return; }
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.writeHead(204); res.end(); return;
    }
    if (req.method !== "POST") { respond(405, failure); return; }
    const match = /^Bearer ([A-Za-z0-9_.-]{1,4096})$/.exec(req.headers.authorization ?? "");
    if (!match) { respond(401, failure); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? "")) { respond(415, failure); return; }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { respond(400, failure); return; }
    const { action, fields } = routes[req.url];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== fields.length || !fields.every((field) => Object.hasOwn(body, field) && typeof body[field] === "string")) { respond(400, failure); return; }
    try {
      const result = await service[action]({ ...body, idToken: match[1] });
      respond(200, result ?? { ok: true });
    } catch {
      // Never log or return raw errors, credentials, invitation tokens or request data.
      respond(403, failure);
    }
  };
}
