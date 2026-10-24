// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as am from "@/backend/admin-messages.server";

let ctx, db, admin, otherAdmin, tina, ann, ben;
const notes = async (user) =>
  (
    await db.query(
      "SELECT title, body, link, area FROM notifications WHERE user_id = $1 AND area = 'Administrator' ORDER BY created_at",
      [user.id],
    )
  ).rows;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "admin@x.edu", "Admin One", ["admin"]);
  otherAdmin = await addUser(db, "admin2@x.edu", "Admin Two", ["admin"]);
  tina = await addUser(db, "tina@x.edu", "Tina", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann", ["student"]);
  ben = await addUser(db, "ben@x.edu", "Ben", ["student"]);
  await addStudent(db, "S-ANN", ann, tina);
  await addStudent(db, "S-BEN", ben, tina);
}, 60_000);
afterAll(() => ctx?.close());

describe("an administrator posts a message", () => {
  it("reaches every student as a notification, and no one else", async () => {
    const r = await am.postAdminMessage(db, admin, {
      audience: "students",
      subject: "Exam timetable",
      body: "Exams begin on 3 December.",
    });
    expect(r).toEqual({ sent: 2, to: "All students" });
    for (const s of [ann, ben])
      expect(await notes(s)).toEqual([
        {
          title: "Exam timetable",
          body: "Exams begin on 3 December.",
          link: "/portal/notifications",
          area: "Administrator",
        },
      ]);
    expect(await notes(tina)).toEqual([]);
    expect(await notes(admin)).toEqual([]); // the sender is not told about their own message
  });

  it("reaches all teachers", async () => {
    expect(
      (await am.postAdminMessage(db, admin, { audience: "teachers", body: "Staff meeting" })).sent,
    ).toBe(1);
    const [n] = await notes(tina);
    expect(n.title).toBe("Message from Admin One"); // no subject given
    expect(n.body).toBe("Staff meeting");
  });

  it("reaches everyone except the sender", async () => {
    const r = await am.postAdminMessage(db, admin, {
      audience: "everyone",
      body: "Holiday on Friday",
    });
    expect(r.sent).toBe(4); // Admin Two, Tina, Ann and Ben
    expect((await notes(otherAdmin)).map((n) => n.body)).toEqual(["Holiday on Friday"]);
  });

  it("reaches one person, for example to answer a message from the Contact page", async () => {
    const r = await am.postAdminMessage(db, admin, {
      audience: "person",
      userId: ann.id,
      body: "We have fixed your issue.",
    });
    expect(r).toEqual({ sent: 1, to: "Ann" });
    expect((await notes(ann)).at(-1).body).toBe("We have fixed your issue.");
    expect((await notes(ben)).map((n) => n.body)).not.toContain("We have fixed your issue.");
  });

  it("keeps what was sent, newest first", async () => {
    const list = await am.listAdminMessages(db, admin);
    expect(list.map((m) => m.recipient_label)).toEqual([
      "Ann",
      "Everyone",
      "All teachers",
      "All students",
    ]);
    expect(list[0]).toMatchObject({
      sender: "Admin One",
      recipients: 1,
      body: "We have fixed your issue.",
    });
  });

  it("needs a message, a valid audience and a person for a personal message", async () => {
    await expect(
      am.postAdminMessage(db, admin, { audience: "students", body: "   " }),
    ).rejects.toThrow(/Write a message/);
    await expect(am.postAdminMessage(db, admin, { audience: "nobody", body: "x" })).rejects.toThrow(
      /Choose who/,
    );
    await expect(am.postAdminMessage(db, admin, { audience: "person", body: "x" })).rejects.toThrow(
      /Choose the person/,
    );
    await expect(
      am.postAdminMessage(db, admin, {
        audience: "person",
        userId: "00000000-0000-4000-8000-000000000000",
        body: "x",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("is for administrators only", async () => {
    for (const who of [tina, ann]) {
      await expect(
        am.postAdminMessage(db, who, { audience: "everyone", body: "x" }),
      ).rejects.toThrow(/administrator/);
      await expect(am.listAdminMessages(db, who)).rejects.toThrow(/administrator/);
    }
  });
});
