// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as messaging from "@/backend/messaging.server";

let ctx, db, tina, tom, admin, ann, ben, cara, dev;
const pdf = (text = "syllabus") => ({
  name: "plan.pdf",
  type: "application/pdf",
  base64: Buffer.from(text).toString("base64"),
});
const inbox = async (user) => {
  const overview = await messaging.loadChatOverview(db, user);
  const out = [];
  for (const r of overview.requests.filter((x) => x.status === "approved"))
    out.push(...(await messaging.loadChatMessages(db, user, { type: "private", id: r.id })));
  return out;
};

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  tina = await addUser(db, "tina@x.edu", "Tina", ["faculty"]);
  tom = await addUser(db, "tom@x.edu", "Tom", ["faculty"]);
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  cara = await addUser(db, "cara@x.edu", "Cara");
  dev = await addUser(db, "dev@x.edu", "Dev");
  await addStudent(db, "S-ANN", ann, tina);
  await addStudent(db, "S-BEN", ben, tina);
  await addStudent(db, "S-CARA", cara, tom);
  await addStudent(db, "S-NOACC", null, tina); // a record with no account yet
  await addStudent(db, "S-DEV", dev, null); // no teacher
}, 60_000);
afterAll(() => ctx?.close());

describe("messaging all of a teacher's students", () => {
  it("sends one message to every assigned student that has an account, in their own chat", async () => {
    const r = await messaging.messageStudents(db, tina, {
      all: true,
      body: "Class is moved to 10am",
    });
    expect(r).toEqual({ sent: 2, skipped: 0 });
    for (const student of [ann, ben]) {
      const msgs = await inbox(student);
      expect(msgs.map((m) => m.body)).toEqual(["Class is moved to 10am"]);
      expect(msgs[0].sender_name).toBe("Tina");
    }
    expect(await inbox(cara)).toEqual([]); // another teacher's student gets nothing
    expect(await inbox(dev)).toEqual([]);
  });

  it("lets the student answer in that chat, and tells them with a notification", async () => {
    const chat = (await messaging.loadChatOverview(db, ann)).requests[0];
    expect(chat.status).toBe("approved");
    await messaging.sendChatMessage(db, ann, { type: "private", id: chat.id, body: "Thank you" });
    const seen = await messaging.loadChatMessages(db, tina, { type: "private", id: chat.id });
    expect(seen.map((m) => m.body)).toEqual(["Class is moved to 10am", "Thank you"]);
    const note = await db.query("SELECT title, link FROM notifications WHERE user_id = $1", [
      ann.id,
    ]);
    expect(note.rows[0]).toMatchObject({ title: "New message from Tina", link: "/portal/chat" });
  });

  it("reuses an existing chat instead of making a second one", async () => {
    await messaging.messageStudents(db, tina, { all: true, body: "Second message" });
    const overview = await messaging.loadChatOverview(db, tina);
    expect(overview.requests.filter((r) => r.student_id === "S-ANN")).toHaveLength(1);
    expect((await inbox(ann)).map((m) => m.body)).toEqual([
      "Class is moved to 10am",
      "Thank you",
      "Second message",
    ]);
  });
});

describe("messaging chosen students", () => {
  it("sends to one student only", async () => {
    await messaging.messageStudents(db, tina, { studentIds: ["S-BEN"], body: "Only for Ben" });
    expect((await inbox(ben)).map((m) => m.body)).toContain("Only for Ben");
    expect((await inbox(ann)).map((m) => m.body)).not.toContain("Only for Ben");
  });

  it("sends to several chosen students and skips those that are not the teacher's", async () => {
    const r = await messaging.messageStudents(db, tina, {
      studentIds: ["S-ANN", "S-BEN", "S-CARA", "S-NOPE"],
      body: "Pick-and-choose",
    });
    expect(r).toEqual({ sent: 2, skipped: 2 }); // Cara is Tom's; S-NOPE does not exist
    expect((await inbox(cara)).map((m) => m.body)).not.toContain("Pick-and-choose");
  });

  it("refuses when nobody in the list can be reached", async () => {
    await expect(
      messaging.messageStudents(db, tina, { studentIds: ["S-CARA"], body: "x" }),
    ).rejects.toThrow(/None of those students/);
    await expect(
      messaging.messageStudents(db, tina, { studentIds: [], body: "x" }),
    ).rejects.toThrow(/Choose who/);
  });
});

describe("rules for broadcasts", () => {
  it("is for teachers and administrators, never students", async () => {
    await expect(messaging.messageStudents(db, ann, { all: true, body: "hi" })).rejects.toThrow(
      /Only teachers/,
    );
  });

  it("needs something to say", async () => {
    await expect(messaging.messageStudents(db, tina, { all: true, body: "  " })).rejects.toThrow(
      /Write a message/,
    );
  });

  it("can carry a file to everyone, which each student can download", async () => {
    await messaging.messageStudents(db, tina, { all: true, body: "", file: pdf("notes") });
    const chat = (await messaging.loadChatOverview(db, ben)).requests[0];
    const last = (await messaging.loadChatMessages(db, ben, { type: "private", id: chat.id })).at(
      -1,
    );
    expect(last).toMatchObject({ has_file: true, file_name: "plan.pdf", body: "" });
    const file = await messaging.downloadChatFile(db, ben, {
      type: "private",
      id: chat.id,
      messageId: last.id,
    });
    expect(Buffer.from(file.base64, "base64").toString()).toBe("notes");
  });

  it("an administrator can message any student, including one with no teacher", async () => {
    const r = await messaging.messageStudents(db, admin, { all: true, body: "Welcome back" });
    expect(r.sent).toBe(4); // Ann, Ben, Cara and Dev (the record without an account is skipped)
    expect((await inbox(dev)).map((m) => m.body)).toEqual(["Welcome back"]);
    expect((await inbox(cara)).map((m) => m.body)).toContain("Welcome back");
  });

  it("another teacher cannot read a chat that was opened for someone else's student", async () => {
    const chat = (await messaging.loadChatOverview(db, ann)).requests[0];
    await expect(
      messaging.loadChatMessages(db, tom, { type: "private", id: chat.id }),
    ).rejects.toThrow();
  });

  it("limits a file by the total copied: big files only go to a few students", async () => {
    const big = {
      name: "big.pdf",
      type: "application/pdf",
      base64: Buffer.alloc(2.9 * 1024 * 1024, 1).toString("base64"),
    };
    // 4 students x 2.9 MB is under the 30 MB limit...
    await expect(
      messaging.messageStudents(db, admin, { all: true, body: "x", file: big }),
    ).resolves.toMatchObject({ sent: 4 });
    // ...but 11 x 2.9 MB is not
    for (let i = 0; i < 7; i++) {
      const u = await addUser(db, `extra${i}@x.edu`, `Extra ${i}`);
      await addStudent(db, `S-EX${i}`, u, tina);
    }
    await expect(
      messaging.messageStudents(db, admin, { all: true, body: "x", file: big }),
    ).rejects.toThrow(/too large/);
    await expect(
      messaging.messageStudents(db, tina, { studentIds: ["S-ANN"], body: "x", file: big }),
    ).resolves.toMatchObject({ sent: 1 });
  });
});
