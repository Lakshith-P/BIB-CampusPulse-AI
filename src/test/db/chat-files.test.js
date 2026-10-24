// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStudent, addUser, createTestDb } from "./harness";
import * as messaging from "@/backend/messaging.server";

let ctx, db, teacher, otherTeacher, outsider, admin, ann, ben, cara, roomA, roomB;

const pdf = (text = "%PDF-1.4 syllabus") => ({
  name: "syllabus.pdf",
  type: "application/pdf",
  base64: Buffer.from(text).toString("base64"),
});

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "t1@chat.test", "Teacher One", ["faculty"]);
  otherTeacher = await addUser(db, "t2@chat.test", "Teacher Two", ["faculty"]);
  outsider = await addUser(db, "t3@chat.test", "Teacher Three", ["faculty"]);
  admin = await addUser(db, "admin@chat.test", "Admin", ["admin"]);
  ann = await addUser(db, "ann@chat.test", "Ann");
  ben = await addUser(db, "ben@chat.test", "Ben");
  cara = await addUser(db, "cara@chat.test", "Cara");
  const section = { branch: "CSE", semester: 3, section: "A", gradYear: 2028 };
  await addStudent(db, "CF-ANN", ann, teacher, section);
  await addStudent(db, "CF-BEN", ben, otherTeacher, section);
  await addStudent(db, "CF-CARA", cara, otherTeacher, { ...section, section: "B" });
  roomA = (await messaging.loadChatOverview(db, ann)).sections[0].id;
  roomB = (await messaging.loadChatOverview(db, cara)).sections[0].id;
}, 60_000);

afterAll(() => ctx?.close());

describe("sharing a file in a section chat", () => {
  it("lets a teacher share a file and everyone in the section download the same bytes", async () => {
    const sent = await messaging.sendChatMessage(db, teacher, {
      type: "section",
      id: roomA,
      body: "Syllabus attached",
      file: pdf(),
    });
    expect(sent).toMatchObject({ has_file: true, file_name: "syllabus.pdf" });
    expect(sent).not.toHaveProperty("file_data");

    const listed = await messaging.loadChatMessages(db, ann, { type: "section", id: roomA });
    const message = listed.find((m) => m.id === sent.id);
    expect(message).toMatchObject({
      has_file: true,
      file_name: "syllabus.pdf",
      file_type: "application/pdf",
    });
    expect(message.file_size).toBe("%PDF-1.4 syllabus".length);
    expect(message).not.toHaveProperty("file_data"); // the file itself is never in the message list

    for (const member of [ann, ben, otherTeacher, admin]) {
      const file = await messaging.downloadChatFile(db, member, {
        type: "section",
        id: roomA,
        messageId: sent.id,
      });
      expect(Buffer.from(file.base64, "base64").toString()).toBe("%PDF-1.4 syllabus");
      expect(file.name).toBe("syllabus.pdf");
    }
  });

  it("lets a file be sent with no text, but not an empty message", async () => {
    const sent = await messaging.sendChatMessage(db, teacher, {
      type: "section",
      id: roomA,
      body: "",
      file: pdf("only a file"),
    });
    expect(sent.body).toBe("");
    expect(sent.has_file).toBe(true);
    await expect(
      messaging.sendChatMessage(db, teacher, { type: "section", id: roomA, body: "   " }),
    ).rejects.toThrow(/message or attach a file/);
  });

  it("lets an administrator share a file too", async () => {
    const sent = await messaging.sendChatMessage(db, admin, {
      type: "section",
      id: roomA,
      body: "Notice",
      file: pdf("notice"),
    });
    expect(sent.has_file).toBe(true);
  });

  it("does not let a student upload, though students can still send text", async () => {
    await expect(
      messaging.sendChatMessage(db, ann, {
        type: "section",
        id: roomA,
        body: "my file",
        file: pdf(),
      }),
    ).rejects.toThrow(/Only teachers and administrators can share files/);
    expect(
      (await messaging.sendChatMessage(db, ann, { type: "section", id: roomA, body: "thanks sir" }))
        .has_file,
    ).toBe(false);
  });

  it("keeps the file inside its chat", async () => {
    const sent = await messaging.sendChatMessage(db, teacher, {
      type: "section",
      id: roomA,
      body: "private to section A",
      file: pdf("secret"),
    });
    // a student in another section cannot read section A or its files
    await expect(
      messaging.downloadChatFile(db, cara, { type: "section", id: roomA, messageId: sent.id }),
    ).rejects.toThrow(/not available/);
    // a teacher with no students in section A cannot either
    await expect(
      messaging.downloadChatFile(db, outsider, { type: "section", id: roomA, messageId: sent.id }),
    ).rejects.toThrow(/not available/);
    // a message id from room A cannot be fetched by asking for room B, even by someone who may read room B
    await expect(
      messaging.downloadChatFile(db, cara, { type: "section", id: roomB, messageId: sent.id }),
    ).rejects.toThrow(/not available/);
    // a message with no file has nothing to download
    const plain = await messaging.sendChatMessage(db, teacher, {
      type: "section",
      id: roomA,
      body: "just text",
    });
    await expect(
      messaging.downloadChatFile(db, ann, { type: "section", id: roomA, messageId: plain.id }),
    ).rejects.toThrow(/not available/);
  });

  it("refuses file types a browser could run, and files over 3 MB", async () => {
    const html = {
      name: "page.html",
      type: "text/html",
      base64: Buffer.from("<script>alert(1)</script>").toString("base64"),
    };
    await expect(
      messaging.sendChatMessage(db, teacher, { type: "section", id: roomA, body: "x", file: html }),
    ).rejects.toThrow(/not allowed/);
    const huge = {
      name: "big.pdf",
      type: "application/pdf",
      base64: Buffer.alloc(3 * 1024 * 1024 + 1, 1).toString("base64"),
    };
    await expect(
      messaging.sendChatMessage(db, teacher, { type: "section", id: roomA, body: "x", file: huge }),
    ).rejects.toThrow(/3 MB/);
  });
});

describe("sharing a file in an approved private chat", () => {
  it("works between the student and their teacher, and nobody else", async () => {
    const request = await messaging.requestPrivateChat(db, ann);
    await messaging.reviewPrivateChat(db, teacher, { requestId: request.id, decision: "approved" });
    const sent = await messaging.sendChatMessage(db, teacher, {
      type: "private",
      id: request.id,
      body: "Your feedback",
      file: pdf("feedback"),
    });
    const file = await messaging.downloadChatFile(db, ann, {
      type: "private",
      id: request.id,
      messageId: sent.id,
    });
    expect(Buffer.from(file.base64, "base64").toString()).toBe("feedback");
    await expect(
      messaging.downloadChatFile(db, ben, { type: "private", id: request.id, messageId: sent.id }),
    ).rejects.toThrow(/not approved or available/);
    await expect(
      messaging.sendChatMessage(db, ann, {
        type: "private",
        id: request.id,
        body: "mine",
        file: pdf(),
      }),
    ).rejects.toThrow(/Only teachers and administrators/);
  });
});
