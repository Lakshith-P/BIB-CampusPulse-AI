import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import { buildRows, BAND_ORDER, isAtRisk } from "@/lib/campus-derive";
import { componentScores, recommendations } from "@/lib/scoring";
import { academicRisk, placementRisk } from "@/lib/risk-flags";
import { DEFAULT_WEIGHTS } from "@/lib/types";

// The Analytics Copilot. A dean or teacher asks a question in plain language; a model decides
// which of the fixed, read-only tools below to call, and the tools compute their answers from the
// student records the caller is allowed to see. Every tool call is also recorded as an "evidence"
// table (the exact rows behind the numbers) that is returned beside the answer, so nothing in the
// answer has to be taken on trust. Tool inputs are validated; no model-written SQL is ever run.

export const MAX_EVIDENCE_ROWS = 25;
const MAX_QUESTION = 600;
const COMPONENT_LABELS = {
  academics: "Academics",
  attendance: "Attendance",
  lms: "LMS",
  engagement: "Engagement",
  skills: "Skills",
  placement: "Placement",
};
const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const round2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const mean = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
};

/** The student records and support actions this person may see, scored. Admins see everyone; a
 * teacher sees the students assigned to them. This is the only data the copilot can reach. */
export async function loadScope(db, user, today) {
  const isAdmin = user.roles.includes("admin");
  const isFaculty = user.roles.includes("faculty");
  if (!isAdmin && !isFaculty) throw new Error("The Analytics Copilot is for teachers and deans.");
  const records = await db.query(
    `SELECT sr.id, sr.owner_id, sr.faculty_id, sr.record, sr.updated_at,
            o.email AS owner_email, f.email AS mentor_email, f.display_name AS mentor_name
       FROM student_records sr
       LEFT JOIN users o ON o.id = sr.owner_id
       LEFT JOIN users f ON f.id = sr.faculty_id
      WHERE ($1::boolean OR sr.faculty_id = $2) ORDER BY sr.id`,
    [isAdmin, user.id],
  );
  const interventions = await db.query(
    `SELECT ci.id, ci.student_id, ci.reason, ci.action, ci.priority, ci.status,
            ci.follow_up_date::text AS follow_up_date
       FROM campus_interventions ci JOIN student_records sr ON sr.id = ci.student_id
      WHERE ($1::boolean OR sr.faculty_id = $2) ORDER BY ci.created_at DESC`,
    [isAdmin, user.id],
  );
  return {
    rows: buildRows(records.rows, today),
    interventions: interventions.rows,
    scope: isAdmin ? "all students on campus" : "the students assigned to you",
  };
}

const filterShape = {
  branch: z.string().optional().describe("Exact branch name, e.g. CSE"),
  semester: z.number().int().min(1).max(12).optional(),
  section: z.string().optional(),
  band: z
    .enum(BAND_ORDER)
    .optional()
    .describe("Success Score band: On Track, Monitor, Needs Attention or High Priority"),
  mentor: z.string().optional().describe("Part of the assigned mentor's name or email"),
  minScore: z.number().min(0).max(100).optional(),
  maxScore: z.number().min(0).max(100).optional(),
  minAttendance: z.number().min(0).max(100).optional().describe("Overall attendance percent"),
  maxAttendance: z.number().min(0).max(100).optional(),
  maxCgpa: z.number().min(0).max(10).optional(),
  minCgpa: z.number().min(0).max(10).optional(),
  atRiskOnly: z.boolean().optional().describe("Only High Priority and Needs Attention students"),
};
const filterSchema = z.object(filterShape);

const has = (haystack, needle) => (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
function applyFilters(rows, f = {}) {
  return rows.filter(
    (r) =>
      (!f.branch || r.branch.toLowerCase() === f.branch.toLowerCase()) &&
      (!f.semester || r.semester === f.semester) &&
      (!f.section || (r.section ?? "").toLowerCase() === f.section.toLowerCase()) &&
      (!f.band || r.band === f.band) &&
      (!f.mentor || has(r.mentorName, f.mentor) || has(r.mentorEmail, f.mentor)) &&
      (f.minScore === undefined || (r.score !== null && r.score >= f.minScore)) &&
      (f.maxScore === undefined || (r.score !== null && r.score <= f.maxScore)) &&
      (f.minAttendance === undefined ||
        (r.attendance !== null && r.attendance >= f.minAttendance)) &&
      (f.maxAttendance === undefined ||
        (r.attendance !== null && r.attendance <= f.maxAttendance)) &&
      (f.minCgpa === undefined || (r.cgpa !== null && r.cgpa >= f.minCgpa)) &&
      (f.maxCgpa === undefined || (r.cgpa !== null && r.cgpa <= f.maxCgpa)) &&
      (!f.atRiskOnly || isAtRisk(r)),
  );
}
const describeFilters = (f = {}) => {
  const parts = Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${k}=${v === true ? "yes" : v}`);
  return parts.length ? parts.join(", ") : "no filters (everyone you can see)";
};

const GROUPS = {
  branch: (r) => r.branch,
  semester: (r) => `Semester ${r.semester}`,
  section: (r) => r.section || "No section",
  mentor: (r) => r.mentorName || "Unassigned",
  band: (r) => r.band ?? "No data yet",
};

/** Builds the tools for one request. `evidence` collects what each tool actually returned. */
export function buildTools(scope, today, evidence) {
  const record = (entry) => {
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, ...entry });
    return id;
  };
  const table = (rows, limit = MAX_EVIDENCE_ROWS) => ({
    shown: rows.slice(0, limit),
    total: rows.length,
    truncated: rows.length > limit,
  });

  return {
    cohort_summary: tool({
      description:
        "Average Success Score, attendance, CGPA and risk counts for the students in scope, optionally grouped by branch, semester, section, mentor or band. Use it for comparisons and 'how is X doing' questions.",
      inputSchema: z.object({
        groupBy: z
          .enum(["none", "branch", "semester", "section", "mentor", "band"])
          .default("none"),
        filters: filterSchema.optional(),
      }),
      execute: async ({ groupBy, filters }) => {
        const rows = applyFilters(scope.rows, filters);
        const key = GROUPS[groupBy] ?? (() => "All students");
        const groups = new Map();
        for (const r of rows) {
          const k = key(r);
          groups.set(k, [...(groups.get(k) ?? []), r]);
        }
        const out = [...groups.entries()]
          .map(([group, rs]) => ({
            group,
            students: rs.length,
            avgScore: round1(mean(rs.map((r) => r.score))),
            avgAttendance: round1(mean(rs.map((r) => r.attendance))),
            avgCgpa: round2(mean(rs.map((r) => r.cgpa))),
            atRisk: rs.filter(isAtRisk).length,
            lowAttendance: rs.filter((r) => r.attendance !== null && r.attendance < 75).length,
          }))
          .sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101));
        const t = table(out);
        const evidenceId = record({
          tool: "cohort_summary",
          title: groupBy === "none" ? "Overall summary" : `Summary by ${groupBy}`,
          description: `${rows.length} student(s) — ${describeFilters(filters)}`,
          columns: [
            { key: "group", label: groupBy === "none" ? "Scope" : groupBy },
            { key: "students", label: "Students", kind: "number" },
            { key: "avgScore", label: "Avg score", kind: "score" },
            { key: "avgAttendance", label: "Avg attendance %", kind: "percent" },
            { key: "avgCgpa", label: "Avg CGPA", kind: "number" },
            { key: "atRisk", label: "At risk", kind: "number" },
            { key: "lowAttendance", label: "Below 75% att.", kind: "number" },
          ],
          rows: t.shown,
          total: t.total,
        });
        return { evidenceId, studentsMatched: rows.length, groups: t.shown };
      },
    }),

    find_students: tool({
      description:
        "List individual students that match filters, sorted by a metric. Use it to name who needs attention, who is lowest or highest, or to list students below a threshold.",
      inputSchema: z.object({
        filters: filterSchema.optional(),
        sortBy: z
          .enum(["score", "attendance", "cgpa", "lms", "backlogs", "attention"])
          .default("attention")
          .describe("'attention' puts the highest-risk students first"),
        order: z.enum(["asc", "desc"]).default("asc"),
        limit: z.number().int().min(1).max(MAX_EVIDENCE_ROWS).default(10),
      }),
      execute: async ({ filters, sortBy, order, limit }) => {
        const rows = applyFilters(scope.rows, filters);
        const value = {
          score: (r) => r.score,
          attendance: (r) => r.attendance,
          cgpa: (r) => r.cgpa,
          lms: (r) => r.lms,
          backlogs: (r) => r.s.backlogs,
          attention: (r) => {
            const rank = r.band === null ? 99 : BAND_ORDER.indexOf(r.band);
            return rank * 1000 + (r.score ?? 101);
          },
        }[sortBy];
        const dir = order === "desc" ? -1 : 1;
        // Students with no value for the metric go last whichever way it is sorted.
        const sorted = [...rows].sort((a, b) => {
          const x = value(a);
          const y = value(b);
          if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
          if (y === null || y === undefined) return -1;
          return (x - y) * dir;
        });
        const t = table(
          sorted.slice(0, limit).map((r) => ({
            id: r.id,
            name: r.name,
            branch: r.branch,
            semester: r.semester,
            score: r.score,
            band: r.band ?? "No data yet",
            attendance: round1(r.attendance),
            cgpa: round2(r.cgpa),
            backlogs: r.s.backlogs,
            topRisk: r.riskDriver ?? "—",
          })),
          limit,
        );
        const evidenceId = record({
          tool: "find_students",
          title: `Students sorted by ${sortBy} (${order === "asc" ? "lowest" : "highest"} first)`,
          description: `${rows.length} matching student(s) — ${describeFilters(filters)}`,
          columns: [
            { key: "name", label: "Student", kind: "student" },
            { key: "branch", label: "Branch" },
            { key: "semester", label: "Sem", kind: "number" },
            { key: "score", label: "Score", kind: "score" },
            { key: "band", label: "Band", kind: "band" },
            { key: "attendance", label: "Attendance %", kind: "percent" },
            { key: "cgpa", label: "CGPA", kind: "number" },
            { key: "backlogs", label: "Backlogs", kind: "number" },
            { key: "topRisk", label: "Main risk signal" },
          ],
          rows: t.shown,
          total: rows.length,
        });
        return { evidenceId, studentsMatched: rows.length, students: t.shown };
      },
    }),

    score_drivers: tool({
      description:
        "What is pulling the Success Score down: the average of each of the six components (academics, attendance, LMS, engagement, skills, placement), and how often each academic or placement risk signal fires. Use it for 'why' questions.",
      inputSchema: z.object({ filters: filterSchema.optional() }),
      execute: async ({ filters }) => {
        const rows = applyFilters(scope.rows, filters);
        const comps = rows.map((r) => componentScores(r.s));
        const components = Object.keys(COMPONENT_LABELS).map((k) => {
          const vals = comps.map((c) => c[k]).filter((v) => v !== null && v !== undefined);
          return {
            signal: `${COMPONENT_LABELS[k]} (weight ${DEFAULT_WEIGHTS[k]}%)`,
            kind: "Score component",
            average: round1(mean(vals)),
            students: vals.length,
          };
        });
        const fired = new Map();
        for (const r of rows)
          for (const d of [...academicRisk(r.s).drivers, ...placementRisk(r.s).drivers])
            fired.set(d.signal, (fired.get(d.signal) ?? 0) + 1);
        const signals = [...fired.entries()]
          .map(([signal, students]) => ({
            signal,
            kind: "Risk signal",
            average: null,
            students,
          }))
          .sort((a, b) => b.students - a.students);
        const all = [
          ...components.sort((a, b) => (a.average ?? 101) - (b.average ?? 101)),
          ...signals,
        ];
        const t = table(all, 30);
        const evidenceId = record({
          tool: "score_drivers",
          title: "What is driving scores and risk",
          description: `${rows.length} student(s) — ${describeFilters(filters)}. Component averages are out of 100; risk signals show how many students trigger them.`,
          columns: [
            { key: "signal", label: "Indicator" },
            { key: "kind", label: "Type" },
            { key: "average", label: "Average (0–100)", kind: "score" },
            { key: "students", label: "Students", kind: "number" },
          ],
          rows: t.shown,
          total: t.total,
        });
        return { evidenceId, studentsMatched: rows.length, indicators: t.shown };
      },
    }),

    student_profile: tool({
      description:
        "Everything known about one student: score components, active risk signals, subject marks and attendance, and the platform's own recommended actions. The student must be one the caller can see.",
      inputSchema: z.object({
        student: z.string().describe("Student id (e.g. a roll number) or exact name"),
      }),
      execute: async ({ student }) => {
        const q = student.trim().toLowerCase();
        const matches = scope.rows.filter(
          (r) => r.id.toLowerCase() === q || r.name.toLowerCase() === q,
        );
        if (matches.length !== 1)
          return {
            error:
              matches.length === 0
                ? "No student with that id or name is in scope."
                : "That name matches several students; use the student id.",
          };
        const r = matches[0];
        const comps = componentScores(r.s);
        const acad = academicRisk(r.s);
        const place = placementRisk(r.s);
        const rows = [
          ...Object.keys(COMPONENT_LABELS).map((k) => ({
            area: "Score component",
            item: COMPONENT_LABELS[k],
            value: comps[k] === null ? "No data" : `${round1(comps[k])}/100`,
          })),
          ...[...acad.drivers, ...place.drivers].map((d) => ({
            area: "Risk signal",
            item: d.signal,
            value: String(d.value),
          })),
          ...r.s.subjects.map((x) => ({
            area: "Subject",
            item: x.subject,
            value: `${x.marks}/100 marks · ${x.classesAttended}/${x.classesHeld} classes`,
          })),
        ];
        const recs = recommendations(r.s);
        const evidenceId = record({
          tool: "student_profile",
          title: `${r.name} (${r.id})`,
          description: `${r.branch}, semester ${r.semester} · Score ${r.score ?? "n/a"} · ${r.band ?? "No data yet"} · Academic risk ${r.academicRisk} · Placement risk ${r.placementRisk}`,
          columns: [
            { key: "area", label: "Area" },
            { key: "item", label: "Item" },
            { key: "value", label: "Value" },
          ],
          rows: rows.slice(0, 40),
          total: rows.length,
          studentId: r.id,
        });
        return {
          evidenceId,
          name: r.name,
          score: r.score,
          band: r.band,
          attendance: round1(r.attendance),
          cgpa: round2(r.cgpa),
          backlogs: r.s.backlogs,
          detail: rows.slice(0, 40),
          platformRecommendations: recs,
        };
      },
    }),

    support_actions: tool({
      description:
        "Status of mentor interventions (support actions): how many are open, in progress, resolved or overdue, and the open ones with their follow-up dates. Use it for 'what are we already doing' questions.",
      inputSchema: z.object({
        status: z.enum(["open", "in-progress", "resolved", "any"]).default("any"),
        overdueOnly: z.boolean().default(false),
      }),
      execute: async ({ status, overdueOnly }) => {
        const names = new Map(scope.rows.map((r) => [r.id, r.name]));
        const list = scope.interventions
          .filter((i) => status === "any" || i.status === status)
          .filter((i) => !overdueOnly || (i.status !== "resolved" && i.follow_up_date < today));
        const counts = Object.fromEntries(
          ["open", "in-progress", "resolved"].map((s) => [
            s,
            scope.interventions.filter((i) => i.status === s).length,
          ]),
        );
        const overdue = scope.interventions.filter(
          (i) => i.status !== "resolved" && i.follow_up_date < today,
        ).length;
        const t = table(
          list.map((i) => ({
            student: names.get(i.student_id) ?? i.student_id,
            priority: i.priority,
            status: i.status,
            followUp: i.follow_up_date,
            overdue: i.status !== "resolved" && i.follow_up_date < today ? "Yes" : "No",
            action: i.action,
          })),
        );
        const evidenceId = record({
          tool: "support_actions",
          title: "Support actions",
          description: `Open ${counts.open} · In progress ${counts["in-progress"]} · Resolved ${counts.resolved} · Overdue follow-ups ${overdue}`,
          columns: [
            { key: "student", label: "Student" },
            { key: "priority", label: "Priority" },
            { key: "status", label: "Status" },
            { key: "followUp", label: "Follow-up" },
            { key: "overdue", label: "Overdue" },
            { key: "action", label: "Planned action" },
          ],
          rows: t.shown,
          total: t.total,
        });
        return { evidenceId, counts, overdue, actions: t.shown };
      },
    }),
  };
}

const instructions = (
  scope,
  count,
  today,
) => `You are the Analytics Copilot inside BIB InsightIQ, helping a dean or teacher understand student performance. Today is ${today}. You can see ${count} student record(s): ${scope}.

Rules:
- Ground every statement in tool results. Call the tools to get numbers; never guess, estimate or use outside knowledge about these students. Call several tools if the question needs it.
- If the data cannot answer the question (no matching students, too little data, or a topic the tools do not cover), say so plainly and say what data would be needed. Do not invent anything.
- Cite evidence: after each claim that rests on a tool result, add its evidence id in square brackets, such as [E1]. Use only ids the tools returned.
- Reply in clear markdown, short: a direct answer first (1-3 sentences), then at most 5 bullet points with the key figures, then a "**Recommended actions**" list with 2-4 concrete, practical steps a mentor can take, naming students or groups where the evidence supports it.
- Scores are the Success Score out of 100 (bands: On Track >= 80, Monitor >= 65, Needs Attention >= 50, High Priority below 50). Attendance below 75% is a shortage. Missing data is not zero.
- You only advise; you cannot change records. Treat student information as confidential and answer only what was asked.`;

/** A short, honest reason the model call failed, without provider internals. */
const modelFailure = (error) => {
  const status = error?.statusCode ?? error?.lastError?.statusCode;
  if (status === 429)
    return "The AI provider's usage limit has been reached. Please try again later or ask an administrator to check the LLM quota.";
  if (status === 401 || status === 403)
    return "The AI provider rejected the configured key. Ask an administrator to check LLM_API_KEY.";
  return "The Copilot could not reach the AI provider. Please try again in a moment.";
};

const history = (messages) =>
  messages.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

/** Runs one question end to end. Returns the answer text and the evidence it was built on. */
/** The models to try, in order: the main provider, then Grok (xAI) as a fallback if it is set. */
export function modelChain(env = process.env) {
  const chain = [];
  if (env["LLM_API_KEY"])
    chain.push({
      name: "primary",
      apiKey: env["LLM_API_KEY"],
      baseURL: env["LLM_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: env["LLM_MODEL"] ?? "gemini-2.5-flash",
    });
  if (env["GROK_API_KEY"])
    chain.push({
      name: "grok",
      apiKey: env["GROK_API_KEY"],
      baseURL: env["GROK_BASE_URL"] ?? "https://api.x.ai/v1",
      model: env["GROK_MODEL"] ?? "grok-4",
    });
  return chain;
}

export async function askCopilot(db, user, { question, messages = [] }, today) {
  const chain = modelChain();
  if (!chain.length)
    throw new Error(
      "The Analytics Copilot is not configured yet. Ask an administrator to set LLM_API_KEY.",
    );
  const text = question.trim().slice(0, MAX_QUESTION);
  const scope = await loadScope(db, user, today);
  let evidence = [];
  let result;
  let failure;
  for (const cfg of chain) {
    // Each attempt starts with clean evidence so a failed try leaves nothing behind.
    evidence = [];
    try {
      const provider = createOpenAICompatible({
        name: cfg.name,
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
      });
      result = await generateText({
        model: provider.chatModel(cfg.model),
        instructions: instructions(scope.scope, scope.rows.length, today),
        messages: [...history(messages), { role: "user", content: text }],
        tools: buildTools(scope, today, evidence),
        stopWhen: isStepCount(6),
        temperature: 0.2,
      });
      if (result.text.trim()) break;
      failure = new Error("empty answer");
    } catch (error) {
      failure = error;
    }
    console.error(
      `[copilot] ${cfg.name} (${cfg.model}) failed`,
      failure?.lastError?.statusCode ?? failure?.statusCode,
      failure?.lastError?.message ?? failure?.message,
    );
    result = undefined;
  }
  if (!result) throw new Error(modelFailure(failure));
  const answer = result.text.trim();
  if (!answer) throw new Error("The Copilot could not produce an answer. Please rephrase.");
  // Only evidence the answer cites is shown first; anything else the model looked at follows.
  const cited = new Set(answer.match(/E\d+/g) ?? []);
  const ordered = [
    ...evidence.filter((e) => cited.has(e.id)),
    ...evidence.filter((e) => !cited.has(e.id)),
  ].map((e) => ({ ...e, cited: cited.has(e.id) }));
  return {
    answer,
    evidence: ordered,
    scope: { students: scope.rows.length, label: scope.scope },
    answeredAt: new Date().toISOString(),
  };
}

/** What a person might ask first; the counts come from their own records so none is a dead end. */
export async function suggestions(db, user, today) {
  const { rows, scope } = await loadScope(db, user, today);
  const branches = [...new Set(rows.map((r) => r.branch))].filter(Boolean);
  const list = [
    "Which students need attention first, and why?",
    "Which students have attendance below 75%?",
    "What is dragging down Success Scores the most?",
    "What support actions are overdue?",
  ];
  if (branches.length > 1) list.splice(2, 0, "Compare branches by average score and attendance.");
  return { students: rows.length, scope, branches, list: list.slice(0, 5) };
}
