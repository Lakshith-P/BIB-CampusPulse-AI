import { createHash } from "node:crypto";
import { requireAdminUser } from "./access.server.js";

export const GENESIS_HASH = "0".repeat(64);
export const sha256 = (text) =>
  createHash("sha256")
    .update(text ?? "")
    .digest("hex");

// Postgres jsonb does not preserve object key order, so a payload read back from the database can
// serialize differently than the object that was first hashed. Sorting keys recursively makes the
// serialization canonical, so the same content always hashes the same way.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

// A block's hash commits to the previous block's hash plus its own content, so the chain can be
// walked and re-hashed independently of what the database currently says happened.
function blockHash({ prevHash, complaintId, eventType, actorId, payload, createdAtIso }) {
  return sha256(
    canonicalJson({ prevHash, complaintId, eventType, actorId, payload, createdAtIso }),
  );
}

/** Appends one block to the single, global complaint audit chain. Call inside the same
 * transaction as the state change it records, so the chain never drifts from the data. */
export async function appendChainBlock(db, { complaintId, eventType, actorId, payload }) {
  const last = await db.query("SELECT hash FROM chain_blocks ORDER BY id DESC LIMIT 1");
  const prevHash = last.rows[0]?.hash ?? GENESIS_HASH;
  const { rows } = await db.query(
    `INSERT INTO chain_blocks (complaint_id, event_type, actor_id, payload, prev_hash, hash, created_at)
     VALUES ($1,$2,$3,$4,$5,'', now())
     RETURNING id, created_at`,
    [complaintId, eventType, actorId, payload, prevHash],
  );
  const createdAtIso = new Date(rows[0].created_at).toISOString();
  const hash = blockHash({ prevHash, complaintId, eventType, actorId, payload, createdAtIso });
  await db.query("UPDATE chain_blocks SET hash = $2, created_at = $3 WHERE id = $1", [
    rows[0].id,
    hash,
    createdAtIso,
  ]);
  return hash;
}

export async function chainForComplaint(db, user, complaintId) {
  requireAdminUser(user);
  const { rows } = await db.query(
    `SELECT b.id, b.event_type, b.payload, b.prev_hash, b.hash, b.created_at,
            u.display_name AS actor_name, u.email AS actor_email
       FROM chain_blocks b LEFT JOIN users u ON u.id = b.actor_id
      WHERE b.complaint_id = $1 ORDER BY b.id`,
    [complaintId],
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}

/** Recomputes every block's hash and link from scratch and compares it to what is stored, then
 * checks that the latest recorded status/response for each complaint still matches the live row
 * (catching an edit made directly in the database, outside the application). */
export async function verifyChainIntegrity(db, user) {
  requireAdminUser(user);
  const { rows } = await db.query(
    `SELECT id, complaint_id, event_type, actor_id, payload, prev_hash, hash, created_at
       FROM chain_blocks ORDER BY id`,
  );
  let expectedPrev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prev_hash !== expectedPrev)
      return {
        valid: false,
        blocks: rows.length,
        brokenAt: row.id,
        reason: `Block ${row.id} does not link to the block before it. The chain is broken or out of order.`,
      };
    const createdAtIso = new Date(row.created_at).toISOString();
    const recomputed = blockHash({
      prevHash: row.prev_hash,
      complaintId: row.complaint_id,
      eventType: row.event_type,
      actorId: row.actor_id,
      payload: row.payload,
      createdAtIso,
    });
    if (recomputed !== row.hash)
      return {
        valid: false,
        blocks: rows.length,
        brokenAt: row.id,
        reason: `Block ${row.id}'s stored hash does not match its recorded content. It was altered after being written.`,
      };
    expectedPrev = row.hash;
  }

  const mismatches = [];
  const latestByComplaint = new Map();
  for (const row of rows)
    if (row.event_type === "RESOLUTION_EVIDENCE") latestByComplaint.set(row.complaint_id, row);
  if (latestByComplaint.size) {
    const live = await db.query(
      `SELECT id, status, response FROM complaints WHERE id = ANY($1::uuid[])`,
      [[...latestByComplaint.keys()]],
    );
    for (const c of live.rows) {
      const block = latestByComplaint.get(c.id);
      const expected = block.payload;
      if (expected.status !== c.status || expected.responseHash !== sha256(c.response))
        mismatches.push({ complaintId: c.id, recordedAt: block.id });
    }
  }

  return {
    valid: mismatches.length === 0,
    blocks: rows.length,
    headHash: expectedPrev,
    mismatches,
    reason: mismatches.length
      ? `${mismatches.length} complaint(s) were changed directly in the database, bypassing the chain.`
      : undefined,
  };
}
