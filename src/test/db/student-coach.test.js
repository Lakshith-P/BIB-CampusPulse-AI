// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import {
  askCoach,
  buildCoachTools,
  coachSuggestions,
  loadPeers,
  resetCoachCache,
} from "@/backend/student-coach.server";

const TODAY = "2026-10-25";
const NAMES = [
  "Asha",
  "Bhanu",
  "Chitra",
  "Deepak",
  "Esha",
  "Farid",
  "Gita",
  "Hari",
  "Indu",
  "Jai",
  "Kavya",
  "Lokesh",
];
const subj = (held, attended, marks) => [
  { subject: "Maths", marks, classesHeld: held, classesAttended: attended },
  { subject: "Physics", marks, classesHeld: held, classesAttended: attended },
];
const skills = (n) => ({ coding: n, aptitude: n, analytical: n, verbal: n, communication: n });
const lms = (done, total) => [
  {
    subject: "Maths",
    units: [
      {
        unit: 1,
        title: "U1",
        lessons: Array.from({ length: total }, (_, i) => ({
          title: `L${i}`,
          completed: i < done,
          resource: "",
        })),
        assignment: {
          title: "A1",
          deadline: "2030-01-01",
          submitted: done > total / 2,
          marks: null,
        },
      },
    ],
  },
];

let ctx, db, me, ids;
beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  const teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  // 12 students in CSE semester 3; student i is better the higher i is. "Asha" (index 0) is the weakest.
  ids = [];
  for (let i = 0; i < 12; i++) {
    const u = await addUser(db, `${NAMES[i].toLowerCase()}@x.edu`, NAMES[i], ["student"]);
    await addStudent(db, `S-${i}`, u, teacher, {
      name: NAMES[i],
      branch: "CSE",
      semester: 3,
      course: "B.Tech",
      cgpa: 5 + i * 0.35,
      subjects: subj(40, 24 + i, 45 + i * 4),
      skills: skills(35 + i * 5),
      lms: lms(2 + i, 14),
      resumeCompleteness: 40 + i * 4,
    });
    if (i === 3) me = u;
  }
  // two students in another branch, so "branch" and "class" differ from the university
  for (let i = 0; i < 2; i++) {
    const u = await addUser(db, `it${i}@x.edu`, `Itperson${i}`, ["student"]);
    await addStudent(db, `S-IT${i}`, u, teacher, {
      name: `Itperson${i}`,
      branch: "IT",
      semester: 3,
      cgpa: 8,
    });
  }
}, 60_000);
afterAll(() => ctx?.close());
beforeEach(() => resetCoachCache());

const everything = async (user) => {
  const { full, me: peer } = await (async () => {
    const { rows } = await db.query("SELECT id FROM student_records WHERE owner_id = $1", [
      user.id,
    ]);
    return { full: null, me: rows[0] };
  })();
  return peer;
};

describe("the cohort the coach compares with", () => {
  it("covers every student without names, and keeps the data small", async () => {
    const peers = await loadPeers(db);
    expect(peers).toHaveLength(14);
    const text = JSON.stringify(peers);
    for (const name of NAMES) expect(text).not.toContain(name);
    expect(text).not.toContain("Itperson");
    expect(text).not.toContain("@x.edu");
  });

  it("scores learning-platform use the same way as a full record", async () => {
    const peers = await loadPeers(db);
    const best = peers.find((p) => p.id === "S-11");
    const worst = peers.find((p) => p.id === "S-0");
    expect(best.components.lms).toBeGreaterThan(worst.components.lms);
    expect(best.score).toBeGreaterThan(worst.score);
  });
});

describe("the coach's tools", () => {
  let tools, evidence;
  beforeEach(async () => {
    const peers = await loadPeers(db);
    const peerMe = peers.find((p) => p.id === "S-3");
    evidence = [];
    tools = buildCoachTools(
      {
        me: peerMe,
        full: {
          subjects: [],
          skills: skills(50),
          lms: [],
          engagement: [],
          semesterGrades: [],
          backlogs: 0,
          cgpa: 6,
          resumeCompleteness: 50,
          assessmentsCompleted: 0,
          assessmentsRequired: 0,
          mockInterviews: 0,
        },
        peers,
        prediction: null,
      },
      evidence,
    );
  });

  it("ranks the student in their class, branch and the university", async () => {
    const cls = await tools.my_standing.execute({ group: "class" }, {});
    expect(cls.size).toBe(12);
    const score = cls.measures.find((m) => m.metric === "score");
    expect(score).toMatchObject({ rank: 9, of: 12, ahead: 8 }); // students 4..11 are ahead of student 3
    expect(score.percentile).toBe(27); // ahead of 3 of the 11 others
    expect(evidence[0]).toMatchObject({ id: "E1", tool: "my_standing" });
    const uni = await tools.my_standing.execute({ group: "university" }, {});
    expect(uni.size).toBe(14);
  });

  it("compares on one measure with the typical student and the top", async () => {
    const r = await tools.compare_on_measure.execute({ group: "class", metric: "attendance" }, {});
    expect(r.ahead).toBe(8);
    expect(r.top10).toBeGreaterThan(r.mine);
    expect(r.median).toBeGreaterThan(0);
  });

  it("lists the students just ahead, anonymously and rounded", async () => {
    const r = await tools.students_ahead.execute({ group: "class", metric: "score", limit: 3 }, {});
    expect(r.totalAhead).toBe(8);
    expect(r.profiles.map((p) => p.label)).toEqual(["Student A", "Student B", "Student C"]);
    const out = JSON.stringify({ r, evidence });
    for (const name of NAMES) expect(out).not.toContain(name);
    expect(out).not.toMatch(/S-\d/); // no student IDs
    for (const p of r.profiles) {
      expect(p.score % 5).toBe(0); // rounded to the nearest 5
      expect(p.attendance % 5).toBe(0);
    }
    // closest first: each is at least as good as the one before
    expect(r.profiles[0].score).toBeLessThanOrEqual(r.profiles[2].score);
  });

  it("will not compare with, or list, a group that is too small", async () => {
    const peers = await loadPeers(db);
    const itMe = peers.find((p) => p.id === "S-IT0");
    const t = buildCoachTools({ me: itMe, full: null, peers, prediction: null }, []);
    expect(await t.my_standing.execute({ group: "class" }, {})).toMatchObject({
      error: expect.stringMatching(/too few/),
    });
    expect(
      await t.students_ahead.execute({ group: "class", metric: "score", limit: 3 }, {}),
    ).toMatchObject({
      error: expect.stringMatching(/only for groups of 10 or more/),
    });
  });

  it("gives a ranked plan with the points each step would add", async () => {
    const full = {
      subjects: [],
      skills: skills(50),
      lms: [],
      engagement: [],
      semesterGrades: [],
      backlogs: 0,
      cgpa: 6,
      resumeCompleteness: 50,
      assessmentsCompleted: 0,
      assessmentsRequired: 0,
      mockInterviews: 0,
    };
    const peers = await loadPeers(db);
    const t = buildCoachTools(
      { me: peers.find((p) => p.id === "S-3"), full, peers, prediction: null },
      [],
    );
    const plan = await t.improvement_plan.execute({}, {});
    expect(plan.items.length).toBeGreaterThan(0);
    const gains = plan.items.map((i) => i.gain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains); // biggest gain first
    expect(plan.items[0].advice).toMatch(/\d/);
  });
});

describe("asking the coach", () => {
  it("answers from the tools the model called, and returns the tables it used", async () => {
    let seen;
    const generate = async (args) => {
      seen = args;
      const r = await args.tools.my_standing.execute({ group: "class" }, {});
      return { text: `You rank ${r.measures[0].rank} of ${r.size} in your class. [E1]` };
    };
    const out = await askCoach(db, me, { question: "How do I compare with my class?" }, TODAY, {
      chain: [{ name: "test", apiKey: "k", baseURL: "http://localhost", model: "m" }],
      generate,
    });
    expect(out.answer).toContain("rank 9 of 12");
    expect(out.evidence[0]).toMatchObject({ id: "E1", cited: true });
    expect(out.note).toBeNull();
    // the model is told never to reveal anyone, and is given only its own tools
    expect(seen.instructions).toMatch(/never know, guess or reveal a name/);
    expect(Object.keys(seen.tools).sort()).toEqual([
      "compare_on_measure",
      "improvement_plan",
      "my_predictions",
      "my_standing",
      "students_ahead",
    ]);
    expect(JSON.stringify(out)).not.toMatch(
      new RegExp(NAMES.filter((n) => n !== "Deepak").join("|")),
    );
  });

  it("falls back to a plain summary and plan when no model is configured", async () => {
    const out = await askCoach(db, me, { question: "Where do I rank?" }, TODAY, { chain: [] });
    expect(out.note).toMatch(/not set up/);
    expect(out.answer).toMatch(/rank \*\*9 of 12\*\*/);
    expect(out.answer).toMatch(/Recommended actions/);
    expect(out.evidence.map((e) => e.tool)).toEqual(["my_standing", "improvement_plan"]);
  });

  it("falls back, with the reason, when the model fails", async () => {
    const generate = async () => {
      const e = new Error("quota");
      e.statusCode = 429;
      throw e;
    };
    const out = await askCoach(db, me, { question: "Where do I rank?" }, TODAY, {
      chain: [{ name: "test", apiKey: "k", baseURL: "http://localhost", model: "m" }],
      generate,
    });
    expect(out.note).toMatch(/usage limit/);
    expect(out.answer).toMatch(/9 of 12/);
  });

  it("is only for a student with a linked record", async () => {
    const teacher = await addUser(db, "t2@x.edu", "Teacher Two", ["faculty"]);
    await expect(
      askCoach(db, teacher, { question: "Where do I rank?" }, TODAY, { chain: [] }),
    ).rejects.toThrow(/record is linked/);
  });

  it("suggests questions from the student's own situation", async () => {
    const s = await coachSuggestions(db, me);
    expect(s).toMatchObject({ students: 14, group: expect.stringMatching(/class/) });
    expect(s.list.length).toBeGreaterThanOrEqual(4);
  });
});

describe("my ranking", () => {
  it("gives the position in the class and the university from the current records", async () => {
    const { myRanking } = await import("@/backend/student-coach.server");
    const r = await myRanking(db, me);
    const by = Object.fromEntries(r.groups.map((g) => [g.key, g]));
    expect(by.class).toMatchObject({
      rank: 9,
      of: 12,
      detail: "CSE · Semester 3",
      available: true,
    });
    expect(by.university.of).toBe(14);
    expect(r.students).toBe(14);
    expect(r.measures.find((m) => m.key === "attendance").class).toMatchObject({ of: 12 });
    expect(JSON.stringify(r)).not.toMatch(/Asha|Bhanu|Chitra|S-\d/); // nobody is named
  });

  it("follows a change in the student's own record at once, though the cohort is cached", async () => {
    const { myRanking } = await import("@/backend/student-coach.server");
    await myRanking(db, me); // fills the cache
    // the student's marks, attendance and skills jump
    await db.query(
      `UPDATE student_records SET record = jsonb_set(jsonb_set(jsonb_set(record, '{cgpa}', '9.9'),
         '{skills}', '{"coding":100,"aptitude":100,"analytical":100,"verbal":100,"communication":100}'),
         '{subjects}', '[{"subject":"Maths","marks":99,"classesHeld":40,"classesAttended":40},{"subject":"Physics","marks":99,"classesHeld":40,"classesAttended":40}]')
       WHERE owner_id = $1`,
      [me.id],
    );
    const r = await myRanking(db, me);
    expect(r.groups.find((g) => g.key === "class").rank).toBeLessThan(9);
  });
});
