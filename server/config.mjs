// Reads and validates the deployable service's settings from environment variables.
// Kept free of side effects so it can be unit-tested.

function parseOrigins(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("ALLOWED_ORIGINS is required (comma-separated web app origins).");
  return value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    let url;
    try { url = new URL(item); } catch { throw new Error(`ALLOWED_ORIGINS entry is not a URL: ${item}`); }
    if (url.origin !== item) throw new Error(`ALLOWED_ORIGINS entries must be bare origins without a path or trailing slash: ${item}`);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error(`ALLOWED_ORIGINS must use https (http is allowed only for localhost): ${item}`);
    return item;
  });
}

function parseServiceAccount(value) {
  const text = value.trim().startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT must be the service-account JSON, raw or base64-encoded."); }
  if (parsed?.type !== "service_account" || typeof parsed.project_id !== "string" || typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") throw new Error("FIREBASE_SERVICE_ACCOUNT is not a service-account key.");
  return parsed;
}

function positiveInt(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new Error(`${name} must be a positive whole number.`);
  return Number(value);
}

export function loadConfig(env) {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
  const usesEmulators = !!(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
  if (usesEmulators) {
    // Only for testing this entry point locally: never mix emulators and a real project.
    if (env.SHARED_SERVICE_ALLOW_EMULATORS !== "true" || !projectId.startsWith("demo-") || !env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error("Emulator settings are present. Unset FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST for a real project.");
    }
  } else if (projectId.startsWith("demo-")) {
    throw new Error("demo- project IDs work only with the local emulators.");
  }
  let serviceAccount = null;
  if (!usesEmulators && env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount.project_id !== projectId) throw new Error("FIREBASE_SERVICE_ACCOUNT belongs to a different project than FIREBASE_PROJECT_ID.");
  }
  return {
    projectId,
    usesEmulators,
    serviceAccount, // null → Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS or Google Cloud runtime)
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    port: positiveInt(env.PORT, 8080, "PORT"),
    host: env.HOST?.trim() || "0.0.0.0",
    trustProxy: env.TRUST_PROXY === "true",
    rateLimitPerMinute: positiveInt(env.RATE_LIMIT_PER_MINUTE, 120, "RATE_LIMIT_PER_MINUTE"),
  };
}

// Behind a platform proxy, the right-most X-Forwarded-For entry is the one the
// proxy itself added; earlier entries can be supplied by the client.
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const header = req.headers["x-forwarded-for"];
    const value = Array.isArray(header) ? header.join(",") : header;
    const last = value?.split(",").map((item) => item.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}
