// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addUser, createTestDb } from "./harness";
import * as chain from "@/backend/chain.server";
import * as feedback from "@/backend/feedback.server";

let ctx, db, admin, ann;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
}, 60_000);

afterAll(() => ctx?.close());

describe("complaint audit chain", () => {
  it("records a linked, verifiable history as a complaint moves through its lifecycle", async () => {
    const { id } = await feedback.submitComplaint(db, ann, {
      category: "facilities",
      subject: "Broken AC",
      body: "Room 204 has had no AC for a week.",
    });
    await feedback.assignComplaintToMe(db, admin, { id });
    await feedback.respondToComplaint(db, admin, {
      id,
      status: "in-review",
      response: "",
      severity: "high",
    });
    await feedback.respondToComplaint(db, admin, {
      id,
      status: "resolved",
      response: "Technician replaced the unit.",
      severity: "high",
    });

    const blocks = await chain.chainForComplaint(db, admin, id);
    expect(blocks.map((b) => b.event_type)).toEqual([
      "CREATED",
      "ASSIGNED",
      "SEVERITY_OVERRIDE",
      "STATUS_CHANGED",
      "STATUS_CHANGED",
      "RESOLUTION_EVIDENCE",
    ]);
    expect(blocks[0].prev_hash).toMatch(/^0{64}$/);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].prev_hash).toBe(blocks[i - 1].hash);

    const ok = await chain.verifyChainIntegrity(db, admin);
    expect(ok).toMatchObject({ valid: true, blocks: 6 });

    // Someone edits the resolved complaint's response directly in the database, bypassing the app.
    await db.query("UPDATE complaints SET response = 'tampered' WHERE id = $1", [id]);
    const tampered = await chain.verifyChainIntegrity(db, admin);
    expect(tampered.valid).toBe(false);
    expect(tampered.mismatches).toHaveLength(1);

    await db.query(
      "UPDATE complaints SET response = 'Technician replaced the unit.' WHERE id = $1",
      [id],
    );

    // Someone edits a stored block's hash directly.
    await db.query(
      "UPDATE chain_blocks SET hash = 'forged' WHERE complaint_id = $1 AND event_type = 'CREATED'",
      [id],
    );
    const forged = await chain.verifyChainIntegrity(db, admin);
    expect(forged.valid).toBe(false);
    expect(forged.reason).toMatch(/does not match its recorded content/);
  });

  it("only admins can read a chain or run the integrity check", async () => {
    await expect(chain.chainForComplaint(db, ann, "x")).rejects.toThrow();
    await expect(chain.verifyChainIntegrity(db, ann)).rejects.toThrow();
  });
});
