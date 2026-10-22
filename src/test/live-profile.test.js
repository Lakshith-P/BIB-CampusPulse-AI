import { describe, expect, it } from "vitest";

import { liveAssignments, liveNotifications } from "@/lib/live-profile";
import { emptyStudent } from "@/lib/student-defaults";
import { studentSchema } from "@/lib/student-validation";

const TODAY = "2026-10-10";
const withAssignments = (deadlines) => ({
  ...emptyStudent,
  id: "T1",
  name: "Test",
  lms: [
    {
      subject: "Maths",
      units: deadlines.map((deadline, i) => ({
        unit: i + 1,
        title: `Unit ${i + 1}: Topic`,
        lessons: [],
        assignment: { title: `Assignment ${i + 1}`, deadline, submitted: false, marks: null },
      })),
    },
  ],
});

describe("blank student record", () => {
  it("passes the record schema", () => {
    expect(studentSchema.safeParse({ ...emptyStudent, id: "A", name: "A" }).success).toBe(true);
  });

  it("only reports that data is missing, and invents no alerts", () => {
    const notes = liveNotifications({ ...emptyStudent, id: "A", name: "A" }, TODAY);
    expect(notes).toHaveLength(1);
    expect(notes[0].tone).toBe("info");
    expect(notes[0].text).toContain("marks and attendance");
  });
});

describe("assignments use real deadlines and the real date", () => {
  it("sorts by soonest deadline and counts days from the given date", () => {
    const list = liveAssignments(
      withAssignments(["2026-10-20", "2026-10-11", "2026-10-05"]),
      TODAY,
    );
    expect(list.map((a) => a.daysLeft)).toEqual([-5, 1, 10]);
  });

  it("flags overdue and closing-soon work, but not distant deadlines", () => {
    const notes = liveNotifications(
      withAssignments(["2026-10-05", "2026-10-12", "2026-11-30"]),
      TODAY,
    );
    const texts = notes.filter((n) => n.area === "Assignment").map((n) => n.text);
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => t.includes("was due 5 day(s) ago"))).toBe(true);
    expect(texts.some((t) => t.includes("closes in 2 day(s)"))).toBe(true);
  });

  it("tolerates a missing or invalid deadline", () => {
    const list = liveAssignments(withAssignments(["", "not a date"]), TODAY);
    expect(list.every((a) => a.daysLeft === null)).toBe(true);
    expect(
      liveNotifications(withAssignments(["", "not a date"]), TODAY).some(
        (n) => n.area === "Assignment",
      ),
    ).toBe(false);
  });
});

describe("alerts from recorded data", () => {
  it("raises academic and skill alerts only for real values", () => {
    const s = {
      ...emptyStudent,
      id: "B",
      name: "B",
      backlogs: 2,
      subjects: [{ subject: "Physics", marks: 45, classesHeld: 40, classesAttended: 40 }],
      skills: { ...emptyStudent.skills, aptitude: 40 },
    };
    const areas = liveNotifications(s, TODAY).map((n) => n.area);
    expect(areas).toEqual(expect.arrayContaining(["Academics", "Skills"]));
    const unknownSkill = liveNotifications({ ...s, skills: emptyStudent.skills }, TODAY);
    expect(unknownSkill.some((n) => n.area === "Skills")).toBe(false);
  });
});
