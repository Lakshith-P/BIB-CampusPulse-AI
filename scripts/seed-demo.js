// Adds synthetic students, teachers and activity to the configured database.
//   npm run db:seed-demo            add the demo data (refuses to run twice)
//   npm run db:seed-demo -- --reset remove the demo data first, then add it again
//   npm run db:seed-demo -- --remove  remove the demo data only
// Every demo account uses an @insightiq.demo email and the password printed at the end.
import bcrypt from "bcryptjs";
import pg from "pg";

import { poolConfig } from "../src/backend/db-config.js";
import { DEMO_DOMAIN, DEMO_PASSWORD, generate } from "./demo-data/generate.js";
import { resetDemo, seedDatabase } from "./demo-data/write.js";

const args = new Set(process.argv.slice(2));
const data = generate({ today: new Date().toISOString().slice(0, 10) });
const subjects = [...new Set(data.lms.units.map((u) => u.subject))];

const client = new pg.Client(poolConfig());
await client.connect();
try {
  await client.query("BEGIN");
  if (args.has("--reset") || args.has("--remove")) {
    const removed = await resetDemo(client, subjects);
    console.log(`Removed ${removed.users} demo accounts and everything they owned.`);
  }
  if (!args.has("--remove")) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const summary = await seedDatabase(client, data, { passwordHash });
    console.log("Added demo data:");
    for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(14)} ${v}`);
    console.log(`\nSign in as teacher01@${DEMO_DOMAIN} or student001@${DEMO_DOMAIN}`);
    console.log(`Password for every demo account: ${DEMO_PASSWORD}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Nothing was changed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
