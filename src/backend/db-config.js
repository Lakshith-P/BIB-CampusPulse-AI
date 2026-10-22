// Shared by the app and the scripts in /scripts, so keep this file free of "@/" imports.

const isLocal = (url) =>
  /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:|\/|$)/.test(url);

/**
 * Connection settings for node-postgres.
 * - SSL is on for any non-local host (hosted databases require it). Certificates are not
 *   verified because several providers' poolers use their own CA; the traffic is still encrypted.
 *   Set DATABASE_SSL=false to turn SSL off.
 * - The pool is small on Vercel: every function instance has its own pool, so ten
 *   connections each would quickly exhaust a free database. Override with DATABASE_POOL_MAX.
 */
export function poolConfig(url = process.env["DATABASE_URL"]) {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const sslSetting = process.env["DATABASE_SSL"];
  const useSsl = sslSetting ? sslSetting === "true" : !isLocal(url);
  const serverless = Boolean(process.env["VERCEL"]);
  return {
    // SSL is configured below, so drop the URL's sslmode (pg warns about its changing meaning).
    connectionString: url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: Number(process.env["DATABASE_POOL_MAX"]) || (serverless ? 3 : 10),
    // A sleeping hosted database can take 10+ seconds to wake up on the first request.
    connectionTimeoutMillis: 30_000,
    // Opening a connection to a remote database costs seconds, so a long-running server keeps
    // its connections warm instead of closing them after a short pause.
    idleTimeoutMillis: serverless ? 10_000 : 10 * 60_000,
    keepAlive: true,
  };
}
