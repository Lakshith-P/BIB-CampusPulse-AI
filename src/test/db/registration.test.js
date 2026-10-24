// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

import { addUser, createTestDb } from "./harness";
import * as reg from "@/backend/registration.server";

const fastHash = (p) => bcrypt.hash(p, 4); // the real cost is 12; a test does not need to wait for it

let ctx, db, admin, teacher, outsider, sent, mailer, offline;
const login = async (email) =>
  (await db.query("SELECT id, password_hash FROM users WHERE email = $1", [email])).rows[0];
const roles = async (email) =>
  (
    await db.query(
      "SELECT role::text AS role FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = $1) ORDER BY 1",
      [email],
    )
  ).rows.map((r) => r.role);

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  teacher = await addUser(db, "tina@x.edu", "Tina", ["faculty"]);
  outsider = await addUser(db, "ann@x.edu", "Ann");
  sent = [];
  mailer = {
    ready: true,
    appUrl: "https://slqg.example",
    send: async (m) => void sent.push(m),
  };
  offline = { ready: false, appUrl: "", send: async () => {} };
}, 60_000);
afterAll(() => ctx?.close());

describe("generated passwords", () => {
  it("are 12 characters with a capital, a small letter, a digit and a symbol, and differ every time", () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const p = reg.generatePassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[@#%?+]/);
      expect(p).not.toMatch(/[0OIl1]/); // no look-alikes
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

describe("registering a student or teacher", () => {
  it("creates a student with a record and emails the login, never storing the password as typed", async () => {
    const r = await reg.registerUser(
      db,
      admin,
      {
        name: "Asha Rao",
        email: "asha@x.edu",
        role: "student",
        studentId: "S-1001",
        branch: "CSE",
        semester: 5,
        gradYear: 2027,
        teacherEmail: "tina@x.edu",
      },
      mailer,
      fastHash,
    );
    expect(r).toMatchObject({ status: "created", emailed: true });
    expect(r.password).toBeUndefined(); // it went by email, so it is not shown on screen
    expect(await roles("asha@x.edu")).toEqual(["student"]);
    const rec = (
      await db.query("SELECT faculty_id, record FROM student_records WHERE id = 'S-1001'")
    ).rows[0];
    expect(rec.faculty_id).toBe(teacher.id);
    expect(rec.record).toMatchObject({ name: "Asha Rao", branch: "CSE", semester: 5 });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("asha@x.edu");
    const password = sent[0].text.match(/Temporary password: (\S+)/)[1];
    expect(sent[0].text).toContain("https://slqg.example/auth");
    const user = await login("asha@x.edu");
    expect(user.password_hash).not.toContain(password);
    expect(await bcrypt.compare(password, user.password_hash)).toBe(true); // the emailed one works
  });

  it("gives a teacher only the teacher role and no student record", async () => {
    const r = await reg.registerUser(
      db,
      admin,
      { name: "Tom", email: "tom@x.edu", role: "faculty" },
      mailer,
      fastHash,
    );
    expect(r.status).toBe("created");
    expect(await roles("tom@x.edu")).toEqual(["faculty"]);
    const owned = await db.query("SELECT 1 FROM student_records WHERE owner_id = $1", [
      (await login("tom@x.edu")).id,
    ]);
    expect(owned.rowCount).toBe(0);
  });

  it("shows the password to the administrator once when email is not set up", async () => {
    const r = await reg.registerUser(
      db,
      admin,
      { name: "Zed", email: "zed@x.edu", role: "student" },
      offline,
      fastHash,
    );
    expect(r).toMatchObject({ status: "created", emailed: false });
    expect(await bcrypt.compare(r.password, (await login("zed@x.edu")).password_hash)).toBe(true);
  });

  it("keeps the person and shows the password when sending the email fails", async () => {
    const broken = {
      ready: true,
      appUrl: "https://x",
      send: async () => Promise.reject(new Error("SMTP down")),
    };
    const r = await reg.registerUser(
      db,
      admin,
      { name: "Eve", email: "eve@x.edu", role: "student" },
      broken,
      fastHash,
    );
    expect(r).toMatchObject({ status: "created", emailed: false, mailError: "SMTP down" });
    expect(r.password).toBeTruthy();
  });

  it("skips an email that is already registered and refuses unknown teachers or used student IDs", async () => {
    expect(
      (
        await reg.registerUser(
          db,
          admin,
          { name: "Asha", email: "asha@x.edu", role: "student" },
          mailer,
          fastHash,
        )
      ).status,
    ).toBe("exists");
    expect(
      await reg.registerUser(
        db,
        admin,
        { name: "Q", email: "q@x.edu", role: "student", teacherEmail: "nobody@x.edu" },
        mailer,
        fastHash,
      ),
    ).toMatchObject({ status: "failed", reason: /teacher/ });
    expect(
      await reg.registerUser(
        db,
        admin,
        { name: "R", email: "r@x.edu", role: "student", studentId: "S-1001" },
        mailer,
        fastHash,
      ),
    ).toMatchObject({ status: "failed", reason: /already used/ });
    expect(
      (await db.query("SELECT 1 FROM users WHERE email IN ('q@x.edu','r@x.edu')")).rowCount,
    ).toBe(0);
  });

  it("is for administrators only", async () => {
    for (const who of [teacher, outsider])
      await expect(
        reg.registerUser(
          db,
          who,
          { name: "X", email: "x@x.edu", role: "student" },
          mailer,
          fastHash,
        ),
      ).rejects.toThrow(/administrator/);
  });

  it("registers a list, one failure not stopping the rest", async () => {
    sent.length = 0;
    await db.query("BEGIN");
    const out = await reg.registerMany(
      db,
      admin,
      [
        { name: "A1", email: "a1@x.edu", role: "student" },
        { name: "A1 again", email: "a1@x.edu", role: "student" },
        { name: "Bad", email: "bad@x.edu", role: "student", teacherEmail: "nobody@x.edu" },
        { name: "T2", email: "t2@x.edu", role: "faculty" },
      ],
      mailer,
      fastHash,
    );
    await db.query("COMMIT");
    expect(out).toMatchObject({ created: 2, emailed: 2, skipped: 1, failed: 1 });
    expect(sent.map((m) => m.to)).toEqual(["a1@x.edu", "t2@x.edu"]);
  });
});

describe("changing a password needs an administrator's approval", () => {
  let id;
  it("keeps the old password until the request is approved, and tells the administrators", async () => {
    const user = await login("asha@x.edu");
    // give Asha a password we know
    await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      user.id,
      await fastHash("OldPass#123"),
    ]);
    const asha = { id: user.id };
    await expect(
      reg.requestPasswordChange(db, asha, { current: "wrong", next: "NewPass#456" }, fastHash),
    ).rejects.toThrow(/incorrect/);
    await reg.requestPasswordChange(
      db,
      asha,
      { current: "OldPass#123", next: "NewPass#456" },
      fastHash,
    );
    const now = await login("asha@x.edu");
    expect(await bcrypt.compare("OldPass#123", now.password_hash)).toBe(true);
    expect(await bcrypt.compare("NewPass#456", now.password_hash)).toBe(false);
    const note = (
      await db.query(
        "SELECT title, link FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
        [admin.id],
      )
    ).rows[0];
    expect(note.title).toContain("Password change");
    expect(note.link).toBe("/portal/access");
    id = (await reg.listPasswordRequests(db, admin)).find(
      (r) => r.kind === "change" && r.status === "pending",
    ).id;
  });

  it("applies the new password only when an administrator approves", async () => {
    sent.length = 0;
    expect(
      await reg.decidePasswordRequest(db, admin, { id, decision: "approve" }, mailer),
    ).toMatchObject({ status: "approved", emailed: true });
    const now = await login("asha@x.edu");
    expect(await bcrypt.compare("NewPass#456", now.password_hash)).toBe(true);
    expect(sent[0].to).toBe("asha@x.edu");
    expect(
      (await db.query("SELECT new_hash FROM password_requests WHERE id = $1", [id])).rows[0]
        .new_hash,
    ).toBeNull();
    await expect(
      reg.decidePasswordRequest(db, admin, { id, decision: "approve" }, mailer),
    ).rejects.toThrow(/already/);
  });

  it("leaves the password alone when the request is rejected", async () => {
    const user = await login("asha@x.edu");
    await reg.requestPasswordChange(
      db,
      { id: user.id },
      { current: "NewPass#456", next: "Other#7890" },
      fastHash,
    );
    const rid = (await reg.listPasswordRequests(db, admin)).find((r) => r.status === "pending").id;
    await reg.decidePasswordRequest(db, admin, { id: rid, decision: "reject" }, mailer);
    expect(await bcrypt.compare("NewPass#456", (await login("asha@x.edu")).password_hash)).toBe(
      true,
    );
  });

  it("only administrators can see or decide requests", async () => {
    await expect(reg.listPasswordRequests(db, teacher)).rejects.toThrow(/administrator/);
    await expect(
      reg.decidePasswordRequest(
        db,
        outsider,
        { id: "00000000-0000-4000-8000-000000000000", decision: "approve" },
        mailer,
      ),
    ).rejects.toThrow(/administrator/);
  });
});

describe("forgot password, without email", () => {
  const login2 = (email) => login(email);

  it("makes a request for the administrators and answers the same for an unknown email", async () => {
    expect(await reg.requestForgotPassword(db, { email: "nobody@x.edu" })).toEqual({
      state: "pending",
    });
    expect(await reg.requestForgotPassword(db, { email: "tom@x.edu" })).toEqual({
      state: "pending",
    });
    await reg.requestForgotPassword(db, { email: "tom@x.edu" }); // asking again adds nothing
    const open = (await reg.listPasswordRequests(db, admin)).filter(
      (r) => r.kind === "forgot" && r.status === "pending",
    );
    expect(open.map((r) => r.email)).toEqual(["tom@x.edu"]); // the unknown address is not listed
    const note = await db.query(
      "SELECT title FROM notifications WHERE user_id = $1 AND title LIKE 'Forgot password%'",
      [admin.id],
    );
    expect(note.rows).toHaveLength(1);
  });

  it("cannot set a new password before the administrator approves", async () => {
    await expect(
      reg.completeForgotPassword(db, { email: "tom@x.edu", password: "BrandNew#123" }, fastHash),
    ).rejects.toThrow(/no approved request/);
  });

  it("lets the person set a new password once approved, with no email or link involved", async () => {
    sent.length = 0;
    const id = (await reg.listPasswordRequests(db, admin)).find((r) => r.kind === "forgot").id;
    const out = await reg.decidePasswordRequest(db, admin, { id, decision: "approve" }, offline);
    expect(out).toMatchObject({ status: "approved", emailed: false });
    expect(out.link).toBeUndefined();
    // asking again now says the request was approved
    expect(await reg.requestForgotPassword(db, { email: "tom@x.edu" })).toEqual({
      state: "approved",
    });
    expect((await reg.listPasswordRequests(db, admin)).find((r) => r.id === id).waiting).toBe(true);

    const before = (await login2("tom@x.edu")).password_hash;
    await reg.completeForgotPassword(
      db,
      { email: "tom@x.edu", password: "BrandNew#123" },
      fastHash,
    );
    const after = (await login2("tom@x.edu")).password_hash;
    expect(after).not.toBe(before);
    expect(await bcrypt.compare("BrandNew#123", after)).toBe(true); // saved in the database
    const done = (await reg.listPasswordRequests(db, admin)).find((r) => r.id === id);
    expect(done).toMatchObject({ status: "completed", waiting: false });
  });

  it("works only once: the same approval cannot be used again", async () => {
    await expect(
      reg.completeForgotPassword(db, { email: "tom@x.edu", password: "Another#4567" }, fastHash),
    ).rejects.toThrow(/no approved request/);
    // a new request starts again from the beginning
    expect(await reg.requestForgotPassword(db, { email: "tom@x.edu" })).toEqual({
      state: "pending",
    });
  });

  it("stops working after the approval window", async () => {
    await reg.requestForgotPassword(db, { email: "zed@x.edu" });
    const id = (await reg.listPasswordRequests(db, admin)).find(
      (r) => r.email === "zed@x.edu" && r.status === "pending",
    ).id;
    await reg.decidePasswordRequest(db, admin, { id, decision: "approve" }, offline);
    await db.query(
      "UPDATE password_requests SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [id],
    );
    await expect(
      reg.completeForgotPassword(db, { email: "zed@x.edu", password: "TooLate#12345" }, fastHash),
    ).rejects.toThrow(/no approved request/);
  });

  it("a rejected request cannot be used", async () => {
    await reg.requestForgotPassword(db, { email: "eve@x.edu" });
    const id = (await reg.listPasswordRequests(db, admin)).find(
      (r) => r.email === "eve@x.edu" && r.status === "pending",
    ).id;
    await reg.decidePasswordRequest(db, admin, { id, decision: "reject" }, offline);
    await expect(
      reg.completeForgotPassword(db, { email: "eve@x.edu", password: "Nope#123456" }, fastHash),
    ).rejects.toThrow(/no approved request/);
  });

  it("an address with no account can never be approved into a password change", async () => {
    await expect(
      reg.completeForgotPassword(db, { email: "nobody@x.edu", password: "Ghost#123456" }, fastHash),
    ).rejects.toThrow(/no approved request/);
  });
});
