import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

import { emptyStudent } from "@/lib/student-defaults";

// A throwaway in-memory Postgres with every real migration applied, wrapped so it looks like
// the `pg` client the server modules expect.
export async function createTestDb() {
  const pg = new PGlite({ extensions: { citext, pgcrypto } });
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(join(dir, f), "utf8"));
  const db = {
    query: async (text, params = []) => {
      const r = await pg.query(text, params);
      return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
    },
  };
  return { db, close: () => pg.close() };
}

export async function addUser(db, email, name, roles = []) {
  const { rows } = await db.query(
    "INSERT INTO users(email, password_hash, display_name) VALUES($1,'x',$2) RETURNING id",
    [email, name],
  );
  for (const role of roles)
    await db.query("INSERT INTO user_roles(user_id, role) VALUES($1,$2)", [rows[0].id, role]);
  return { id: rows[0].id, email, displayName: name, roles: ["student", ...roles] };
}

export async function addStudent(db, id, owner, faculty, over = {}) {
  const record = {
    ...emptyStudent,
    id,
    name: `Student ${id}`,
    branch: "CSE",
    gradYear: 2027,
    ...over,
  };
  await db.query(
    "INSERT INTO student_records(id, owner_id, faculty_id, record) VALUES($1,$2,$3,$4)",
    [id, owner?.id ?? null, faculty?.id ?? null, JSON.stringify(record)],
  );
  return record;
}

export const recordOf = async (db, id) =>
  (await db.query("SELECT record FROM student_records WHERE id = $1", [id])).rows[0].record;
