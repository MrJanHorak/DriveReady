// HTTP handler for the shared-space service, used by both the local demo gateway
// and the deployable server (server/main.mjs). It never logs or returns request
// bodies, tokens, invitation codes or raw errors.

const MAX_BODY = 32768;

export const ROUTES = Object.freeze({
  "/v1/spaces": { action: "createSpace", fields: ["learnerName"] },
  "/v1/invitations": { action: "createInvitation", fields: ["spaceId", "recipientEmail", "role"] },
  "/v1/invitations/preview": { action: "previewInvitation", fields: ["spaceId", "token"] },
  "/v1/invitations/accept": { action: "acceptInvitation", fields: ["spaceId", "token"] },
  "/v1/invitations/cancel": { action: "cancelInvitation", fields: ["spaceId", "token"] },
  "/v1/invitations/list": { action: "listInvitations", fields: ["spaceId", "cursor"] },
  "/v1/invitations/cancel-by-id": { action: "cancelInvitationById", fields: ["spaceId", "invitationId"] },
  "/v1/members/remove": { action: "removeMember", fields: ["spaceId", "memberUid"] },
  "/v1/drives": { action: "createDrive", fields: ["spaceId", "operationId", "date", "minutes", "nightMinutes", "notes", "supervisorPresentUid"], optional: ["routeId", "practicedSkills", "practicedConditions"] },
  "/v1/drives/edit": { action: "editDrive", fields: ["spaceId", "driveId", "operationId", "expectedRevision", "date", "minutes", "nightMinutes", "notes"], optional: ["practicedSkills", "practicedConditions"] },
  "/v1/routes": { action: "createRoute", fields: ["spaceId", "operationId", "name", "start", "destination"], optional: ["geometry", "roadPolyline"] },
  "/v1/routes/delete": { action: "deleteRoute", fields: ["spaceId", "routeId"] },
  "/v1/drives/delete": { action: "deleteDrive", fields: ["spaceId", "driveId", "expectedRevision"] },
  "/v1/spaces/leave": { action: "leaveSpace", fields: ["spaceId"] },
  "/v1/spaces/delete": { action: "deleteSpace", fields: ["spaceId", "confirmName"] },
  "/v1/account/delete": { action: "deleteAccount", fields: ["confirmEmail"] },
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, rejected = false;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) { if (!rejected) { rejected = true; reject(new Error("too large")); } return; }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

// Fixed-window limiter kept in memory. It protects a single small instance from
// bursts; it is not shared between instances and resets on restart.
export function createRateLimiter({ limit = 120, windowMs = 60_000, now = Date.now, maxKeys = 10_000 } = {}) {
  const windows = new Map();
  return (key) => {
    const time = now();
    let entry = windows.get(key);
    if (!entry || time - entry.start >= windowMs) {
      if (!entry && windows.size >= maxKeys) {
        for (const [oldKey, old] of windows) if (time - old.start >= windowMs) windows.delete(oldKey);
        if (windows.size >= maxKeys) return false;
      }
      entry = { start: time, count: 0 };
      windows.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

/**
 * @param {object} options
 * @param {object} options.service       Result of createSharedAccessService.
 * @param {string[]} options.allowedOrigins  Exact browser origins allowed to call the API.
 * @param {(req: import("node:http").IncomingMessage) => boolean} [options.acceptConnection]  Extra connection check.
 * @param {(req: import("node:http").IncomingMessage) => string} [options.clientKey]  Rate-limit key for a request.
 * @param {(key: string) => boolean} [options.allow]  Rate limiter; return false to reject.
 * @param {(entry: {method: string, path: string, status: number, ms: number}) => void} [options.log]
 */
export function createSharedGateway({ service, allowedOrigins, acceptConnection = () => true, clientKey = (req) => req.socket.remoteAddress ?? "unknown", allow = () => true, log = () => {} }) {
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length) throw new Error("At least one allowed origin is required.");
  const origins = new Set(allowedOrigins);
  return async (req, res) => {
    const started = Date.now();
    const path = (req.url ?? "").split("?")[0];
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    const respond = (status, data) => {
      if (res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
      log({ method: req.method ?? "", path: Object.hasOwn(ROUTES, path) || path === "/health" ? path : "(other)", status, ms: Date.now() - started });
    };
    const failure = { error: "Request could not be completed." };
    if (!acceptConnection(req)) { respond(403, failure); return; }
    if (path === "/health" && req.method === "GET" && !req.headers.origin) { respond(200, { ok: true }); return; }
    const origin = req.headers.origin;
    if (typeof origin !== "string" || !origins.has(origin)) { respond(403, failure); return; }
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (!Object.hasOwn(ROUTES, req.url ?? "")) { respond(404, failure); return; }
    if (req.method === "OPTIONS") {
      if (req.headers["access-control-request-method"] !== "POST") { respond(405, failure); return; }
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.writeHead(204); res.end(); return;
    }
    if (req.method !== "POST") { respond(405, failure); return; }
    if (!allow(clientKey(req))) { res.setHeader("Retry-After", "60"); respond(429, failure); return; }
    const match = /^Bearer ([A-Za-z0-9_.-]{1,4096})$/.exec(req.headers.authorization ?? "");
    if (!match) { respond(401, failure); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? "")) { respond(415, failure); return; }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { respond(400, failure); return; }
    const { action, fields, optional = [] } = ROUTES[req.url];
    if (!body || typeof body !== "object" || Array.isArray(body) || !fields.every((field) => Object.hasOwn(body, field) && typeof body[field] === "string") || !Object.keys(body).every((field) => [...fields, ...optional].includes(field) && typeof body[field] === "string")) { respond(400, failure); return; }
    try {
      const result = await service[action]({ ...body, idToken: match[1] });
      respond(200, result ?? { ok: true });
    } catch {
      respond(403, failure);
    }
  };
}
