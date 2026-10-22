// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

import { poolConfig } from "../src/backend/db-config.js";

const dir = join(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client(poolConfig());
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set(
    (await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
  );
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (done.has(file)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  console.log("database is up to date");
} finally {
  await client.end();
}
