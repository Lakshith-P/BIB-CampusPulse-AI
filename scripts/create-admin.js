// Creates the first administrator, or resets an administrator's password.
// Usage: node scripts/create-admin.js <email> "<name>"
// The generated password is printed once. There is no sign-up page; every other account is
// registered by an administrator under Login credentials.
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

import { poolConfig } from "../src/backend/db-config.js";

const [email, ...nameParts] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/create-admin.js <email> "<name>"');
  process.exit(1);
}
const name = nameParts.join(" ").trim() || email.split("@")[0];
const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#%?+"];
const pick = (set) => set[randomInt(set.length)];
const chars = sets.map(pick);
while (chars.length < 14) chars.push(pick(sets.join("")));
for (let i = chars.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [chars[i], chars[j]] = [chars[j], chars[i]];
}
const password = chars.join("");

const client = new pg.Client(poolConfig());
await client.connect();
try {
  const hash = await bcrypt.hash(password, 12);
  const existing = (
    await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()])
  ).rows[0];
  let id = existing?.id;
  if (id) await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, hash]);
  else
    id = (
      await client.query(
        "INSERT INTO users(email, password_hash, display_name) VALUES($1,$2,$3) RETURNING id",
        [email.toLowerCase(), hash, name],
      )
    ).rows[0].id;
  await client.query(
    "INSERT INTO user_roles(user_id, role) VALUES($1,'admin') ON CONFLICT DO NOTHING",
    [id],
  );
  await client.query("DELETE FROM user_roles WHERE user_id = $1 AND role = 'student'", [id]);
  console.log(`${existing ? "Updated" : "Created"} administrator ${email}`);
  console.log(`Password (shown once): ${password}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
