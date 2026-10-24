// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStudent, addUser, createTestDb } from "./harness";
import * as messaging from "@/backend/messaging.server";

let ctx, db, teacher, otherTeacher, ann, ben, cara;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "teacher1@chat.test", "Teacher One", ["faculty"]);
  otherTeacher = await addUser(db, "teacher2@chat.test", "Teacher Two", ["faculty"]);
  ann = await addUser(db, "ann@chat.test", "Ann");
  ben = await addUser(db, "ben@chat.test", "Ben");
  cara = await addUser(db, "cara@chat.test", "Cara");
  const section = { branch: "CSE", semester: 3, section: "A", gradYear: 2028 };
  await addStudent(db, "CHAT-ANN", ann, teacher, section);
  await addStudent(db, "CHAT-BEN", ben, otherTeacher, section);
  await addStudent(db, "CHAT-CARA", cara, otherTeacher, {
    ...section,
    section: "B",
  });
}, 60_000);

afterAll(() => ctx?.close());

describe("dashboard section chat", () => {
  it("limits section groups to students and teachers in those sections", async () => {
    const [studentChat, teacherChat, outsiderChat] = await Promise.all([
      messaging.loadChatOverview(db, ann),
      messaging.loadChatOverview(db, teacher),
      messaging.loadChatOverview(db, cara),
    ]);
    expect(studentChat.sections).toHaveLength(1);
    expect(studentChat.sections[0].label).toContain("Section A");
    expect(teacherChat.sections).toHaveLength(1);
    expect(outsiderChat.sections[0].label).toContain("Section B");
    const roomId = studentChat.sections[0].id;
    await messaging.sendChatMessage(db, ann, {
      type: "section",
      id: roomId,
      body: "Hello section",
    });
    expect(
      await messaging.loadChatMessages(db, ben, { type: "section", id: roomId }),
    ).toMatchObject([{ sender_name: "Ann", body: "Hello section" }]);
    await expect(
      messaging.loadChatMessages(db, cara, { type: "section", id: roomId }),
    ).rejects.toThrow(/not available/);
  });
});

describe("teacher-approved private chat", () => {
  it("keeps messages closed until the assigned teacher approves the student's request", async () => {
    await expect(messaging.requestPrivateChat(db, teacher)).rejects.toThrow(/Only students/);
    const request = await messaging.requestPrivateChat(db, ann);
    expect(request.status).toBe("pending");
    await expect(messaging.requestPrivateChat(db, ann)).rejects.toThrow(/already waiting/);
    await expect(
      messaging.reviewPrivateChat(db, otherTeacher, {
        requestId: request.id,
        decision: "approved",
      }),
    ).rejects.toThrow(/not assigned/);
    await expect(
      messaging.loadChatMessages(db, ann, { type: "private", id: request.id }),
    ).rejects.toThrow(/not approved/);

    await messaging.reviewPrivateChat(db, teacher, {
      requestId: request.id,
      decision: "approved",
    });
    await messaging.sendChatMessage(db, teacher, {
      type: "private",
      id: request.id,
      body: "Welcome",
    });
    await messaging.sendChatMessage(db, ann, {
      type: "private",
      id: request.id,
      body: "Thank you",
    });
    const messages = await messaging.loadChatMessages(db, ann, {
      type: "private",
      id: request.id,
    });
    expect(messages.map((message) => message.body)).toEqual(["Welcome", "Thank you"]);
    await expect(
      messaging.loadChatMessages(db, otherTeacher, { type: "private", id: request.id }),
    ).rejects.toThrow(/not approved/);
  });

  it("allows a student to reapply after the teacher declines", async () => {
    const request = await messaging.requestPrivateChat(db, ben);
    await messaging.reviewPrivateChat(db, otherTeacher, {
      requestId: request.id,
      decision: "rejected",
    });
    expect((await messaging.requestPrivateChat(db, ben)).status).toBe("pending");
  });
});
