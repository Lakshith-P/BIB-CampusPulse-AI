// Verifies the database connection and schema. Usage: npm run db:check
import pg from "pg";

import { poolConfig } from "../src/backend/db-config.js";

const client = new pg.Client(poolConfig());
try {
  await client.connect();
  const version = (await client.query("SHOW server_version")).rows[0].server_version;
  console.log(`Connected to PostgreSQL ${version}`);
  const tables = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    )
  ).rows.map((r) => r.table_name);
  const needed = [
    "users",
    "user_roles",
    "student_records",
    "campus_interventions",
    "contact_messages",
    "campus_audit",
  ];
  const missing = needed.filter((t) => !tables.includes(t));
  if (missing.length) {
    console.log(`Missing tables: ${missing.join(", ")}. Run: npm run db:migrate`);
    process.exitCode = 1;
  } else {
    const users = (await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n;
    const admins = (
      await client.query("SELECT count(*)::int AS n FROM user_roles WHERE role = 'admin'")
    ).rows[0].n;
    console.log(`Schema OK. ${users} account(s), ${admins} admin(s).`);
    if (!admins)
      console.log(
        "No admin yet: sign up on the site, then run: npm run db:set-role -- you@email.com admin",
      );
  }
} catch (error) {
  const reason = error.message || error.code || error.errors?.[0]?.message || String(error);
  console.error(`Could not use the database: ${reason}`);
  if (/ENOTFOUND|ECONNREFUSED|timeout/i.test(reason))
    console.error("Check the host and port in DATABASE_URL.");
  if (/password authentication|SASL/i.test(reason))
    console.error("Check the user and password in DATABASE_URL.");
  if (/SSL|TLS/i.test(reason)) console.error("Try DATABASE_SSL=false (local) or true (hosted).");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
