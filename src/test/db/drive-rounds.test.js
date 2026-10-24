// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as placement from "@/backend/placement.server";
import { currentRound, parseRounds, roundStates, statusFromRounds } from "@/lib/drive-rounds";

const TODAY = "2026-10-20";
const ROUNDS = ["Aptitude", "Technical interview", "HR interview"];

let ctx, db, teacher, other, ann, ben, driveId;
const pass = (round, studentId = "S-ANN", who = teacher, result = "passed") =>
  placement.setRoundResult(db, who, { driveId, studentId, round, result });
const view = async (user = ann) => (await placement.listDrives(db, user, TODAY))[0];

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  other = await addUser(db, "o@x.edu", "Other", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  await addStudent(db, "S-ANN", ann, teacher, { cgpa: 8 });
  await addStudent(db, "S-BEN", ben, teacher, { cgpa: 8 });
  driveId = (
    await placement.saveDrive(
      db,
      teacher,
      {
        company: "Acme",
        roleTitle: "SDE",
        description: "",
        package: "",
        driveDate: "",
        deadline: "2026-10-30",
        minCgpa: 0,
        maxBacklogs: 50,
        branches: [],
        gradYear: null,
        requiresAssessment: false,
        link: "",
        rounds: ROUNDS,
      },
      TODAY,
    )
  ).id;
  await placement.applyToDrive(db, ann, { driveId }, TODAY);
  await placement.applyToDrive(db, ben, { driveId }, TODAY);
}, 60_000);

afterAll(() => ctx?.close());

describe("round rules", () => {
  it("works out the stage from the rounds", () => {
    expect(statusFromRounds([], {})).toBeNull();
    expect(statusFromRounds(ROUNDS, {})).toBe("applied");
    expect(statusFromRounds(ROUNDS, { Aptitude: "passed" })).toBe("shortlisted");
    expect(statusFromRounds(ROUNDS, { Aptitude: "passed", "HR interview": "failed" })).toBe(
      "rejected",
    );
    expect(statusFromRounds(ROUNDS, Object.fromEntries(ROUNDS.map((r) => [r, "passed"])))).toBe(
      "selected",
    );
  });
  it("marks the next round as current and the rest as upcoming", () => {
    expect(roundStates(ROUNDS, { Aptitude: "passed" }).map((r) => r.state)).toEqual([
      "passed",
      "current",
      "upcoming",
    ]);
    // after a failed round nothing is current any more
    expect(currentRound(ROUNDS, { Aptitude: "failed" })).toBeNull();
    expect(currentRound(ROUNDS, {})).toBe("Aptitude");
  });
  it("reads a typed list of rounds, without blanks or repeats", () => {
    expect(parseRounds(" Aptitude, technical interview ,, APTITUDE\nHR ")).toEqual([
      "Aptitude",
      "technical interview",
      "HR",
    ]);
    expect(parseRounds("a,b,c,d,e,f,g,h,i,j")).toHaveLength(8);
  });
});

describe("rounds of a drive", () => {
  it("shows the student every round, with the first as current", async () => {
    const d = await view();
    expect(d.rounds).toEqual(ROUNDS);
    expect(d.roundStates.map((r) => r.state)).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("moves a student forward as the teacher passes rounds, in order", async () => {
    await expect(pass("Technical interview")).rejects.toThrow(/earlier rounds/);
    await pass("Aptitude");
    expect((await view()).application).toBe("shortlisted");
    expect((await view()).roundStates.map((r) => r.state)).toEqual([
      "passed",
      "current",
      "upcoming",
    ]);
    await pass("Technical interview");
    await pass("HR interview");
    expect((await view()).application).toBe("selected");
  });

  it("tells the student about each result", async () => {
    const { rows } = await db.query(
      "SELECT title, body FROM notifications WHERE user_id = $1 AND title LIKE 'Acme:%' ORDER BY created_at",
      [ann.id],
    );
    expect(rows.map((r) => r.title)).toEqual([
      "Acme: Aptitude passed",
      "Acme: Technical interview passed",
      "Acme: HR interview passed",
    ]);
    expect(rows.at(-1).body).toMatch(/selected/);
  });

  it("rejects a student who fails a round, and lets the teacher undo it", async () => {
    await pass("Aptitude", "S-BEN", teacher, "failed");
    const ben1 = await view(ben);
    expect(ben1.application).toBe("rejected");
    expect(ben1.roundStates.map((r) => r.state)).toEqual(["failed", "upcoming", "upcoming"]);
    await pass("Aptitude", "S-BEN", teacher, "pending");
    expect((await view(ben)).application).toBe("applied");
  });

  it("clearing a round also clears the rounds after it", async () => {
    await pass("Technical interview", "S-ANN", teacher, "pending");
    const d = await view();
    expect(d.application).toBe("shortlisted");
    expect(d.roundResults).toEqual({ Aptitude: "passed" });
  });

  it("keeps the permission rules: only the assigned teacher, only real rounds, only applicants", async () => {
    await expect(pass("Aptitude", "S-ANN", other)).rejects.toThrow();
    await expect(pass("Group discussion")).rejects.toThrow(/no such round/);
    const cara = await addUser(db, "cara@x.edu", "Cara");
    await addStudent(db, "S-CARA", cara, teacher, { cgpa: 8 });
    await expect(pass("Aptitude", "S-CARA")).rejects.toThrow(/not applied/);
  });

  it("lists the round results to the teacher", async () => {
    const list = await placement.listApplicants(db, teacher, { driveId });
    expect(list.find((a) => a.student_id === "S-ANN").round_results).toEqual({
      Aptitude: "passed",
    });
  });
});
