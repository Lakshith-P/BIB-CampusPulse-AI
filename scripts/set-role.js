// Grants or revokes a role. Usage: node scripts/set-role.js <email> <student|faculty|admin> [--revoke]
import pg from "pg";

import { poolConfig } from "../src/backend/db-config.js";

const [email, role, flag] = process.argv.slice(2);
if (!email || !["student", "faculty", "admin"].includes(role)) {
  console.error("Usage: node scripts/set-role.js <email> <student|faculty|admin> [--revoke]");
  process.exit(1);
}
const client = new pg.Client(poolConfig());
await client.connect();
try {
  const user = (await client.query("SELECT id FROM users WHERE email = $1", [email])).rows[0];
  if (!user) throw new Error("No account with that email. Sign up first.");
  if (flag === "--revoke") {
    await client.query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [user.id, role]);
    console.log(`Revoked ${role} from ${email}`);
  } else {
    await client.query(
      "INSERT INTO user_roles(user_id, role) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [user.id, role],
    );
    console.log(`Granted ${role} to ${email}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
