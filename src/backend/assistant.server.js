import { tool } from "ai";
import { z } from "zod";

import { isAdmin, isFaculty } from "./access.server.js";
import { learnedPredictions } from "./ml-models.server.js";
import { listDrives } from "./placement.server.js";
import { getStudentPrediction, listPredictions } from "./predictions.server.js";
import {
  BAND_ORDER,
  averages,
  buildRows,
  byAttention,
  isAtRisk,
  lowAttendance,
  summarize,
} from "@/lib/campus-derive";
import { liveAssignments, liveNotifications } from "@/lib/live-profile";
import { classesNeededForTarget, maxMissableClasses, recommendations } from "@/lib/scoring";

// What Pluto may look up, by role. The role comes from the signed-in account, never from the
// conversation, and every query is limited in SQL to the records that role may read: a student
// sees one record, a teacher the students assigned to them, an administrator everyone. The model
// only ever receives what these tools return.

/** admin > faculty > student; null when nobody is signed in or the account has no student record role. */
export function assistantRole(user) {
  if (!user) return "visitor";
  if (isAdmin(user)) return "admin";
  if (isFaculty(user)) return "faculty";
  return "student";
}

const round = (n, p = 1) =>
  typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(p)) : null;
const today = () => new Date().toISOString().slice(0, 10);

/** Subjects where attendance is under 75%: a student can be barred from that exam even when the overall figure looks fine. */
const subjectsBelow75 = (s) =>
  s.subjects
    .filter((x) => x.classesHeld > 0 && (x.classesAttended / x.classesHeld) * 100 < 75)
    .map((x) => x.subject);

const brief = (row) => ({
  id: row.id,
  name: row.name,
  branch: row.branch,
  year: row.year,
  semester: row.semester,
  successScore: round(row.score),
  band: row.band,
  cgpa: row.cgpa,
  attendance: round(row.attendance),
  subjectsBelow75Attendance: subjectsBelow75(row.s),
  backlogs: row.s.backlogs,
  academicRisk: row.academicRisk,
  placementRisk: row.placementRisk,
  mentor: row.mentorName || null,
  openAlerts: row.alerts,
});

/** Loads (once per question) the students this person may see, with scores worked out. */
// A person's records are kept for a short while, so a follow-up question does not fetch them again.
const CACHE = new Map();
const CACHE_MS = 30_000;
export const clearAssistantCache = () => CACHE.clear();

function scope(db, user, role) {
  let cache;
  const key = `${role}:${user.id}`;
  const load = async () => {
    if (cache) return cache;
    const kept = CACHE.get(key);
    if (kept && Date.now() - kept.at < CACHE_MS) return (cache = kept.value);
    const where =
      role === "admin" ? "TRUE" : role === "faculty" ? "sr.faculty_id = $1" : "sr.owner_id = $1";
    const { rows: recs } = await db.query(
      `SELECT sr.id, sr.owner_id, sr.faculty_id, sr.record, sr.updated_at,
              f.display_name AS mentor_name, f.email AS mentor_email
         FROM student_records sr LEFT JOIN users f ON f.id = sr.faculty_id
        WHERE ${where} ORDER BY sr.id`,
      role === "admin" ? [] : [user.id],
    );
    const rows = buildRows(recs, today());
    const ids = rows.map((r) => r.id);
    const { rows: interventions } = ids.length
      ? await db.query(
          `SELECT ci.id, ci.student_id, ci.reason, ci.action, ci.priority, ci.owner, ci.status,
                  ci.follow_up_date::text AS follow_up_date
             FROM campus_interventions ci WHERE ci.student_id = ANY($1::text[]) ORDER BY ci.follow_up_date`,
          [ids],
        )
      : { rows: [] };
    cache = { rows, interventions };
    CACHE.set(key, { at: Date.now(), value: cache });
    return cache;
  };
  return load;
}

/** One student by ID or by (part of) a name, from the rows this person may see. */
function findStudent(rows, query) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return { error: "Say which student, by name or ID." };
  const exact = rows.filter((r) => r.id.toLowerCase() === q);
  const hits = exact.length
    ? exact
    : rows.filter((r) => `${r.name} ${r.id}`.toLowerCase().includes(q));
  if (!hits.length)
    return { error: `No student matching "${query}" among the students you can see.` };
  if (hits.length > 1)
    return {
      matches: hits
        .slice(0, 8)
        .map((r) => ({ id: r.id, name: r.name, branch: r.branch, year: r.year })),
    };
  return { row: hits[0] };
}

const subjectsOf = (s) =>
  s.subjects.map((sub) => {
    const attended = sub.classesAttended;
    const held = sub.classesHeld;
    const pct = held > 0 ? (attended / held) * 100 : null;
    return {
      subject: sub.subject,
      marks: sub.marks ?? null,
      attendance: round(pct),
      attended,
      held,
      classesNeededToReach75: held > 0 && pct < 75 ? classesNeededForTarget(attended, held, 75) : 0,
      classesThatCanBeMissedAndStayAt75:
        held > 0 && pct >= 75 ? maxMissableClasses(attended, held, 75) : 0,
    };
  });

const predictionBrief = (p) => ({
  riskLevel: p.risk.level,
  riskReasons: p.risk.reasons,
  placement: {
    score: p.placement.score,
    projectedInWeeks:
      p.placement.projected !== null
        ? { weeks: p.placement.horizonWeeks, score: p.placement.projected }
        : null,
    band: p.placement.band,
    confidence: p.placement.confidence,
    criteria: p.placement.components.map((c) => ({
      criterion: c.label,
      weightPercent: c.weight,
      score: c.value,
      detail: c.detail,
    })),
    improveFirst: (p.placement.improve ?? [])
      .slice(0, 3)
      .map((i) => ({ criterion: i.label, possibleGain: i.gain })),
  },
  result: {
    predictedSgpa: p.result.predictedSgpa,
    overallPredictedPercent: p.result.score,
    band: p.result.band,
    subjects: p.result.subjects.map((s) => ({
      subject: s.subject,
      predicted: s.predicted,
      outlook: s.outlook,
      attendance: s.attendance,
    })),
    attendanceBelow75In: p.result.detentionSubjects,
  },
  recommendedActions: p.actions
    .slice(0, 6)
    .map((a) => ({ action: a.title, owner: a.owner, priority: a.priority, why: a.detail })),
});

const learnedBrief = (l) =>
  l && l.trained
    ? {
        expectedFinalMarks: l.result?.subjects.map((s) => ({
          subject: s.subject,
          predicted: s.value,
          range90: [round(s.interval.low), round(s.interval.high)],
          confidenceAbovePassMark: s.headline.flagged
            ? round(1 - s.headline.confidence, 2)
            : s.headline.confidence,
          biggestLever: s.improve[0] ?? null,
        })),
        nextSemesterSgpa: l.nextSgpa
          ? {
              predicted: l.nextSgpa.value,
              range90: [l.nextSgpa.interval.low, l.nextSgpa.interval.high],
              higherThanLast: l.nextSgpa.improves,
            }
          : null,
        expectedMockInterviewScore: l.interview
          ? { predicted: l.interview.value, whatWouldRaiseIt: l.interview.improve }
          : null,
        accuracyNote: l.result
          ? `The model's marks predictions are typically off by ${l.result.reliability.mae} marks (R² ${l.result.reliability.r2}).`
          : null,
      }
    : null;

// ------------------------------------------------------------------ student tools

function studentTools({ db, user, role, load = scope(db, user, role) }) {
  const mine = async () => {
    const { rows, interventions } = await load();
    if (!rows[0])
      return {
        error: "No student record is linked to this account yet, so there is nothing to look up.",
      };
    return { row: rows[0], interventions };
  };
  return {
    my_overview: tool({
      description:
        "The signed-in student's headline numbers: Success Score and band, CGPA, latest SGPA, backlogs, attendance, risk flags, mentor.",
      inputSchema: z.object({}),
      execute: async () => {
        const { row, error } = await mine();
        if (error) return { error };
        const s = row.s;
        return {
          ...brief(row),
          latestSgpa: s.semesterGrades.at(-1) ?? null,
          semesterGrades: s.semesterGrades,
          lmsCompletionPercent: round(row.lms),
          segment: row.segment,
          biggestStrength: row.topDriver,
          biggestRiskSignal: row.riskDriver,
          targetRoles: s.targetRoles,
        };
      },
    }),
    my_subjects: tool({
      description:
        "The student's marks and attendance in every subject, and how many classes they must attend to reach 75% (or can still miss).",
      inputSchema: z.object({}),
      execute: async () => {
        const { row, error } = await mine();
        if (error) return { error };
        return { subjects: subjectsOf(row.s).sort((a, b) => (a.marks ?? 101) - (b.marks ?? 101)) };
      },
    }),
    my_attention: tool({
      description:
        "What needs the student's attention now: live alerts, pending assignments with deadlines, and recommended next steps from the Success Score rules.",
      inputSchema: z.object({}),
      execute: async () => {
        const { row, error } = await mine();
        if (error) return { error };
        return {
          alerts: liveNotifications(row.s, today())
            .filter((n) => n.tone !== "info")
            .map((n) => ({ area: n.area, issue: n.text, advice: n.tip, severity: n.tone })),
          pendingAssignments: liveAssignments(row.s, today())
            .slice(0, 8)
            .map((a) => ({
              subject: a.subject,
              title: a.title,
              deadline: a.deadline,
              daysLeft: a.daysLeft,
            })),
          nextSteps: recommendations(row.s),
        };
      },
    }),
    my_predictions: tool({
      description:
        "The student's predicted placement score and predicted results, their overall risk level with reasons, the actions recommended to improve, and the statistical model's expected marks with ranges and confidence.",
      inputSchema: z.object({}),
      execute: async () => {
        const { error } = await mine();
        if (error) return { error };
        const [p, l] = await Promise.all([
          getStudentPrediction(db, user, {}),
          learnedPredictions(db, user, {}).catch(() => null),
        ]);
        return { ...predictionBrief(p), statisticalModel: learnedBrief(l) };
      },
    }),
    my_placement: tool({
      description:
        "The student's placement picture: readiness inputs (skills, resume, mock interviews), and each open company drive with whether they are eligible and why not.",
      inputSchema: z.object({}),
      execute: async () => {
        const { row, error } = await mine();
        if (error) return { error };
        const s = row.s;
        const drives = await listDrives(db, user, today()).catch(() => []);
        return {
          skills: Object.fromEntries(
            Object.entries(s.skills).map(([k, v]) => [k, v >= 0 ? v : "not assessed"]),
          ),
          resumeCompletenessPercent:
            s.resumeCompleteness >= 0 ? s.resumeCompleteness : "not recorded",
          mockInterviews: s.mockInterviews ?? "not recorded",
          placementRisk: row.placementRisk,
          openDrives: drives
            .filter((d) => d.open)
            .slice(0, 10)
            .map((d) => ({
              company: d.company,
              role: d.roleTitle ?? d.role_title ?? d.role,
              deadline: d.deadline,
              applied: d.application,
              eligible: d.eligibility?.eligible ?? null,
              why: d.eligibility?.explanation ?? null,
            })),
        };
      },
    }),
    my_support: tool({
      description:
        "Support actions (interventions) that teachers have created for this student, with status and follow-up dates.",
      inputSchema: z.object({}),
      execute: async () => {
        const { interventions, error } = await mine();
        if (error) return { error };
        return {
          supportActions: interventions.map((i) => ({
            action: i.action,
            reason: i.reason,
            owner: i.owner,
            status: i.status,
            followUp: i.follow_up_date,
            priority: i.priority,
          })),
        };
      },
    }),
  };
}

// ------------------------------------------------------------------ teacher and administrator tools

function staffTools({ db, user, role, load = scope(db, user, role) }) {
  const who = role === "admin" ? "any student on campus" : "a student assigned to this teacher";
  const tools = {
    class_overview: tool({
      description: `Counts and averages for ${role === "admin" ? "the whole campus" : "this teacher's students"}, optionally for one branch or year: students by Success Score band, how many are at risk, low attendance, open and overdue support actions.`,
      inputSchema: z.object({
        branch: z.string().optional().describe("e.g. CSE"),
        year: z.number().int().min(1).max(5).optional(),
      }),
      execute: async ({ branch, year }) => {
        const { rows, interventions } = await load();
        const pick = rows.filter(
          (r) =>
            (!branch || r.branch.toLowerCase() === branch.toLowerCase()) &&
            (!year || r.year === year),
        );
        const ids = new Set(pick.map((r) => r.id));
        const a = averages(pick);
        const sum = summarize(
          pick,
          interventions.filter((i) => ids.has(i.student_id)),
          today(),
        );
        return {
          scope: { branch: branch ?? "all", year: year ?? "all", students: pick.length },
          ...sum,
          averageSuccessScore: round(a.avgScore),
          averageCgpa: round(a.avgCgpa, 2),
          averageAttendance: round(a.avgAtt),
          studentsWithAnySubjectBelow75: pick.filter((r) => subjectsBelow75(r.s).length > 0).length,
          dataCoveragePercent: round(a.coverage),
        };
      },
    }),
    find_students: tool({
      description: `List students ${role === "admin" ? "on campus" : "assigned to this teacher"} that match filters, most in need first. Use for questions like who is at risk, who has low attendance, who has a high CGPA but weak placement readiness.`,
      inputSchema: z.object({
        query: z.string().optional().describe("part of a name or ID"),
        branch: z.string().optional(),
        year: z.number().int().min(1).max(5).optional(),
        band: z.enum(BAND_ORDER).optional(),
        atRiskOnly: z.boolean().optional().describe("only High Priority or Needs Attention"),
        lowAttendance: z
          .boolean()
          .optional()
          .describe("attendance below 75% overall or in any one subject"),
        minCgpa: z.number().optional(),
        maxCgpa: z.number().optional(),
        placementRisk: z.enum(["High", "Medium", "Low"]).optional(),
        academicRisk: z.enum(["High", "Medium", "Low"]).optional(),
        withBacklogs: z.boolean().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async (f) => {
        const { rows } = await load();
        const q = f.query?.toLowerCase();
        const hits = byAttention(
          rows.filter(
            (r) =>
              (!q || `${r.name} ${r.id}`.toLowerCase().includes(q)) &&
              (!f.branch || r.branch.toLowerCase() === f.branch.toLowerCase()) &&
              (!f.year || r.year === f.year) &&
              (!f.band || r.band === f.band) &&
              (!f.atRiskOnly || isAtRisk(r)) &&
              (!f.lowAttendance || lowAttendance(r) || subjectsBelow75(r.s).length > 0) &&
              (f.minCgpa === undefined || (r.cgpa !== null && r.cgpa >= f.minCgpa)) &&
              (f.maxCgpa === undefined || (r.cgpa !== null && r.cgpa <= f.maxCgpa)) &&
              (!f.placementRisk || r.placementRisk === f.placementRisk) &&
              (!f.academicRisk || r.academicRisk === f.academicRisk) &&
              (!f.withBacklogs || r.s.backlogs > 0),
          ),
        );
        return { totalMatching: hits.length, students: hits.slice(0, f.limit ?? 10).map(brief) };
      },
    }),
    student_detail: tool({
      description: `Everything about one student (${who}): scores, subject-wise marks and attendance, alerts, predicted placement and results with risk and recommended actions, and support actions.`,
      inputSchema: z.object({ student: z.string().describe("name or ID") }),
      execute: async ({ student }) => {
        const { rows, interventions } = await load();
        const found = findStudent(rows, student);
        if (!found.row) return found;
        const { row } = found;
        const [p, l] = await Promise.all([
          getStudentPrediction(db, user, { studentId: row.id }),
          learnedPredictions(db, user, { studentId: row.id }).catch(() => null),
        ]);
        return {
          ...brief(row),
          latestSgpa: row.s.semesterGrades.at(-1) ?? null,
          subjects: subjectsOf(row.s),
          alerts: liveNotifications(row.s, today())
            .filter((n) => n.tone !== "info")
            .map((n) => ({ area: n.area, issue: n.text })),
          predictions: predictionBrief(p),
          statisticalModel: learnedBrief(l),
          supportActions: interventions
            .filter((i) => i.student_id === row.id)
            .map((i) => ({
              action: i.action,
              owner: i.owner,
              status: i.status,
              followUp: i.follow_up_date,
              priority: i.priority,
            })),
        };
      },
    }),
    predicted_risk: tool({
      description:
        "Students ranked by the prediction model's overall risk (High first), with the reasons and the top recommended action for each. kind chooses which prediction to rank by.",
      inputSchema: z.object({
        kind: z.enum(["overall", "placement", "result"]).optional(),
        branch: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ kind = "overall", branch, limit = 10 }) => {
        const { rows } = await load();
        const pick = rows.filter((r) => !branch || r.branch.toLowerCase() === branch.toLowerCase());
        const list = await listPredictions(db, user, {}, { rows: pick.map((r) => r.rec) });
        const rank = { High: 0, Medium: 1, Low: 2, "Insufficient data": 3 };
        const key = (r) =>
          kind === "placement"
            ? (r.placement.score ?? 101)
            : kind === "result"
              ? (r.result.score ?? 101)
              : 0;
        const sorted = [...list].sort((a, b) =>
          kind === "overall"
            ? rank[a.risk.level] - rank[b.risk.level] ||
              (a.result.score ?? 101) - (b.result.score ?? 101)
            : key(a) - key(b),
        );
        return {
          counts: Object.fromEntries(
            ["High", "Medium", "Low", "Insufficient data"].map((l) => [
              l,
              list.filter((r) => r.risk.level === l).length,
            ]),
          ),
          students: sorted.slice(0, limit).map((r) => ({
            id: r.id,
            name: r.name,
            branch: r.branch,
            riskLevel: r.risk.level,
            why: r.risk.reasons.slice(0, 2),
            placementScore: r.placement.score,
            placementBand: r.placement.band,
            predictedResultPercent: r.result.score,
            predictedSgpa: r.result.sgpa,
            topAction: r.actions[0]
              ? { action: r.actions[0].title, owner: r.actions[0].owner }
              : null,
          })),
        };
      },
    }),
    support_actions: tool({
      description: `Support actions (interventions) for ${role === "admin" ? "all students" : "this teacher's students"}: open, in progress, overdue follow-ups.`,
      inputSchema: z.object({
        status: z.enum(["open", "in-progress", "resolved"]).optional(),
        overdueOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ status, overdueOnly, limit = 10 }) => {
        const { rows, interventions } = await load();
        const names = new Map(rows.map((r) => [r.id, r.name]));
        const list = interventions.filter(
          (i) =>
            (!status || i.status === status) &&
            (!overdueOnly || (i.status !== "resolved" && i.follow_up_date < today())),
        );
        return {
          total: list.length,
          supportActions: list.slice(0, limit).map((i) => ({
            student: names.get(i.student_id) ?? i.student_id,
            studentId: i.student_id,
            action: i.action,
            owner: i.owner,
            status: i.status,
            followUp: i.follow_up_date,
            overdue: i.status !== "resolved" && i.follow_up_date < today(),
            priority: i.priority,
          })),
        };
      },
    }),
  };
  if (role === "admin") {
    tools.department_comparison = tool({
      description:
        "Compare departments (branches): students, average Success Score, CGPA and attendance, and how many are at risk or have low attendance. Set includePredictions to also count students the prediction model rates high risk (slower).",
      inputSchema: z.object({ includePredictions: z.boolean().optional() }),
      execute: async ({ includePredictions }) => {
        const { rows } = await load();
        const predicted = includePredictions ? await listPredictions(db, user, {}, { rows: rows.map((r) => r.rec) }) : [];
        const highBy = new Map();
        for (const p of predicted)
          if (p.risk.level === "High") highBy.set(p.branch, (highBy.get(p.branch) ?? 0) + 1);
        const branches = [...new Set(rows.map((r) => r.branch || "Not set"))].sort();
        return {
          departments: branches.map((branch) => {
            const list = rows.filter((r) => (r.branch || "Not set") === branch);
            const a = averages(list);
            return {
              branch,
              students: list.length,
              averageSuccessScore: round(a.avgScore),
              averageCgpa: round(a.avgCgpa, 2),
              averageAttendance: round(a.avgAtt),
              atRisk: list.filter(isAtRisk).length,
              lowAttendance: list.filter(lowAttendance).length,
              ...(includePredictions ? { predictedHighRisk: highBy.get(branch) ?? 0 } : {}),
            };
          }),
        };
      },
    });
    tools.teacher_workload = tool({
      description:
        "Each teacher's load: students assigned, how many are at risk, open and overdue support actions. Also how many students have no teacher.",
      inputSchema: z.object({}),
      execute: async () => {
        const { rows, interventions } = await load();
        const byStudent = new Map(rows.map((r) => [r.id, r]));
        const mentors = new Map();
        for (const r of rows) {
          const key = r.mentorId ?? "none";
          const m = mentors.get(key) ?? {
            teacher: r.mentorName || (key === "none" ? "Unassigned" : "Unknown"),
            students: 0,
            atRisk: 0,
            openActions: 0,
            overdueActions: 0,
          };
          m.students++;
          if (isAtRisk(r)) m.atRisk++;
          mentors.set(key, m);
        }
        for (const i of interventions) {
          if (i.status === "resolved") continue;
          const m = mentors.get(byStudent.get(i.student_id)?.mentorId ?? "none");
          if (!m) continue;
          m.openActions++;
          if (i.follow_up_date < today()) m.overdueActions++;
        }
        return { teachers: [...mentors.values()].sort((a, b) => b.atRisk - a.atRisk) };
      },
    });
  }
  return tools;
}

/**
 * One assistant for one question: the person's role, the lookups they may run, and the roster of
 * students they may see (used to recognise names in the question). The lookups share a single
 * database load. Nobody signed in gets no lookups.
 */
export function createAssistant({ db, user }) {
  const role = assistantRole(user);
  if (role === "visitor")
    return { role, tools: {}, roster: async () => ({ students: [], branches: [] }) };
  const load = scope(db, user, role);
  const tools =
    role === "student"
      ? studentTools({ db, user, role, load })
      : staffTools({ db, user, role, load });
  return {
    role,
    tools,
    roster: async () => {
      const { rows } = await load();
      return {
        students: rows.map((r) => ({ id: r.id, name: r.name, branch: r.branch })),
        branches: [...new Set(rows.map((r) => r.branch).filter(Boolean))],
      };
    },
  };
}

/** The lookups for this person's role. */
export const assistantTools = (args) => createAssistant(args).tools;
