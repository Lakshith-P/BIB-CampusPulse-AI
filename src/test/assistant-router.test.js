import { describe, expect, it } from "vitest";

import { answerFromData } from "@/lib/assistant-fallback";
import { contextOf, filtersOf, namedStudents, planLookups } from "@/lib/assistant-router";

const roster = [
  { id: "SYN-CSE-001", name: "Asha Rao", branch: "CSE" },
  { id: "SYN-ECE-002", name: "Ravi Kumar", branch: "ECE" },
];
const branches = ["CSE", "ECE", "IT", "MECH"];
const tools = (plan) => plan.map((p) => p.tool);
const student = (text, history = []) => tools(planLookups({ role: "student", text, history }));
const staff = (text, role = "faculty", history = []) =>
  planLookups({ role, text, history, roster, branches });

describe("what a student's question looks up", () => {
  it.each([
    ["How am I doing overall?", ["my_overview"]],
    ["Which subject needs my attention first?", ["my_subjects"]],
    ["How many classes must I attend to reach 75%?", ["my_subjects"]],
    [
      "What is my predicted placement score and what would improve it?",
      ["my_placement", "my_predictions"],
    ],
    ["Are there any pending assignments or deadlines?", ["my_attention"]],
    ["Has my mentor created any support actions?", ["my_support"]],
  ])("%s", (question, expected) => {
    expect(student(question)).toEqual(expect.arrayContaining(expected));
  });

  it("never asks for more than three lookups, and always asks for something", () => {
    expect(
      student("placement attendance marks predictions assignments mentor overall").length,
    ).toBeLessThanOrEqual(3);
    expect(student("hmm").length).toBeGreaterThan(0);
  });

  it("reads a short follow-up with the question before it", () => {
    const history = [{ role: "user", text: "How many classes must I attend to reach 75%?" }];
    expect(student("and for coding?", history)).toContain("my_subjects");
    expect(contextOf("a brand new and very different long question about cgpa", history)).toBe(
      "a brand new and very different long question about cgpa",
    );
  });

  it("has no lookups for a visitor", () => {
    expect(planLookups({ role: "visitor", text: "What are my marks?" })).toEqual([]);
  });
});

describe("what a teacher or administrator question looks up", () => {
  it("finds students needing attention, low attendance, and named students", () => {
    expect(tools(staff("Which of my students need attention first?"))).toContain("find_students");
    expect(staff("Who has attendance below 75%?")[0]).toMatchObject({
      tool: "find_students",
      input: { lowAttendance: true },
    });
    expect(staff("Tell me about Asha Rao")[0]).toEqual({
      tool: "student_detail",
      input: { student: "SYN-CSE-001" },
    });
    expect(staff("how is SYN-ECE-002 doing")[0].input.student).toBe("SYN-ECE-002");
  });

  it("finds students with a good CGPA but weak placement readiness", () => {
    const plan = staff("Show me students who have good CGPA but low employability scores");
    expect(
      plan.filter((p) => p.tool === "find_students").map((p) => p.input.placementRisk),
    ).toEqual(["High", "Medium"]);
    expect(plan[0].input.minCgpa).toBe(7.5);
    expect(staff("students with cgpa above 8 but weak placement")[0].input.minCgpa).toBe(8);
  });

  it("answers overdue follow-ups, predicted risk and department questions", () => {
    expect(staff("What are my overdue follow-ups?")[0]).toMatchObject({
      tool: "support_actions",
      input: { overdueOnly: true },
    });
    expect(staff("Who are the 3 highest predicted-risk students?", "admin")[0]).toMatchObject({
      tool: "predicted_risk",
      input: { limit: 3 },
    });
    expect(tools(staff("Which department has the most at-risk students?", "admin"))).toContain(
      "department_comparison",
    );
    expect(tools(staff("Which teachers have the heaviest at-risk load?", "admin"))).toContain(
      "teacher_workload",
    );
  });

  it("gives teachers no campus-wide lookups", () => {
    expect(tools(staff("Compare departments by attendance", "faculty"))).not.toContain(
      "department_comparison",
    );
    expect(tools(staff("teacher workload", "faculty"))).not.toContain("teacher_workload");
  });

  it("takes the branch and year out of the question", () => {
    expect(filtersOf("at-risk students in ECE year 3", branches)).toEqual({
      branch: "ECE",
      year: 3,
    });
    expect(filtersOf("second year IT", branches)).toEqual({ branch: "IT", year: 2 });
    expect(filtersOf("everyone", branches)).toEqual({});
    expect(
      staff("Who is at risk in CSE?").find((p) => p.tool === "find_students").input.branch,
    ).toBe("CSE");
  });

  it("recognises students by name or ID only from the roster it was given", () => {
    expect(namedStudents("ravi kumar and asha rao", roster).map((s) => s.id)).toEqual([
      "SYN-CSE-001",
      "SYN-ECE-002",
    ]);
    expect(namedStudents("tell me about Mira Nair", roster)).toEqual([]);
  });

  it("falls back to an overview plus the students who need attention", () => {
    expect(tools(staff("hello there"))).toEqual(["class_overview", "find_students"]);
  });
});

describe("answers written straight from the data", () => {
  it("states the real numbers for a student", () => {
    const text = answerFromData([
      {
        tool: "my_subjects",
        output: {
          subjects: [
            { subject: "Maths", marks: 35, attendance: 60, classesNeededToReach75: 24 },
            { subject: "Coding", marks: 82, attendance: 95, classesNeededToReach75: 0 },
          ],
        },
      },
    ]);
    expect(text).toContain("Maths (35)");
    expect(text).toContain("Maths (60%, attend the next 24 classes)");
    expect(text).not.toContain("Coding (95");
  });

  it("lists students for a teacher and compares departments for an administrator", () => {
    const list = answerFromData([
      {
        tool: "find_students",
        output: {
          totalMatching: 1,
          students: [
            {
              id: "S1",
              name: "Asha",
              branch: "CSE",
              successScore: 52,
              band: "Needs Attention",
              cgpa: 6.1,
              attendance: 77.5,
              subjectsBelow75Attendance: ["Maths"],
              backlogs: 1,
            },
          ],
        },
      },
    ]);
    expect(list).toContain("Asha (S1, CSE)");
    expect(list).toContain("under 75% in Maths");
    const departments = answerFromData([
      {
        tool: "department_comparison",
        output: {
          departments: [
            {
              branch: "CSE",
              students: 40,
              averageSuccessScore: 71,
              averageCgpa: 7.4,
              averageAttendance: 82,
              atRisk: 9,
              predictedHighRisk: 12,
            },
          ],
        },
      },
    ]);
    expect(departments).toContain("CSE: 40 students");
    expect(departments).toContain("9 at risk");
  });

  it("passes on a lookup error and copes with nothing", () => {
    expect(
      answerFromData([
        {
          tool: "my_overview",
          output: { error: "No student record is linked to this account yet." },
        },
      ]),
    ).toContain("No student record");
    expect(answerFromData([])).toContain("could not find");
    expect(answerFromData([{ tool: "find_students", error: "boom" }])).toContain("could not find");
  });
});

describe("follow-ups and unrelated questions", () => {
  const history = [{ role: "user", text: "Show me the marks of my weakest subject" }];

  it("does not borrow the earlier question for a new, unrelated one", () => {
    expect(contextOf("What is the capital of France?", history)).toBe(
      "What is the capital of France?",
    );
    expect(student("What is the capital of France?", history)).toEqual(["my_overview"]);
  });

  it("does borrow it for a real follow-up", () => {
    expect(contextOf("and what about attendance there?", history)).toContain("weakest subject");
    expect(contextOf("why?", history)).toContain("weakest subject");
  });

  it("answers which-subject questions from marks, not only from assignments", () => {
    const plan = student("Which subject needs my attention first?");
    expect(plan).toContain("my_subjects");
    expect(plan).not.toContain("my_attention");
  });

  it("only counts predicted-high-risk students in the department comparison when asked", () => {
    expect(staff("Which department has the most at-risk students?", "admin")[0]).toEqual({
      tool: "department_comparison",
      input: {},
    });
    expect(staff("Compare departments by predicted risk", "admin")[0].input).toEqual({
      includePredictions: true,
    });
  });
});
