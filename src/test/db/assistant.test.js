// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import { assistantRole, assistantTools } from "@/backend/assistant.server";
import { handleChat } from "@/lib/chat.server";

let ctx, db;
let asha, ravi, mira, teacher, otherTeacher, admin, adminStudent, visitor;

const run = (tool, input = {}) => tool.execute(input, { toolCallId: "t", messages: [] });

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  asha = await addUser(db, "asha@x.edu", "Asha");
  ravi = await addUser(db, "ravi@x.edu", "Ravi");
  mira = await addUser(db, "mira@x.edu", "Mira");
  teacher = await addUser(db, "t@x.edu", "Teacher One", ["faculty"]);
  otherTeacher = await addUser(db, "t2@x.edu", "Teacher Two", ["faculty"]);
  admin = await addUser(db, "a@x.edu", "Admin", ["admin"]);
  adminStudent = await addUser(db, "as@x.edu", "Admin Student", ["admin"]);
  visitor = null;
  await addStudent(db, "S-ASHA", asha, teacher, {
    name: "Asha Rao",
    branch: "CSE",
    cgpa: 6.1,
    backlogs: 1,
    semesterGrades: [6.4, 6.1],
    subjects: [
      { subject: "Maths", marks: 35, classesHeld: 40, classesAttended: 24 },
      { subject: "Coding", marks: 82, classesHeld: 40, classesAttended: 38 },
    ],
  });
  await addStudent(db, "S-RAVI", ravi, teacher, {
    name: "Ravi Kumar",
    branch: "CSE",
    cgpa: 8.8,
    subjects: [{ subject: "Maths", marks: 90, classesHeld: 40, classesAttended: 39 }],
  });
  await addStudent(db, "S-MIRA", mira, otherTeacher, {
    name: "Mira Nair",
    branch: "ECE",
    cgpa: 7.2,
    subjects: [{ subject: "Circuits", marks: 66, classesHeld: 40, classesAttended: 36 }],
  });
  await db.query(
    "INSERT INTO campus_interventions (student_id, created_by, reason, action, priority, owner, follow_up_date) VALUES ('S-ASHA', $1, 'Low attendance in Maths', 'Weekly mentor check-in', 'high', 'Faculty mentor', '2020-01-01')",
    [teacher.id],
  );
}, 60_000);

afterAll(async () => {
  await ctx?.close();
});

describe("which role gets which tools", () => {
  it("decides the role from the account, with administrator above teacher above student", () => {
    expect(assistantRole(null)).toBe("visitor");
    expect(assistantRole(asha)).toBe("student");
    expect(assistantRole(teacher)).toBe("faculty");
    expect(assistantRole(admin)).toBe("admin");
    expect(assistantRole(adminStudent)).toBe("admin");
  });

  it("gives each role a different set of tools and a visitor none", () => {
    const names = (user) => Object.keys(assistantTools({ db, user })).sort();
    expect(names(visitor)).toEqual([]);
    expect(names(asha)).toEqual([
      "my_attention",
      "my_overview",
      "my_placement",
      "my_predictions",
      "my_subjects",
      "my_support",
    ]);
    expect(names(teacher)).toEqual([
      "class_overview",
      "find_students",
      "predicted_risk",
      "student_detail",
      "support_actions",
    ]);
    expect(names(admin)).toEqual(
      [...names(teacher), "department_comparison", "teacher_workload"].sort(),
    );
  });
});

describe("a student", () => {
  const tools = () => assistantTools({ db, user: asha });

  it("sees their own numbers", async () => {
    const o = await run(tools().my_overview);
    expect(o).toMatchObject({ id: "S-ASHA", name: "Asha Rao", backlogs: 1, latestSgpa: 6.1 });
    expect(o.attendance).toBe(77.5);
  });

  it("gets subject-by-subject attendance with the exact classes needed", async () => {
    const { subjects } = await run(tools().my_subjects);
    const maths = subjects.find((s) => s.subject === "Maths");
    expect(maths).toMatchObject({ marks: 35, attendance: 60, classesNeededToReach75: 24 });
    expect(subjects[0].subject).toBe("Maths"); // weakest first
  });

  it("gets predictions with a risk level and actions", async () => {
    const p = await run(tools().my_predictions);
    expect(p).toHaveProperty("riskLevel");
    expect(p.placement).toHaveProperty("criteria");
    expect(Array.isArray(p.recommendedActions)).toBe(true);
  });

  it("sees the support actions created for them, and nobody else's", async () => {
    const { supportActions } = await run(tools().my_support);
    expect(supportActions).toHaveLength(1);
    expect(supportActions[0].action).toContain("mentor check-in");
    const raviTools = assistantTools({ db, user: ravi });
    expect((await run(raviTools.my_support)).supportActions).toEqual([]);
    expect((await run(raviTools.my_overview)).id).toBe("S-RAVI");
  });

  it("has no way to ask about another student", () => {
    expect(tools().student_detail).toBeUndefined();
    expect(tools().find_students).toBeUndefined();
  });

  it("is told plainly when no record is linked", async () => {
    const lonely = await addUser(db, "n@x.edu", "No Record");
    expect((await run(assistantTools({ db, user: lonely }).my_overview)).error).toMatch(
      /No student record/,
    );
  });
});

describe("a teacher", () => {
  const tools = () => assistantTools({ db, user: teacher });

  it("sees only the students assigned to them", async () => {
    const { students, totalMatching } = await run(tools().find_students);
    expect(totalMatching).toBe(2);
    expect(students.map((s) => s.id).sort()).toEqual(["S-ASHA", "S-RAVI"]);
    expect((await run(tools().class_overview)).scope.students).toBe(2);
  });

  it("filters, and finds a student by part of a name", async () => {
    expect(
      (await run(tools().find_students, { lowAttendance: true })).students.map((s) => s.id),
    ).toEqual(["S-ASHA"]);
    expect((await run(tools().find_students, { minCgpa: 8 })).students.map((s) => s.id)).toEqual([
      "S-RAVI",
    ]);
    const d = await run(tools().student_detail, { student: "asha" });
    expect(d).toMatchObject({ id: "S-ASHA", name: "Asha Rao" });
    expect(d.subjects.find((s) => s.subject === "Maths").classesNeededToReach75).toBe(24);
    expect(d.supportActions).toHaveLength(1);
    expect(d.predictions).toHaveProperty("riskLevel");
  });

  it("cannot see a student assigned to another teacher", async () => {
    expect((await run(tools().student_detail, { student: "Mira" })).error).toMatch(
      /No student matching/,
    );
    expect((await run(tools().student_detail, { student: "S-MIRA" })).error).toMatch(
      /No student matching/,
    );
    expect((await run(tools().find_students, { query: "mira" })).students).toEqual([]);
  });

  it("lists overdue follow-ups and the predicted-risk ranking for their own students only", async () => {
    const s = await run(tools().support_actions, { overdueOnly: true });
    expect(s.supportActions[0]).toMatchObject({ studentId: "S-ASHA", overdue: true });
    const risk = await run(tools().predicted_risk, {});
    expect(risk.students.map((r) => r.id)).not.toContain("S-MIRA");
    expect(otherTeacher.id).not.toBe(teacher.id);
    const other = assistantTools({ db, user: otherTeacher });
    expect((await run(other.find_students)).students.map((s) => s.id)).toEqual(["S-MIRA"]);
  });

  it("asks to disambiguate when a name matches several students", async () => {
    const t = assistantTools({ db, user: admin });
    const out = await run(t.student_detail, { student: "S-" });
    expect(out.matches.length).toBeGreaterThan(1);
  });
});

describe("an administrator", () => {
  const tools = () => assistantTools({ db, user: admin });

  it("sees everyone and can compare departments and teachers", async () => {
    expect((await run(tools().find_students, { limit: 25 })).totalMatching).toBe(3);
    const { departments } = await run(tools().department_comparison);
    expect(departments.map((d) => d.branch)).toEqual(["CSE", "ECE"]);
    expect(departments.find((d) => d.branch === "CSE").students).toBe(2);
    const { teachers } = await run(tools().teacher_workload);
    expect(teachers.map((t) => t.teacher).sort()).toEqual(["Teacher One", "Teacher Two"]);
    expect(teachers.find((t) => t.teacher === "Teacher One")).toMatchObject({
      students: 2,
      openActions: 1,
      overdueActions: 1,
    });
    expect((await run(tools().student_detail, { student: "Mira" })).id).toBe("S-MIRA");
  });
});

describe("the chat endpoint", () => {
  const request = (messages) =>
    new Request("http://localhost/api/public/chat", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  const ask = (text, extra = []) => [
    ...extra,
    { id: "u1", role: "user", parts: [{ type: "text", text }] },
  ];
  const read = async (response) => {
    const raw = await response.text();
    let text = "";
    let lookups = [];
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      const e = JSON.parse(line.slice(6));
      if (e.type === "text-delta") text += e.delta;
      if (e.type === "data-lookups") lookups = e.data.tools;
    }
    return { text, lookups };
  };

  const call = async (user, messages, generate) => {
    const seen = { calls: 0 };
    const response = await handleChat(request(messages), {
      currentUser: async () => user,
      db,
      generate:
        generate ??
        (async (args) => {
          seen.calls++;
          Object.assign(seen, args);
          return { text: "A model-written answer.", model: "test" };
        }),
    });
    return { response, seen, ...(response.ok ? await read(response) : {}) };
  };

  it("uses one model request per question, with the looked-up data in it", async () => {
    const { seen, text, lookups } = await call(
      asha,
      ask("Which subject needs my attention first?"),
    );
    expect(seen.calls).toBe(1);
    expect(text.trim()).toBe("A model-written answer.");
    expect(lookups).toContain("my_subjects");
    expect(seen.system).toContain("DATA (looked up just now");
    expect(seen.system).toContain("Maths");
    expect(seen.system).toContain('"classesNeededToReach75":24');
  });

  it("gives each role its own instructions and its own data", async () => {
    const s = await call(asha, ask("How am I doing overall?"));
    const t = await call(teacher, ask("Which of my students need attention?"));
    const a = await call(admin, ask("Which department has the most at-risk students?"));
    const v = await call(visitor, ask("What is the success score?"));
    expect(s.seen.system).toContain("student workspace");
    expect(t.seen.system).toContain("teacher workspace");
    expect(a.seen.system).toContain("administrator workspace");
    expect(v.seen.system).toContain("public website");
    expect(s.seen.system).toContain("Asha Rao");
    expect(t.seen.system).not.toContain("Mira Nair"); // another teacher's student
    expect(a.lookups).toContain("department_comparison");
    expect(a.seen.system).toContain("ECE");
    expect(v.lookups).toEqual([]);
    expect(v.seen.system).not.toContain("DATA (looked up");
    expect(new Set([s.seen.system, t.seen.system, a.seen.system, v.seen.system]).size).toBe(4);
  });

  it("keeps a student from reaching another student record", async () => {
    const { seen } = await call(asha, ask("Show me the marks of Ravi Kumar"));
    expect(seen.system).not.toContain("Ravi Kumar");
    expect(seen.system).not.toContain("S-RAVI");
    expect(seen.system).toContain("other students' records are private");
  });

  it("reads a follow-up together with the question before it", async () => {
    const history = [
      {
        id: "u0",
        role: "user",
        parts: [{ type: "text", text: "How many classes must I attend to reach 75%?" }],
      },
      { id: "a0", role: "assistant", parts: [{ type: "text", text: "You need 24 in Maths." }] },
    ];
    const { lookups, seen } = await call(asha, ask("and for coding?", history));
    expect(lookups).toContain("my_subjects");
    expect(JSON.stringify(seen.messages)).toContain("You need 24 in Maths.");
  });

  it("tells the model to answer the question and not to repeat itself", async () => {
    const { seen } = await call(asha, ask("Which subject is my weakest?"));
    expect(seen.system).toContain("Answer exactly what was asked");
    expect(seen.system).toContain("Never repeat something you already said");
    expect(seen.system).not.toMatch(/Who needs help\? Why are they at risk/);
  });

  it("sends only the text of earlier turns to the model", async () => {
    const history = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "Hi" }] },
      {
        id: "a0",
        role: "assistant",
        parts: [
          {
            type: "tool-my_overview",
            toolCallId: "x",
            state: "output-available",
            input: {},
            output: { secret: 1 },
          },
          { type: "text", text: "You are doing fine." },
        ],
      },
    ];
    const { seen } = await call(asha, ask("And attendance?", history));
    expect(JSON.stringify(seen.messages)).toContain("You are doing fine.");
    expect(JSON.stringify(seen.messages)).not.toContain("secret");
  });

  it("still answers from the person's own data when no model can be reached", async () => {
    const down = async () => {
      throw new Error("quota");
    };
    const student = await call(asha, ask("Which subject needs my attention first?"), down);
    expect(student.text).toContain("Maths");
    expect(student.text).toContain("24 classes");
    expect(student.text).toContain("AI model is unavailable");
    const staff = await call(teacher, ask("Who has attendance below 75%?"), down);
    expect(staff.text).toContain("Asha Rao");
    expect(staff.text).not.toContain("Mira");
    const visitorAnswer = await call(visitor, ask("What is the success score?"), down);
    expect(visitorAnswer.text).toContain("On Track");
    expect(visitorAnswer.text).not.toContain("unavailable");
    const mine = await call(visitor, ask("What are my marks?"), down);
    expect(mine.text).toContain("Sign in");
  });

  it("rejects a conversation that does not end with a question, and a foreign origin", async () => {
    const { response } = await call(asha, [
      { id: "a", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
    ]);
    expect(response.status).toBe(400);
    const foreign = new Request("http://localhost/api/public/chat", {
      method: "POST",
      headers: { origin: "http://evil.test" },
      body: "{}",
    });
    expect((await handleChat(foreign, { currentUser: async () => asha })).status).toBe(403);
  });
});
