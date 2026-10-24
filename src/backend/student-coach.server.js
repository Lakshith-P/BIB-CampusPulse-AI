import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import { ownStudent } from "./access.server.js";
import { modelChain, modelFailure } from "./copilot.server.js";
import { getStudentPrediction } from "./predictions.server.js";
import { studentSchema } from "@/lib/student-validation";
import { recommendations } from "@/lib/scoring";
import {
  GROUP_LABEL,
  METRICS,
  MIN_GROUP,
  MIN_LIST,
  bestGroup,
  improvementPlan,
  rankingOverview,
  standing,
  studentsAhead,
  toPeer,
  withMe,
} from "@/lib/peer-benchmark";

// The student's coach on the Predictive Risk & AI page. A student asks in plain language how they
// compare with classmates, their branch and the whole university, who is ahead and what that
// student does differently, and what to do to improve. Like the Analytics Copilot, a model calls
// fixed read-only tools and every table it used is returned beside the answer.
//
// Privacy: other students are never named. Comparisons are aggregates over groups of at least
// MIN_GROUP students, and "who is ahead" is a list of anonymous profiles (a letter, figures rounded
// to 5) from groups of at least MIN_LIST. The model is given the same anonymous data and nothing else.

const MAX_QUESTION = 600;
const COHORT_TTL = 60_000; // short, so rankings follow new marks and attendance within a minute
const cache = { at: 0, peers: null };
export const resetCoachCache = () => {
  cache.at = 0;
  cache.peers = null;
};

/** The lesson and assignment counts of a record, as a small LMS structure with the same totals. */
function compactLms({ lessons_total: lt, lessons_done: ld, assign_total: at, assign_done: ad }) {
  if (!lt && !at) return [];
  const lesson = (i) => ({ title: "l", completed: i < ld, resource: "" });
  const unit = (n, lessons, submitted, assignment = true) => ({
    unit: n,
    title: "u",
    lessons,
    assignment: {
      title: assignment ? "a" : "—",
      deadline: "2099-01-01",
      submitted,
      marks: null,
    },
  });
  const units = [
    unit(
      1,
      Array.from({ length: lt }, (_, i) => lesson(i)),
      ad > 0,
      at > 0,
    ),
  ];
  for (let i = 1; i < at; i++) units.push(unit(i + 1, [], i < ad));
  return [{ subject: "All", units }];
}

/**
 * Every student, as compact records with no name: names, feedback and the full LMS content are
 * left out in SQL, so little data crosses the wire. Kept for a few minutes because it is the same
 * for everyone and changes slowly.
 */
export async function loadPeers(db) {
  if (cache.peers && Date.now() - cache.at < COHORT_TTL) return cache.peers;
  const { rows } = await db.query(
    `SELECT sr.id,
            sr.record - 'lms' - 'facultyFeedback' - 'studentFeedback' - 'name' AS record,
            (SELECT count(*)::int FROM jsonb_array_elements(coalesce(sr.record->'lms','[]'::jsonb)) sub,
                    jsonb_array_elements(sub->'units') u, jsonb_array_elements(u->'lessons') l) AS lessons_total,
            (SELECT count(*)::int FROM jsonb_array_elements(coalesce(sr.record->'lms','[]'::jsonb)) sub,
                    jsonb_array_elements(sub->'units') u, jsonb_array_elements(u->'lessons') l
              WHERE (l->>'completed')::boolean) AS lessons_done,
            (SELECT count(*)::int FROM jsonb_array_elements(coalesce(sr.record->'lms','[]'::jsonb)) sub,
                    jsonb_array_elements(sub->'units') u WHERE u->'assignment'->>'title' <> '—') AS assign_total,
            (SELECT count(*)::int FROM jsonb_array_elements(coalesce(sr.record->'lms','[]'::jsonb)) sub,
                    jsonb_array_elements(sub->'units') u
              WHERE u->'assignment'->>'title' <> '—' AND (u->'assignment'->>'submitted')::boolean) AS assign_done
       FROM student_records sr ORDER BY sr.id`,
  );
  const peers = rows.flatMap((row) => {
    const parsed = studentSchema.safeParse({
      ...row.record,
      id: row.id,
      name: "-",
      facultyFeedback: [],
      studentFeedback: [],
      mentorId: row.record.mentorId ?? "",
      lms: compactLms(row),
    });
    return parsed.success ? [toPeer(row.id, parsed.data)] : [];
  });
  cache.peers = peers;
  cache.at = Date.now();
  return peers;
}

const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const group = z
  .enum(["class", "branch", "university"])
  .default("class")
  .describe(
    "class = same branch and semester, branch = same branch in every semester, university = all students",
  );
const metric = z
  .enum(Object.keys(METRICS))
  .default("score")
  .describe(
    "score = Success Score, academics = CGPA x 10, attendance, lms, engagement, skills, placement, coding, aptitude",
  );

/** The student's own record in the same compact form, plus their full record for advice. */
async function loadMe(db, user) {
  const own = await ownStudent(db, user);
  if (!own)
    throw new Error("The coach appears once your student record is linked to your account.");
  const full = studentSchema.parse(own.record);
  return { own, full, me: toPeer(own.id, full) };
}

/** Builds the tools for one question. `evidence` collects the tables each tool returned. */
export function buildCoachTools({ me, full, peers, prediction }, evidence) {
  const record = (entry) => {
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, ...entry });
    return id;
  };
  const cols = [
    { key: "measure", label: "Measure" },
    { key: "mine", label: "You", kind: "score" },
    { key: "median", label: "Typical student", kind: "score" },
    { key: "top25", label: "Top quarter", kind: "score" },
    { key: "top10", label: "Top 10%", kind: "score" },
    { key: "rank", label: "Your rank" },
    { key: "better", label: "Ahead of (% of students)", kind: "score" },
  ];

  return {
    my_standing: tool({
      description:
        "Where the student stands: their Success Score and each score component against the typical student, the top quarter and the top 10% of their class, branch or the whole university, with their rank and the share of students they are ahead of.",
      inputSchema: z.object({ group }),
      execute: async ({ group: g }) => {
        const rows = [
          "score",
          "academics",
          "attendance",
          "lms",
          "engagement",
          "skills",
          "placement",
        ]
          .map((k) => ({ k, s: standing(me, peers, g, k) }))
          .filter(({ s }) => !s.noData && !s.tooSmall);
        const first = standing(me, peers, g, "score");
        if (first.tooSmall)
          return {
            error: `Only ${first.size} student(s) are in ${GROUP_LABEL[g]}, too few to compare safely. Try a bigger group.`,
          };
        const evidenceId = record({
          tool: "my_standing",
          title: `Your standing in ${GROUP_LABEL[g]}`,
          description: `${first.size} students · rank and ranges are for each measure out of 100`,
          columns: cols,
          rows: rows.map(({ k, s }) => ({
            measure: METRICS[k],
            mine: s.mine,
            median: s.median,
            top25: s.top25,
            top10: s.top10,
            rank: `${s.rank} of ${s.of}`,
            better: s.percentile,
          })),
          total: rows.length,
        });
        return {
          evidenceId,
          group: GROUP_LABEL[g],
          size: first.size,
          measures: rows.map((r) => r.s),
        };
      },
    }),

    compare_on_measure: tool({
      description:
        "Compare the student with a group on ONE measure (for example attendance, CGPA, coding or placement readiness): their value, the typical student, the top quarter, the top 10%, the best, their rank and how many students are ahead.",
      inputSchema: z.object({ group, metric }),
      execute: async ({ group: g, metric: m }) => {
        const s = standing(me, peers, g, m);
        if (s.tooSmall)
          return {
            error: `Only ${s.size} student(s) are in ${GROUP_LABEL[g]}, too few to compare safely.`,
          };
        if (s.noData) return { error: `There is no recorded ${METRICS[m]} to compare yet.` };
        const evidenceId = record({
          tool: "compare_on_measure",
          title: `${METRICS[m]} in ${GROUP_LABEL[g]}`,
          description: `${s.size} students · ${s.ahead} are ahead of you`,
          columns: [
            ...cols.slice(0, 5),
            { key: "best", label: "Best", kind: "score" },
            { key: "rank", label: "Your rank" },
          ],
          rows: [
            {
              measure: METRICS[m],
              mine: s.mine,
              median: s.median,
              top25: s.top25,
              top10: s.top10,
              best: s.best,
              rank: `${s.rank} of ${s.of}`,
            },
          ],
          total: 1,
        });
        return { evidenceId, ...s };
      },
    }),

    students_ahead: tool({
      description: `Search for the students who are better than the student on a measure, in their class, branch or the university: the ones just ahead of them, closest first, as ANONYMOUS profiles (Student A, B ...) with figures rounded to the nearest 5, so the student can see what those ahead do differently. Names and IDs are never available. Needs a group of at least ${MIN_LIST} students.`,
      inputSchema: z.object({ group, metric, limit: z.number().int().min(1).max(8).default(5) }),
      execute: async ({ group: g, metric: m, limit }) => {
        const r = studentsAhead(me, peers, g, m, limit);
        if (r.tooSmall)
          return {
            error: `Only ${r.size} student(s) are in ${GROUP_LABEL[g]}; profiles are shown only for groups of ${MIN_LIST} or more.`,
          };
        if (r.noData) return { error: `There is no recorded ${METRICS[m]} to compare yet.` };
        if (!r.list.length)
          return { message: `Nobody in ${GROUP_LABEL[g]} is ahead of you on ${METRICS[m]}.` };
        const evidenceId = record({
          tool: "students_ahead",
          title: `Students ahead of you on ${METRICS[m]} (${GROUP_LABEL[g]})`,
          description: `${r.total} students are ahead; the closest ${r.list.length} are shown without names, figures rounded to the nearest 5`,
          columns: [
            { key: "label", label: "Student" },
            { key: "measure", label: METRICS[m], kind: "score" },
            { key: "score", label: "Success Score", kind: "score" },
            { key: "academics", label: "Academics", kind: "score" },
            { key: "attendance", label: "Attendance", kind: "score" },
            { key: "lms", label: "LMS", kind: "score" },
            { key: "skills", label: "Skills", kind: "score" },
            { key: "placement", label: "Placement", kind: "score" },
          ],
          rows: r.list,
          total: r.total,
        });
        return { evidenceId, totalAhead: r.total, profiles: r.list };
      },
    }),

    improvement_plan: tool({
      description:
        "The student's ranked improvement plan: for each score component, the gap to the top quarter of the best comparable group, how many Success Score points closing it would add, and a concrete action with their own numbers. Also the platform's standard recommendations for them.",
      inputSchema: z.object({}),
      execute: async () => {
        const plan = improvementPlan(me, peers);
        if (!plan.group) return { error: "There is no group big enough to compare with yet." };
        const evidenceId = record({
          tool: "improvement_plan",
          title: "Where to improve first",
          description: `Compared with the top quarter of ${plan.label}. Gain is the Success Score points added by closing the gap.`,
          columns: [
            { key: "label", label: "Area" },
            { key: "mine", label: "You", kind: "score" },
            { key: "median", label: "Typical", kind: "score" },
            { key: "top25", label: "Top quarter", kind: "score" },
            { key: "gain", label: "Points to gain", kind: "number" },
            { key: "advice", label: "What to do" },
          ],
          rows: plan.items,
          total: plan.items.length,
        });
        return { evidenceId, ...plan, platformRecommendations: recommendations(full) };
      },
    }),

    my_predictions: tool({
      description:
        "The student's own predicted placement score, predicted marks and SGPA per subject, their risk level and the reasons.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!prediction) return { error: "Predictions are not available yet." };
        const p = prediction;
        const evidenceId = record({
          tool: "my_predictions",
          title: "Your predictions",
          description: `Risk level ${p.risk.level}. Placement ${p.placement.score ?? "n/a"} (${p.placement.band}); predicted SGPA ${p.result.predictedSgpa ?? "n/a"}`,
          columns: [
            { key: "subject", label: "Subject" },
            { key: "predicted", label: "Predicted marks", kind: "score" },
            { key: "outlook", label: "Outlook" },
            { key: "attendance", label: "Attendance", kind: "percent" },
          ],
          rows: p.result.subjects.map((s) => ({
            subject: s.subject,
            predicted: s.predicted,
            outlook: s.outlook,
            attendance: s.attendance,
          })),
          total: p.result.subjects.length,
        });
        return {
          evidenceId,
          risk: p.risk,
          placement: {
            score: p.placement.score,
            band: p.placement.band,
            projected: p.placement.projected,
          },
          result: {
            score: p.result.score,
            predictedSgpa: p.result.predictedSgpa,
            band: p.result.band,
          },
          topActions: p.actions.slice(0, 4).map((a) => a.title),
        };
      },
    }),
  };
}

const instructions = (
  today,
) => `You are the personal coach of one student inside SLQG. Today is ${today}. You help the student see how they compare with other students and what to do to improve.

Rules:
- Use the tools to get numbers; never guess. Call several tools when the question needs it (for example my_standing and improvement_plan).
- Other students are anonymous. You never know, guess or reveal a name, ID, email or any detail that could identify a student. If asked who someone is, or for names, say the platform keeps other students anonymous and offer an anonymous comparison instead. Do not try to work out who a profile is.
- Cite the evidence: after each claim that rests on a tool result add its id in square brackets, such as [E1]. Use only ids the tools returned.
- Reply in short markdown: a direct answer first (1-3 sentences), then at most 5 bullet points with the figures, then a "**Recommended actions**" list of 2-4 concrete steps using the student's own numbers (classes to attend, topics to practise, points gained).
- Be encouraging and fair: say where they are strong as well as where they can improve. A rank is a snapshot, not a verdict.
- Scores are the Success Score out of 100 (On Track 80+, Monitor 65-79, Needs Attention 50-64, High Priority below 50). Missing data is not zero.
- If the data cannot answer the question (a group too small, nothing recorded), say so and say what is missing. You only advise; you cannot change records.`;

const history = (messages) =>
  messages.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

/** A plain answer built from the same numbers, for when no AI model can be reached. */
export function fallbackAnswer({ me, peers }) {
  const g = bestGroup(me, peers);
  if (!g)
    return "There are not enough students to compare with yet. Comparisons start once at least 5 students have records.";
  const s = standing(me, peers, g, "score");
  const plan = improvementPlan(me, peers, 3);
  const lines = [
    s.noData || s.tooSmall
      ? `Your Success Score is not available yet, so there is nothing to compare.`
      : `In ${GROUP_LABEL[g]} you rank **${s.rank} of ${s.of}** on the Success Score, ahead of **${s.percentile}%** of students (yours ${s.mine}, typical ${s.median}, top quarter ${s.top25}).`,
  ];
  if (plan.items.length) {
    lines.push("", "**Recommended actions**");
    for (const item of plan.items) lines.push(`- ${item.advice} (about +${item.gain} points)`);
  }
  lines.push(
    "",
    "_The AI assistant could not be reached, so this is a plain summary of the numbers._",
  );
  return lines.join("\n");
}

/** One question, end to end. Returns the answer and the tables it was built on. */
export async function askCoach(db, user, { question, messages = [] }, today, deps = {}) {
  const text = question.trim().slice(0, MAX_QUESTION);
  const { full, me } = await loadMe(db, user);
  const peers = withMe(await loadPeers(db), me);
  const prediction = await getStudentPrediction(db, user).catch(() => null);
  const chain = deps.chain ?? modelChain();
  const run = deps.generate ?? generateText;

  let evidence = [];
  let result;
  let failure;
  for (const cfg of chain) {
    evidence = []; // a failed try leaves nothing behind
    try {
      const provider = createOpenAICompatible({
        name: cfg.name,
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
      });
      result = await run({
        model: provider.chatModel(cfg.model),
        instructions: instructions(today),
        messages: [...history(messages), { role: "user", content: text }],
        tools: buildCoachTools({ me, full, peers, prediction }, evidence),
        stopWhen: isStepCount(6),
        temperature: 0.2,
      });
      if (result.text.trim()) break;
      failure = new Error("empty answer");
    } catch (error) {
      failure = error;
    }
    console.error(
      `[coach] ${cfg.name} (${cfg.model}) failed`,
      failure?.lastError?.statusCode ?? failure?.statusCode,
    );
    result = undefined;
  }

  let answer = result?.text.trim();
  let note = null;
  if (!answer) {
    // No model, or it failed: still give the student their numbers and a plan.
    evidence = [];
    const tools = buildCoachTools({ me, full, peers, prediction }, evidence);
    await tools.my_standing.execute({ group: bestGroup(me, peers) ?? "university" }, {});
    await tools.improvement_plan.execute({}, {});
    answer = fallbackAnswer({ me, peers });
    note = chain.length
      ? modelFailure(failure)
      : "The AI assistant is not set up on this server, so this is a plain summary of your numbers.";
    answer = answer.replace(/\[E\d+\]/g, "");
    answer += "\n\nSee the tables below. [E1][E2]";
  }
  const cited = new Set(answer.match(/E\d+/g) ?? []);
  const ordered = [
    ...evidence.filter((e) => cited.has(e.id)),
    ...evidence.filter((e) => !cited.has(e.id)),
  ].map((e) => ({ ...e, cited: cited.has(e.id) }));
  return {
    answer,
    evidence: ordered,
    note,
    group: { students: peers.length },
    answeredAt: new Date().toISOString(),
  };
}

/** The student's position in their class, branch and the whole university, worked out now. */
export async function myRanking(db, user) {
  const { me } = await loadMe(db, user);
  const peers = withMe(await loadPeers(db), me);
  return {
    ...rankingOverview(me, peers),
    students: peers.length,
    updatedAt: new Date().toISOString(),
  };
}

/** What a student might ask first, written from their own situation. */
export async function coachSuggestions(db, user) {
  const { me } = await loadMe(db, user);
  const peers = withMe(await loadPeers(db), me);
  const g = bestGroup(me, peers);
  const list = [
    "How do I compare with my class?",
    "Who is better than me in attendance, and what do they do differently?",
    "Where do I rank in the whole university?",
    "What should I improve first to raise my score?",
    "Compare my coding and aptitude with the top students.",
  ];
  return { students: peers.length, group: g ? GROUP_LABEL[g] : null, minGroup: MIN_GROUP, list };
}
