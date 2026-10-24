import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { limitByIp } from "@/backend/auth.server";
import { withTransaction } from "@/backend/db.server";
import { fileSchema } from "@/backend/files.server";
import * as lms from "@/backend/lms.server";
import * as aiLessons from "@/backend/ai-lessons.server";
import * as attendance from "@/backend/attendance.server";
import * as interview from "@/backend/interview.server";
import { TYPE_KEYS } from "@/lib/interview-prompt";
import * as chain from "@/backend/chain.server";
import * as feedback from "@/backend/feedback.server";
import * as placement from "@/backend/placement.server";
import * as results from "@/backend/results.server";
import * as engagement from "@/backend/engagement.server";
import * as skills from "@/backend/skills.server";
import * as notifications from "@/backend/notifications.server";
import * as messaging from "@/backend/messaging.server";
import * as agentPlans from "@/backend/agent-plans.server";
import * as predictions from "@/backend/predictions.server";
import * as mlModels from "@/backend/ml-models.server";

// Thin, authenticated wrappers. The permission checks live in the server modules, which run the
// SQL inside one transaction per request; nothing here trusts the browser about who the caller is.
const today = () => new Date().toISOString().slice(0, 10);
const run = (user, work) => withTransaction((db) => work(db, user));

const id = z.object({ id: z.string().uuid() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const text = (max, min = 0) => z.string().trim().min(min).max(max);
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Links must start with https://");

// ---------------------------------------------------------------- notifications
export const loadNotifications = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, async (db, user) => {
      await notifications.syncNotifications(db, user, today());
      return notifications.listNotifications(db, user);
    }),
  );
export const markNotifications = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ ids: z.array(z.string().uuid()).max(200).nullable(), read: z.boolean() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => notifications.setRead(db, user, data)),
  );

// ---------------------------------------------------------------- LMS
export const loadLms = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => lms.loadLms(db, user)));
export const saveLmsUnit = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      unit: z.number().int().min(1).max(6),
      title: text(120, 1),
      topics: text(1000),
    }),
  )
  .handler(({ data, context }) => run(context.user, (db, user) => lms.saveUnit(db, user, data)));
export const saveLmsSyllabus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      code: text(20),
      title: text(120),
      lectures: z.number().int().min(0).max(20),
      tutorials: z.number().int().min(0).max(20),
      practicals: z.number().int().min(0).max(20),
      credits: z.number().int().min(0).max(30),
      outcomes: text(4000),
      textbooks: text(3000),
      references: text(3000),
      session: text(20),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.saveSyllabus(db, user, data)),
  );
export const addLmsMaterial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      unit: z.number().int().min(1).max(6),
      kind: z.enum(["note", "video", "link", "file"]),
      title: text(150, 2),
      description: text(1000),
      url,
      file: fileSchema.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("lms-upload", 120, 60 * 60 * 1000);
    return run(context.user, (db, user) => lms.addMaterial(db, user, data));
  });
export const removeLmsMaterial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.deleteMaterial(db, user, data)),
  );
export const saveLmsAssignment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      unit: z.number().int().min(1).max(6),
      title: text(150, 2),
      instructions: text(2000),
      assignedOn: date.or(z.literal("")).optional(),
      dueOn: date,
      maxMarks: z.number().int().min(1).max(1000),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.saveAssignment(db, user, data)),
  );
export const removeLmsAssignment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.deleteAssignment(db, user, data)),
  );
export const loadSubmissions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ assignmentId: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.listSubmissions(db, user, data)),
  );
export const gradeLmsSubmission = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({ submissionId: z.string().uuid(), marks: z.number().min(0), remarks: text(1000) }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.gradeSubmission(db, user, data)),
  );
export const setLmsLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ materialId: z.string().uuid(), done: z.boolean() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.setLessonDone(db, user, data)),
  );
export const submitLmsAssignment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      assignmentId: z.string().uuid(),
      answer: text(5000),
      file: fileSchema.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("lms-submit", 60, 60 * 60 * 1000);
    return run(context.user, (db, user) => lms.submitAssignment(db, user, data));
  });
export const downloadLmsFile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ kind: z.enum(["material", "submission"]), id: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => lms.downloadFile(db, user, data)),
  );

// ---------------------------------------------------------------- personalised AI lessons
export const loadLearningProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => aiLessons.loadProfile(db, user)));
export const saveLearningProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      answers: z
        .array(
          z.object({
            questionId: z.string().max(10),
            optionIds: z.array(z.string().max(2)).min(1).max(4),
          }),
        )
        .length(20),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => aiLessons.saveProfile(db, user, data)),
  );
export const loadAiLessons = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => aiLessons.listLessons(db, user)));
export const loadAiLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => aiLessons.getLesson(db, user, data)),
  );
export const createAiLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      unit: z.number().int().min(1).max(6).optional(),
      topic: text(150, 3),
      focus: text(300),
      detailLevel: z.enum(["quick", "standard", "detailed"]),
      durationMin: z.number().int().min(2).max(12).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    // Each lesson is a paid model call, so keep generation well below the normal request limits.
    limitByIp("ai-lesson", 20, 60 * 60 * 1000);
    return run(context.user, (db, user) => aiLessons.createLesson(db, user, data));
  });
export const saveAiQuiz = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      score: z.number().int().min(0).max(20),
      total: z.number().int().min(1).max(20),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => aiLessons.recordQuiz(db, user, data)),
  );
export const removeAiLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => aiLessons.deleteLesson(db, user, data)),
  );

// ---------------------------------------------------------------- attendance and timetable
const period = z.number().int().min(1).max(10);
export const loadAttendanceRoster = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ subject: text(100, 1), date, period }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.loadRoster(db, user, data)),
  );
export const loadAttendanceSubjects = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => attendance.attendanceSubjects(db, user)),
  );
export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      date,
      period,
      marks: z.array(z.object({ studentId: text(60, 1), present: z.boolean() })).max(500),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.markAttendance(db, user, data, today())),
  );
export const loadRecentSessions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ subject: text(100, 1) }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.recentSessions(db, user, data)),
  );
export const loadTeacherSubjects = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => attendance.listTeacherSubjects(db, user)),
  );
export const saveTeacherSubjects = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ teacherId: z.string().uuid(), subjects: z.array(text(100, 1)).max(40) }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.setTeacherSubjects(db, user, data)),
  );
export const loadMyAttendance = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ subject: text(100) }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.myAttendance(db, user, data)),
  );
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.");
export const loadTimetable = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => attendance.loadTimetable(db, user)));
export const loadTimetableCoverage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => attendance.timetableCoverage(db, user)),
  );
export const buildTimetable = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ replace: z.boolean() }))
  .handler(({ data, context }) => {
    limitByIp("timetable-build", 20, 60 * 60 * 1000);
    return run(context.user, (db, user) => attendance.generateTimetable(db, user, data));
  });
export const saveTimetableSlot = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      day: z.number().int().min(1).max(6),
      start: clock,
      end: clock,
      room: text(60),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.saveSlot(db, user, data)),
  );
export const removeTimetableSlot = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => attendance.deleteSlot(db, user, data)),
  );

// ---------------------------------------------------------------- dashboard chat
export const loadDashboardChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => messaging.loadChatOverview(db, user)));
export const loadDashboardChatMessages = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ type: z.enum(["section", "private"]), id: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => messaging.loadChatMessages(db, user, data)),
  );
export const sendDashboardChatMessage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      type: z.enum(["section", "private"]),
      id: z.string().uuid(),
      body: text(2000),
      file: fileSchema.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.file) limitByIp("chat-upload", 40, 60 * 60 * 1000);
    return run(context.user, (db, user) => messaging.sendChatMessage(db, user, data));
  });
export const messageDashboardStudents = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      all: z.boolean().default(false),
      studentIds: z.array(text(60, 1)).max(500).default([]),
      body: text(2000),
      file: fileSchema.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("chat-broadcast", 30, 60 * 60 * 1000);
    return run(context.user, (db, user) => messaging.messageStudents(db, user, data));
  });
export const downloadDashboardChatFile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      type: z.enum(["section", "private"]),
      id: z.string().uuid(),
      messageId: z.string().uuid(),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => messaging.downloadChatFile(db, user, data)),
  );
export const requestPrivateChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => messaging.requestPrivateChat(db, user)),
  );
export const reviewPrivateChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      requestId: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => messaging.reviewPrivateChat(db, user, data)),
  );

// ---------------------------------------------------------------- results (SGPA and CGPA)
export const loadGradeBreakdown = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(60, 1) }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => results.gradeBreakdown(db, user, data)),
  );
export const recalculateGrades = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(60).nullable() }))
  .handler(({ data, context }) => {
    limitByIp("grades", 40, 60 * 60 * 1000);
    return run(context.user, (db, user) =>
      results.recalculateGrades(db, user, { studentId: data.studentId || null }),
    );
  });

// ---------------------------------------------------------------- resume and AI mock interviews
export const loadMyResume = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => interview.loadResume(db, user)));
export const saveMyResume = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ file: fileSchema.optional(), text: text(20000).optional() }))
  .handler(async ({ data, context }) => {
    limitByIp("resume-upload", 30, 60 * 60 * 1000);
    return run(context.user, (db, user) => interview.saveResume(db, user, data));
  });
export const removeMyResume = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => interview.removeResume(db, user)));
export const downloadMyResume = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => interview.downloadResume(db, user)));
export const startMockInterview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      role: text(100, 2),
      difficulty: z.enum(["easy", "medium", "hard"]),
      types: z.array(z.enum(TYPE_KEYS)).min(1).max(TYPE_KEYS.length),
      count: z.number().int().min(3).max(14),
    }),
  )
  .handler(async ({ data, context }) => {
    // Each interview is two paid model calls, so keep it well below the normal request limits.
    limitByIp("interview", 20, 60 * 60 * 1000);
    return run(context.user, (db, user) => interview.startInterview(db, user, data));
  });
export const submitMockInterview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      answers: z
        .array(
          z.object({
            index: z.number().int().min(0).max(30),
            answer: text(6000),
            code: text(8000),
            language: text(30),
          }),
        )
        .max(30),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("interview-grade", 20, 60 * 60 * 1000);
    return run(context.user, (db, user) => interview.submitInterview(db, user, data));
  });
export const reportInterviewViolation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({ id: z.string().uuid(), reason: z.enum(["tab-switch", "left-full-screen"]) }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("interview-violation", 60, 60 * 60 * 1000);
    return run(context.user, (db, user) => interview.recordViolation(db, user, data));
  });
export const loadMyInterviews = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => interview.listInterviews(db, user)));
export const loadInterviewResult = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => interview.getInterviewResult(db, user, data)),
  );
export const loadStudentInterviews = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1) }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => interview.listStudentInterviews(db, user, data)),
  );
export const loadStudentInterviewResult = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => interview.getStudentInterviewResult(db, user, data)),
  );
export const removeInterview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => interview.deleteInterview(db, user, data)),
  );

// ---------------------------------------------------------------- feedback centre
export const sendComplaint = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      category: z.enum(feedback.COMPLAINT_CATEGORIES),
      subject: text(150, 3),
      body: text(4000, 10),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("complaint", 10, 60 * 60 * 1000);
    return run(context.user, (db, user) => feedback.submitComplaint(db, user, data));
  });
export const loadMyComplaints = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => feedback.listMyComplaints(db, user)));
export const loadAllComplaints = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => feedback.listAllComplaints(db, user)));
export const answerComplaint = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "in-review", "resolved"]),
      response: text(3000),
      severity: z.enum(["low", "medium", "high"]),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => feedback.respondToComplaint(db, user, data)),
  );
export const assignComplaintToMe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => feedback.assignComplaintToMe(db, user, data)),
  );
export const loadComplaintChain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => chain.chainForComplaint(db, user, data.id)),
  );
export const verifyChainIntegrity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => chain.verifyChainIntegrity(db, user)));
const star = z.number().int().min(1).max(5);
export const sendRating = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      teaching: star,
      content: star,
      support: star,
      facilities: star,
      comment: text(1000),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => feedback.submitRating(db, user, data)),
  );
export const loadMyRatings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => feedback.listMyRatings(db, user)));
export const sendSubjectReview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      subject: text(100, 1),
      teaching: star,
      clarity: star,
      support: star,
      pace: star,
      comment: text(1000),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => feedback.submitSubjectReview(db, user, data)),
  );
export const loadMySubjectReviews = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => feedback.listMySubjectReviews(db, user)),
  );
export const loadSubjectReviewSummary = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => feedback.subjectReviewSummary(db, user)),
  );

// ---------------------------------------------------------------- placement
export const loadDrives = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) =>
      ((db, user) => placement.listDrives(db, user, today()))(db, user),
    ),
  );
export const postDrive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      company: text(100, 2),
      roleTitle: text(100, 2),
      description: text(2000),
      package: text(60),
      driveDate: date.or(z.literal("")),
      deadline: date,
      minCgpa: z.number().min(0).max(10),
      maxBacklogs: z.number().int().min(0).max(50),
      branches: z.array(text(30, 1)).max(20),
      gradYear: z.number().int().min(2020).max(2040).nullable().optional(),
      requiresAssessment: z.boolean(),
      link: url,
      rounds: z.array(text(60, 1)).max(8).default([]),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) =>
      ((db, user, data) => placement.saveDrive(db, user, data, today()))(db, user, data),
    ),
  );
export const removeDrive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.deleteDrive(db, user, data)),
  );
export const applyDrive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ driveId: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) =>
      ((db, user, data) => placement.applyToDrive(db, user, data, today()))(db, user, data),
    ),
  );
export const loadApplicants = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ driveId: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.listApplicants(db, user, data)),
  );
export const moveApplication = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      driveId: z.string().uuid(),
      studentId: text(50, 1),
      status: z.enum(["applied", "shortlisted", "selected", "rejected"]),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.setApplicationStatus(db, user, data)),
  );
export const setDriveRound = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      driveId: z.string().uuid(),
      studentId: text(50, 1),
      round: text(60, 1),
      result: z.enum(["passed", "failed", "pending"]),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.setRoundResult(db, user, data)),
  );
export const logMockInterview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      studentId: text(50, 1),
      date,
      interviewer: text(100),
      score: z.number().min(0).max(100).nullable().optional(),
      feedback: text(1000),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.addMockInterview(db, user, data)),
  );
export const removeMockInterview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.deleteMockInterview(db, user, data)),
  );
export const loadMockInterviews = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1).optional() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => placement.listMockInterviews(db, user, data)),
  );

// ---------------------------------------------------------------- engagement
export const loadOpportunities = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) =>
      ((db, user) => engagement.listOpportunities(db, user, today()))(db, user),
    ),
  );
export const postOpportunity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      type: z.enum(engagement.OPPORTUNITY_TYPES),
      title: text(150, 3),
      purpose: text(1500),
      benefits: text(1500),
      requirements: text(1500),
      eligibility: text(1000),
      howToApply: text(1500),
      deadline: date.or(z.literal("")),
      link: url,
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) =>
      ((db, user, data) => engagement.saveOpportunity(db, user, data, today()))(db, user, data),
    ),
  );
export const removeOpportunity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => engagement.deleteOpportunity(db, user, data)),
  );
export const updateParticipation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      opportunityId: z.string().uuid(),
      status: z.enum(["interested", "applied", "participating", "completed"]),
      evidence: text(500),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => engagement.setParticipation(db, user, data)),
  );
export const loadParticipants = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ opportunityId: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => engagement.listParticipants(db, user, data)),
  );
export const confirmParticipation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({ opportunityId: z.string().uuid(), studentId: text(50, 1), verified: z.boolean() }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) =>
      ((db, user, data) => engagement.verifyParticipation(db, user, data, today()))(db, user, data),
    ),
  );

// ---------------------------------------------------------------- skills
export const logAssessment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      studentId: text(50, 1),
      category: z.enum(skills.SKILL_CATEGORIES),
      topic: text(100),
      score: z.number().min(0).max(100),
      takenOn: date,
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => skills.recordAssessment(db, user, data)),
  );
export const removeAssessment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(id)
  .handler(({ data, context }) =>
    run(context.user, (db, user) => skills.deleteAssessment(db, user, data)),
  );
export const loadAssessments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1).optional() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => skills.listAssessments(db, user, data)),
  );

// ---------------------------------------------------------------- agent plans
export const loadAgentPlans = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1).optional(), role: text(80).optional() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => agentPlans.getAgentPlans(db, user, data)),
  );
export const setAgentPlanItem = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ planId: z.string().uuid(), itemId: text(30, 1), done: z.boolean() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => agentPlans.setPlanItem(db, user, data)),
  );

// ---------------------------------------------------------------- predictions
const subjectName = text(80, 1);
export const loadStudentPrediction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1).optional() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.getStudentPrediction(db, user, data)),
  );
export const loadPredictions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      branch: text(40, 1).optional(),
      gradYear: z.number().int().min(2000).max(2100).optional(),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.listPredictions(db, user, data)),
  );
export const loadPredictionInputs = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1).optional() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.listPredictionInputs(db, user, data)),
  );
export const saveCodingProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      studentId: text(50, 1).optional(),
      username: text(60).optional(),
      easy: z.number().int().min(0).max(5000),
      medium: z.number().int().min(0).max(5000),
      hard: z.number().int().min(0).max(5000),
      contestRating: z.number().int().min(0).max(4500).optional(),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.saveCodingProfile(db, user, data)),
  );
export const addExamScore = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      studentId: text(50, 1),
      subject: subjectName,
      kind: z.enum(["mid1", "mid2", "continuous"]),
      title: text(80).optional(),
      score: z.number().min(0).max(1000),
      max: z.number().min(1).max(1000),
      takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.addExamScore(db, user, data)),
  );
export const deleteExamScore = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.deleteExamScore(db, user, data)),
  );
export const addTeacherRating = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      studentId: text(50, 1),
      subject: text(80).optional(),
      rating: z.number().int().min(1).max(5),
      comment: text(500).optional(),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => predictions.addTeacherRating(db, user, data)),
  );
export const runPredictionAgent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      branch: text(40, 1).optional(),
      gradYear: z.number().int().min(2000).max(2100).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("prediction-agent", 20, 60 * 60 * 1000);
    return run(context.user, (db, user) => predictions.runPredictionAgent(db, user, data));
  });
export const runPredictionCoach = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ role: text(80, 3) }))
  .handler(async ({ data, context }) => {
    limitByIp("prediction-coach", 15, 60 * 60 * 1000);
    return run(context.user, (db, user) => predictions.runPredictionCoach(db, user, data));
  });
export const loadModelReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => mlModels.getModelReport(db, user)));
export const trainModels = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    limitByIp("train-models", 10, 60 * 60 * 1000);
    return run(context.user, (db, user) => mlModels.trainModels(db, user));
  });
export const loadLearnedPredictions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: text(50, 1).optional() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => mlModels.learnedPredictions(db, user, data)),
  );
