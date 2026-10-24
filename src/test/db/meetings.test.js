// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as meetings from "@/backend/meetings.server";

const NOW = new Date("2026-10-24T09:00:00Z");
const at = (iso) => new Date(iso).toISOString();
let ctx, db, mentor, other, admin, ann, ben, lone;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  mentor = await addUser(db, "m@x.edu", "Mentor", ["faculty"]);
  other = await addUser(db, "o@x.edu", "Other", ["faculty"]);
  admin = await addUser(db, "a@x.edu", "Admin", ["admin"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  lone = await addUser(db, "lone@x.edu", "Lone");
  await addStudent(db, "S-ANN", ann, mentor, { name: "Ann" });
  await addStudent(db, "S-BEN", ben, mentor, { name: "Ben" });
  await addStudent(db, "S-LONE", lone, null, { name: "Lone" });
}, 60_000);
afterAll(() => ctx?.close());

const ask = (user, slotAt, extra = {}) =>
  meetings.requestMeeting(
    db,
    user,
    { slotAt, durationMin: 30, mode: "in-person", topic: "Backlog plan", ...extra },
    NOW,
  );
const notes = async (userId) =>
  (
    await db.query("SELECT title FROM notifications WHERE user_id = $1 ORDER BY created_at", [
      userId,
    ])
  ).rows.map((r) => r.title);

describe("mentor meetings", () => {
  it("lets a student request a slot with their own mentor, who is notified", async () => {
    const { id } = await ask(ann, at("2026-10-26T05:00:00Z"));
    expect(id).toBeTruthy();
    expect((await notes(mentor.id)).at(-1)).toMatch(/Ann asked for a meeting/);
    const mine = await meetings.listMeetings(db, ann);
    expect(mine).toMatchObject([
      { status: "requested", mentorId: mentor.id, topic: "Backlog plan" },
    ]);
    expect(await meetings.listMeetings(db, ben)).toEqual([]);
    expect(await meetings.listMeetings(db, other)).toEqual([]);
    expect(await meetings.listMeetings(db, mentor)).toHaveLength(1);
    expect(await meetings.listMeetings(db, admin)).toHaveLength(1);
  });

  it("refuses past times, far-future times and students without a mentor", async () => {
    await expect(ask(ann, at("2026-10-23T05:00:00Z"))).rejects.toThrow(/future/);
    await expect(ask(ann, at("2027-03-01T05:00:00Z"))).rejects.toThrow(/next 60 days/);
    await expect(ask(lone, at("2026-10-26T05:00:00Z"))).rejects.toThrow(/do not have a mentor/);
  });

  it("only the mentor confirms, and a confirmed slot blocks a clashing one", async () => {
    const [m] = await meetings.listMeetings(db, ann);
    await expect(
      meetings.respondMeeting(db, other, { id: m.id, decision: "confirmed" }),
    ).rejects.toThrow(/not one booked with you/);
    await expect(
      meetings.respondMeeting(db, admin, { id: m.id, decision: "confirmed" }),
    ).rejects.toThrow();
    await meetings.respondMeeting(db, mentor, {
      id: m.id,
      decision: "confirmed",
      note: "Room 204",
    });
    expect((await notes(ann.id)).at(-1)).toMatch(/confirmed the meeting/);
    expect((await meetings.listMeetings(db, ann))[0]).toMatchObject({
      status: "confirmed",
      mentorNote: "Room 204",
    });
    await expect(ask(ben, at("2026-10-26T05:15:00Z"))).rejects.toThrow(/already has a meeting/);
    await expect(
      meetings.respondMeeting(db, mentor, { id: m.id, decision: "confirmed" }),
    ).rejects.toThrow(/cannot be marked/);
  });

  it("lets the student cancel, and the mentor decline or complete", async () => {
    const { id } = await ask(ben, at("2026-10-27T05:00:00Z"));
    await expect(meetings.cancelMeeting(db, ann, { id })).rejects.toThrow(/cannot be cancelled/);
    await meetings.cancelMeeting(db, ben, { id });
    expect((await notes(mentor.id)).at(-1)).toMatch(/Ben cancelled/);
    const second = await ask(ben, at("2026-10-28T05:00:00Z"));
    await meetings.respondMeeting(db, mentor, {
      id: second.id,
      decision: "declined",
      note: "Busy",
    });
    expect((await notes(ben.id)).at(-1)).toMatch(/declined/);
    const [annMeeting] = await meetings.listMeetings(db, ann);
    await meetings.respondMeeting(db, mentor, { id: annMeeting.id, decision: "completed" });
    expect((await meetings.listMeetings(db, ann))[0].status).toBe("completed");
  });

  it("caps how many upcoming requests a student can have", async () => {
    for (const day of ["2026-11-02", "2026-11-03", "2026-11-04"])
      await ask(ann, at(`${day}T05:00:00Z`));
    await expect(ask(ann, at("2026-11-05T05:00:00Z"))).rejects.toThrow(/already have 3/);
  });
});
