// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb, recordOf } from "./harness";
import * as lms from "@/backend/lms.server";
import * as feedback from "@/backend/feedback.server";
import * as placement from "@/backend/placement.server";
import * as engagement from "@/backend/engagement.server";
import * as skills from "@/backend/skills.server";
import * as notifications from "@/backend/notifications.server";

const TODAY = "2026-10-21";
const subject = (name, held, attended, marks = 70) => ({
  subject: name,
  marks,
  classesHeld: held,
  classesAttended: attended,
});
const pdf = (text = "hello") => ({
  name: "notes.pdf",
  type: "application/pdf",
  base64: Buffer.from(text).toString("base64"),
});

let ctx;
let db;
let admin, teacher, otherTeacher, ann, ben, cara;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  teacher = await addUser(db, "t1@x.edu", "Teacher One", ["faculty"]);
  otherTeacher = await addUser(db, "t2@x.edu", "Teacher Two", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  cara = await addUser(db, "cara@x.edu", "Cara");
  await addStudent(db, "S-ANN", ann, teacher, {
    cgpa: 8.5,
    semester: 5,
    subjects: [subject("Maths", 40, 28), subject("Physics", 40, 38)],
  });
  await addStudent(db, "S-BEN", ben, teacher, {
    cgpa: 6,
    backlogs: 2,
    subjects: [subject("Maths", 40, 36)],
  });
  await addStudent(db, "S-CARA", cara, otherTeacher, {
    cgpa: 9,
    subjects: [subject("Chemistry", 40, 39)],
  });
}, 60_000);

afterAll(() => ctx?.close());

describe("LMS content, submissions and the score record", () => {
  let materialId, fileMaterialId, assignmentId, submissionId;

  it("lets a teacher shape units, add materials and an assignment for their own subject", async () => {
    await lms.saveUnit(db, teacher, {
      subject: "Maths",
      unit: 1,
      title: "Limits",
      topics: "epsilon-delta",
    });
    const link = await lms.addMaterial(db, teacher, {
      subject: "Maths",
      unit: 1,
      kind: "video",
      title: "Limits intro",
      description: "",
      url: "https://example.com/v",
    });
    materialId = link.id;
    const file = await lms.addMaterial(db, teacher, {
      subject: "Maths",
      unit: 1,
      kind: "file",
      title: "Notes",
      description: "",
      url: "",
      file: pdf("unit one"),
    });
    fileMaterialId = file.id;
    const a = await lms.saveAssignment(db, teacher, {
      subject: "Maths",
      unit: 1,
      title: "Limits sheet",
      instructions: "Solve all",
      dueOn: "2026-10-23",
      maxMarks: 10,
    });
    assignmentId = a.id;
    const data = await lms.loadLms(db, teacher);
    const maths = data.subjects.find((s) => s.subject === "Maths");
    expect(maths.units).toHaveLength(6);
    expect(maths.units[0].materials).toHaveLength(2);
    expect(maths.units[0].assignment.title).toBe("Limits sheet");
  });

  it("refuses a teacher managing a subject none of their students take", async () => {
    await expect(
      lms.addMaterial(db, teacher, {
        subject: "Chemistry",
        unit: 1,
        kind: "link",
        title: "x",
        description: "",
        url: "https://e.com",
      }),
    ).rejects.toThrow(/assigned to you/);
    await expect(
      lms.addMaterial(db, otherTeacher, {
        subject: "Maths",
        unit: 1,
        kind: "link",
        title: "x",
        description: "",
        url: "https://e.com",
      }),
    ).rejects.toThrow();
  });

  it("rejects dangerous or oversized uploads", async () => {
    const bad = {
      name: "x.html",
      type: "text/html",
      base64: Buffer.from("<script>").toString("base64"),
    };
    await expect(
      lms.addMaterial(db, teacher, {
        subject: "Maths",
        unit: 2,
        kind: "file",
        title: "h",
        description: "",
        url: "",
        file: bad,
      }),
    ).rejects.toThrow(/not allowed/);
    const big = {
      name: "b.pdf",
      type: "application/pdf",
      base64: Buffer.alloc(3 * 1024 * 1024 + 10).toString("base64"),
    };
    await expect(
      lms.addMaterial(db, teacher, {
        subject: "Maths",
        unit: 2,
        kind: "file",
        title: "b",
        description: "",
        url: "",
        file: big,
      }),
    ).rejects.toThrow(/3 MB/);
  });

  it("shows a student only their own subjects, and feeds completion into the record", async () => {
    const seen = await lms.loadLms(db, ann);
    expect(seen.subjects.map((s) => s.subject).sort()).toEqual(["Maths", "Physics"]);
    await lms.setLessonDone(db, ann, { materialId, done: true });
    const rec = await recordOf(db, "S-ANN");
    const maths = rec.lms.find((l) => l.subject === "Maths");
    expect(maths.units[0].lessons.filter((l) => l.completed)).toHaveLength(1);
    expect(maths.units[0].assignment).toMatchObject({
      title: "Limits sheet",
      submitted: false,
      deadline: "2026-10-23",
    });
    const caraSees = await lms.loadLms(db, cara);
    expect(caraSees.subjects.map((s) => s.subject)).toEqual(["Chemistry"]);
  });

  it("downloads files only for people who take the subject", async () => {
    const got = await lms.downloadFile(db, ann, { kind: "material", id: fileMaterialId });
    expect(Buffer.from(got.base64, "base64").toString()).toBe("unit one");
    await expect(
      lms.downloadFile(db, cara, { kind: "material", id: fileMaterialId }),
    ).rejects.toThrow();
    await expect(lms.setLessonDone(db, cara, { materialId, done: true })).rejects.toThrow(
      /not part of your subjects/,
    );
  });

  it("accepts a submission, lets the right teacher grade it, and updates the record", async () => {
    await lms.submitAssignment(db, ann, { assignmentId, answer: "my answer", file: pdf("work") });
    await expect(lms.submitAssignment(db, cara, { assignmentId, answer: "x" })).rejects.toThrow();
    let rec = await recordOf(db, "S-ANN");
    expect(rec.lms.find((l) => l.subject === "Maths").units[0].assignment.submitted).toBe(true);

    const list = await lms.listSubmissions(db, teacher, { assignmentId });
    const row = list.students.find((s) => s.student_id === "S-ANN");
    submissionId = row.submission_id;
    expect(list.students.map((s) => s.student_id).sort()).toEqual(["S-ANN", "S-BEN"]);
    expect(list.students.find((s) => s.student_id === "S-BEN").submission_id).toBeNull();

    await expect(
      lms.gradeSubmission(db, otherTeacher, { submissionId, marks: 8, remarks: "" }),
    ).rejects.toThrow();
    await expect(
      lms.gradeSubmission(db, teacher, { submissionId, marks: 11, remarks: "" }),
    ).rejects.toThrow(/between 0 and 10/);
    await lms.gradeSubmission(db, teacher, { submissionId, marks: 8, remarks: "Good work" });
    rec = await recordOf(db, "S-ANN");
    expect(rec.lms.find((l) => l.subject === "Maths").units[0].assignment.marks).toBe(8);

    const mine = await lms.loadLms(db, ann);
    const sub = mine.subjects.find((s) => s.subject === "Maths").units[0].assignment.submission;
    expect(sub).toMatchObject({ remarks: "Good work" });
    await expect(lms.submitAssignment(db, ann, { assignmentId, answer: "change" })).rejects.toThrow(
      /graded/,
    );
    const teacherFile = await lms.downloadFile(db, teacher, {
      kind: "submission",
      id: submissionId,
    });
    expect(teacherFile.name).toBe("notes.pdf");
    await expect(
      lms.downloadFile(db, otherTeacher, { kind: "submission", id: submissionId }),
    ).rejects.toThrow();
  });

  it("notifies the student about the new assignment and the grade", async () => {
    const { items } = await notifications.listNotifications(db, ann);
    const titles = items.map((n) => n.title);
    expect(titles.some((t) => t.startsWith("New assignment: Limits sheet"))).toBe(true);
    expect(titles.some((t) => t.includes("was graded"))).toBe(true);
  });

  it("counts real sign-ins as login frequency", async () => {
    await db.query("INSERT INTO login_events(user_id) VALUES($1),($1),($1)", [ann.id]);
    const a = await lms.loginActivity(db, ann.id);
    expect(a.week).toBe(3);
    expect(a.perWeek).toBeGreaterThan(0);
  });
});

describe("the syllabus of a subject", () => {
  const header = {
    subject: "Maths",
    code: "MTH101",
    title: "Engineering Mathematics I",
    lectures: 3,
    tutorials: 1,
    practicals: 0,
    credits: 4,
    outcomes: "apply differentiation\nsolve linear systems",
    textbooks: "HIGHER ENGINEERING MATHEMATICS by B. S. GREWAL",
    references: "ADVANCED ENGINEERING MATHEMATICS by ERWIN KREYSZIG",
    session: "2026-27",
  };

  it("is published by the teacher of the subject and read by their students", async () => {
    await lms.saveSyllabus(db, teacher, header);
    const mine = await lms.loadLms(db, ann);
    const maths = mine.subjects.find((x) => x.subject === "Maths");
    expect(maths.syllabus).toMatchObject({
      code: "MTH101",
      title: "Engineering Mathematics I",
      credits: 4,
      session: "2026-27",
    });
    expect(maths.syllabus.references).toContain("KREYSZIG");
  });

  it("is refused for a subject the teacher does not teach, and is updated in place", async () => {
    await expect(
      lms.saveSyllabus(db, otherTeacher, { ...header, subject: "Maths" }),
    ).rejects.toThrow(/only manage subjects/);
    await lms.saveSyllabus(db, teacher, { ...header, credits: 3, code: "MTH102" });
    const rows = await db.query("SELECT code, credits FROM lms_syllabus WHERE subject = 'Maths'");
    expect(rows.rows).toEqual([{ code: "MTH102", credits: 3 }]);
  });
});

describe("teacher review per subject", () => {
  it("takes one review per subject, lets the student revise it and shows staff the averages", async () => {
    await feedback.submitSubjectReview(db, ann, {
      subject: "Maths",
      teaching: 4,
      clarity: 3,
      support: 4,
      pace: 3,
      comment: "More worked examples please",
    });
    await feedback.submitSubjectReview(db, ben, {
      subject: "Maths",
      teaching: 2,
      clarity: 2,
      support: 3,
      pace: 1,
      comment: "",
    });
    // The same student reviewing again replaces their earlier review instead of adding one.
    await feedback.submitSubjectReview(db, ann, {
      subject: "Maths",
      teaching: 5,
      clarity: 5,
      support: 5,
      pace: 5,
      comment: "Much better now",
    });
    const mine = await feedback.listMySubjectReviews(db, ann);
    expect(mine.subjects).toContain("Physics");
    expect(mine.reviews).toHaveLength(1);
    expect(mine.reviews[0]).toMatchObject({ subject: "Maths", average: 5 });

    const summary = await feedback.subjectReviewSummary(db, teacher);
    const maths = summary.find((r) => r.subject === "Maths");
    expect(maths).toMatchObject({ reviews: 2, teaching: 3.5, pace: 3 });
    const physics = summary.find((r) => r.subject === "Physics");
    expect(physics).toMatchObject({ reviews: 0, average: null });
  });

  it("refuses a subject the student does not take, and is staff-only to summarize", async () => {
    await expect(
      feedback.submitSubjectReview(db, ann, {
        subject: "Chemistry",
        teaching: 1,
        clarity: 1,
        support: 1,
        pace: 1,
        comment: "",
      }),
    ).rejects.toThrow(/not one of yours/);
    await expect(feedback.subjectReviewSummary(db, ann)).rejects.toThrow();
  });
});

describe("confidential complaints and satisfaction", () => {
  it("keeps complaint content to the author and administrators", async () => {
    const { id } = await feedback.submitComplaint(db, ann, {
      category: "faculty",
      subject: "Unfair marking",
      body: "SECRET-DETAILS",
    });
    await expect(feedback.listAllComplaints(db, teacher)).rejects.toThrow(/administrators/);
    expect(JSON.stringify(await feedback.listMyComplaints(db, ben))).not.toContain("SECRET");
    const all = await feedback.listAllComplaints(db, admin);
    expect(all.find((c) => c.id === id).body).toBe("SECRET-DETAILS");

    const adminNotes = await notifications.listNotifications(db, admin);
    const note = adminNotes.items.find((n) => n.area === "Complaint");
    expect(note).toBeTruthy();
    expect(JSON.stringify(note)).not.toContain("SECRET");
    expect(JSON.stringify(note)).not.toContain("Unfair");

    await expect(
      feedback.respondToComplaint(db, teacher, { id, status: "resolved", response: "x" }),
    ).rejects.toThrow();
    await feedback.respondToComplaint(db, admin, {
      id,
      status: "resolved",
      response: "We looked into it.",
    });
    const mine = await feedback.listMyComplaints(db, ann);
    expect(mine[0]).toMatchObject({ status: "resolved", response: "We looked into it." });
    const annNotes = await notifications.listNotifications(db, ann);
    expect(annNotes.items.some((n) => n.title === "Your complaint has an update")).toBe(true);
  });

  it("stores ratings, limits them to one a week, and updates the student's record", async () => {
    await feedback.submitRating(db, ann, {
      teaching: 5,
      content: 4,
      support: 4,
      facilities: 3,
      comment: "",
    });
    await expect(
      feedback.submitRating(db, ann, {
        teaching: 1,
        content: 1,
        support: 1,
        facilities: 1,
        comment: "",
      }),
    ).rejects.toThrow(/this week/);
    expect((await recordOf(db, "S-ANN")).satisfaction).toBe(4);
  });
});

describe("placement drives with eligibility", () => {
  let driveId;
  it("lets a teacher post a drive with criteria and notifies only eligible students", async () => {
    const r = await placement.saveDrive(
      db,
      teacher,
      {
        company: "Acme",
        roleTitle: "SDE",
        description: "",
        package: "8 LPA",
        driveDate: "2026-11-10",
        deadline: "2026-10-30",
        minCgpa: 8,
        maxBacklogs: 0,
        branches: ["CSE"],
        gradYear: 2027,
        requiresAssessment: false,
        link: "",
      },
      TODAY,
    );
    driveId = r.id;
    const annNotes = await notifications.listNotifications(db, ann);
    const benNotes = await notifications.listNotifications(db, ben);
    expect(annNotes.items.some((n) => n.title.startsWith("New drive: Acme"))).toBe(true);
    expect(benNotes.items.some((n) => n.title.startsWith("New drive: Acme"))).toBe(false);
  });

  it("evaluates eligibility per student and enforces it when applying", async () => {
    const annView = (await placement.listDrives(db, ann, TODAY))[0];
    expect(annView.eligibility.eligible).toBe(true);
    const benView = (await placement.listDrives(db, ben, TODAY))[0];
    expect(benView.eligibility.eligible).toBe(false);
    expect(benView.eligibility.criteria.filter((c) => c.result === "Fail").length).toBeGreaterThan(
      0,
    );

    await expect(placement.applyToDrive(db, ben, { driveId }, TODAY)).rejects.toThrow(
      /Not eligible/,
    );
    await placement.applyToDrive(db, ann, { driveId }, TODAY);
    expect((await placement.listDrives(db, ann, TODAY))[0].application).toBe("applied");
    await expect(placement.applyToDrive(db, ann, { driveId }, "2026-11-05")).rejects.toThrow(
      /deadline/,
    );
  });

  it("treats unknown data as unknown, never as a pass", async () => {
    const dara = await addUser(db, "dara@x.edu", "Dara");
    await addStudent(db, "S-DARA", dara, teacher, { cgpa: 0 });
    const view = (await placement.listDrives(db, dara, TODAY))[0];
    expect(view.eligibility.eligible).toBe(false);
    expect(view.eligibility.criteria.some((c) => c.result === "Unknown")).toBe(true);
  });

  it("lets teachers track only their own applicants and move them through stages", async () => {
    const own = await placement.listApplicants(db, teacher, { driveId });
    expect(own.map((a) => a.student_id)).toEqual(["S-ANN"]);
    expect(await placement.listApplicants(db, otherTeacher, { driveId })).toEqual([]);
    await expect(
      placement.setApplicationStatus(db, otherTeacher, {
        driveId,
        studentId: "S-ANN",
        status: "selected",
      }),
    ).rejects.toThrow();
    await placement.setApplicationStatus(db, teacher, {
      driveId,
      studentId: "S-ANN",
      status: "shortlisted",
    });
    expect((await placement.listDrives(db, ann, TODAY))[0].application).toBe("shortlisted");
  });

  it("records mock interviews and keeps the count on the record", async () => {
    await placement.addMockInterview(db, teacher, {
      studentId: "S-ANN",
      date: "2026-10-15",
      interviewer: "Panel",
      score: 72,
      feedback: "Clear answers",
    });
    expect((await recordOf(db, "S-ANN")).mockInterviews).toBe(1);
    await expect(
      placement.addMockInterview(db, otherTeacher, {
        studentId: "S-ANN",
        date: "2026-10-15",
        interviewer: "",
        score: 50,
        feedback: "",
      }),
    ).rejects.toThrow();
    const list = await placement.listMockInterviews(db, ann, {});
    expect(list).toHaveLength(1);
  });
});

describe("engagement opportunities and verification", () => {
  it("counts an activity toward the score only once a teacher verifies it", async () => {
    const { id } = await engagement.saveOpportunity(
      db,
      teacher,
      {
        type: "hackathon",
        title: "CodeFest",
        purpose: "Build",
        benefits: "",
        requirements: "",
        eligibility: "",
        howToApply: "Register",
        deadline: "2026-12-01",
        link: "",
      },
      TODAY,
    );
    await engagement.setParticipation(db, ann, {
      opportunityId: id,
      status: "completed",
      evidence: "certificate.pdf",
    });
    expect((await recordOf(db, "S-ANN")).engagement ?? []).toHaveLength(0);

    await expect(
      engagement.verifyParticipation(
        db,
        otherTeacher,
        { opportunityId: id, studentId: "S-ANN", verified: true },
        TODAY,
      ),
    ).rejects.toThrow();
    await engagement.verifyParticipation(
      db,
      teacher,
      { opportunityId: id, studentId: "S-ANN", verified: true },
      TODAY,
    );
    let rec = await recordOf(db, "S-ANN");
    expect(rec.engagement).toEqual([
      expect.objectContaining({ type: "hackathon", name: "CodeFest", verified: true }),
    ]);
    expect(rec.hasEngagementData).toBe(true);

    await engagement.setParticipation(db, ann, {
      opportunityId: id,
      status: "participating",
      evidence: "",
    });
    rec = await recordOf(db, "S-ANN");
    expect(rec.engagement).toHaveLength(0);
    await expect(
      engagement.verifyParticipation(
        db,
        teacher,
        { opportunityId: id, studentId: "S-ANN", verified: true },
        TODAY,
      ),
    ).rejects.toThrow(/completed/);
  });

  it("shows students their own status and teachers participant counts", async () => {
    const mine = await engagement.listOpportunities(db, ann, TODAY);
    expect(mine[0].participation.status).toBe("participating");
    const staff = await engagement.listOpportunities(db, teacher, TODAY);
    expect(staff[0].stats.participants).toBe(1);
  });
});

describe("skill assessments", () => {
  it("keeps record.skills equal to the mean of the latest three scores", async () => {
    for (const [score, day] of [
      [40, "01"],
      [60, "02"],
      [80, "03"],
      [90, "04"],
    ])
      await skills.recordAssessment(db, teacher, {
        studentId: "S-ANN",
        category: "coding",
        topic: "Arrays",
        score,
        takenOn: `2026-10-${day}`,
      });
    expect((await recordOf(db, "S-ANN")).skills.coding).toBe(77);
    await expect(
      skills.recordAssessment(db, otherTeacher, {
        studentId: "S-ANN",
        category: "coding",
        topic: "",
        score: 10,
        takenOn: TODAY,
      }),
    ).rejects.toThrow();
    const history = await skills.listAssessments(db, ann);
    expect(history).toHaveLength(4);
    const first = history[0];
    await skills.deleteAssessment(db, teacher, { id: history[3].id });
    expect((await recordOf(db, "S-ANN")).skills.coding).toBe(60);
    expect(first.topic).toBe("Arrays");
  });
});

describe("stored notifications from rules", () => {
  it("creates each alert once, however often rules run, and tracks read state", async () => {
    await notifications.syncNotifications(db, ann, TODAY);
    const first = await notifications.listNotifications(db, ann);
    expect(first.items.some((n) => n.area === "Attendance" && n.title.startsWith("Maths"))).toBe(
      true,
    );
    await notifications.syncNotifications(db, ann, TODAY);
    const second = await notifications.listNotifications(db, ann);
    expect(second.items).toHaveLength(first.items.length);

    const unread = second.unread;
    expect(unread).toBeGreaterThan(0);
    await notifications.setRead(db, ann, { ids: [second.items[0].id], read: true });
    expect((await notifications.listNotifications(db, ann)).unread).toBe(unread - 1);
    await notifications.setRead(db, ann, { ids: null, read: true });
    expect((await notifications.listNotifications(db, ann)).unread).toBe(0);
    await notifications.setRead(db, ann, { ids: [second.items[0].id], read: false });
    expect((await notifications.listNotifications(db, ann)).unread).toBe(1);
  });

  it("never shows one person's notifications to another", async () => {
    const caraNotes = await notifications.listNotifications(db, cara);
    expect(caraNotes.items.every((n) => !n.title.includes("Ann"))).toBe(true);
  });
});
