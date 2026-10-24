// Decides which lookups answer a question, from the person's role and what they asked. This is
// plain code, not a model: the server fetches the data first and the model only has to put it
// into words, so one question costs one model request (and still works, in plain wording, when no
// model is reachable). Follow-ups such as "and for CSE?" are read together with the previous
// question.

const has = (text, re) => re.test(text);
const FOLLOW_UP =
  /^(and|also|what about|how about|why|then|so|ok(ay)?|what else|more|which one|those|them|that|it)\b/i;

/** The question to read for intent: a short follow-up is joined to the one before it. */
export function contextOf(text, history = []) {
  const t = String(text ?? "").trim();
  const previous = [...history].reverse().find((m) => m.role === "user")?.text ?? "";
  const words = t.split(/\s+/).length;
  const refersBack = /\b(there|that|those|them|it|they|him|her|same|again|instead|too)\b/i.test(t);
  // Only a follow-up borrows the earlier question; a new short question stands on its own.
  const short = words <= 3 || FOLLOW_UP.test(t) || (refersBack && words <= 8);
  return short && previous ? `${previous} ${t}` : t;
}

const numberAfter = (text, re) => {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
};

/** Branch and year mentioned in the question, if any, matched against the branches that exist. */
export function filtersOf(text, branches = []) {
  const lower = text.toLowerCase();
  const branch =
    branches.find((b) =>
      new RegExp(`\\b${b.toLowerCase().replace(/[^a-z0-9]/g, "")}\\b`).test(
        lower.replace(/[^a-z0-9 ]/g, ""),
      ),
    ) ?? null;
  const ordinal = { first: 1, second: 2, third: 3, fourth: 4, final: 4 };
  const word = Object.keys(ordinal).find((w) => new RegExp(`\\b${w}[- ]year\\b`).test(lower));
  const year =
    numberAfter(lower, /\byear\s*([1-5])\b/) ??
    numberAfter(lower, /\b([1-5])(?:st|nd|rd|th)\s*year\b/) ??
    (word ? ordinal[word] : null);
  return { ...(branch ? { branch } : {}), ...(year ? { year } : {}) };
}

/** Students (from the ones this person may see) whose name or ID is mentioned. */
export function namedStudents(text, roster = []) {
  const lower = text.toLowerCase();
  return roster
    .filter(
      (s) =>
        lower.includes(s.id.toLowerCase()) ||
        (s.name && s.name.length > 3 && lower.includes(s.name.toLowerCase())),
    )
    .slice(0, 2);
}

function studentPlan(t) {
  const out = [];
  const add = (tool) => out.includes(tool) || out.push(tool);
  if (
    has(
      t,
      /placement|placed|drive|compan|job|interview|leetcode|resume|aptitude|coding|career|hir(e|ing)|employab|offer/,
    )
  ) {
    add("my_placement");
    add("my_predictions");
  }
  if (
    has(
      t,
      /predict|forecast|risk|likel|expect|will i|chance|what if|improve|raise|increase|boost|better|reach|get to/,
    )
  )
    add("my_predictions");
  if (has(t, /attend|class(es)?\b|absent|\b75\b|short(age)?|detain|barred|miss/))
    add("my_subjects");
  if (
    has(
      t,
      /subject|marks?|grade|sgpa|cgpa|exam|result|backlog|fail|pass|weak|strong|best|worst|lowest|highest/,
    )
  ) {
    add("my_subjects");
    add("my_overview");
  }
  if (
    has(
      t,
      /assignment|deadline|due|pending|alert|todo|task|what should i|next step|focus|prioriti|plan|advice|suggest|recommend|urgent/,
    )
  )
    add("my_attention");
  if (has(t, /support|intervention|mentor|follow.?up/)) add("my_support");
  if (
    has(
      t,
      /overall|how am i|doing|summary|progress|standing|success score|band|status|overview|where do i stand/,
    )
  )
    add("my_overview");
  if (!out.length) add("my_overview");
  return out.slice(0, 3).map((tool) => ({ tool, input: {} }));
}

function staffPlan(t, { role, roster, branches }) {
  const out = [];
  const add = (tool, input = {}) =>
    out.some((o) => o.tool === tool && JSON.stringify(o.input) === JSON.stringify(input)) ||
    out.push({ tool, input });
  const filters = filtersOf(t, branches);
  const named = namedStudents(t, roster);
  for (const s of named) add("student_detail", { student: s.id });

  const wantsDepartments =
    role === "admin" &&
    has(t, /department|branch|\bdept\b|each (branch|department)|compare|across/);
  const wantsTeachers =
    role === "admin" && has(t, /teacher|mentor|faculty|workload|load\b/) && !named.length;
  if (wantsTeachers) add("teacher_workload");
  if (wantsDepartments && !wantsTeachers)
    add(
      "department_comparison",
      has(t, /predict|forecast|likely|expected/) ? { includePredictions: true } : {},
    );

  if (has(t, /overdue|follow.?up|intervention|support action/))
    add("support_actions", { overdueOnly: has(t, /overdue/), limit: 10 });

  const limit =
    numberAfter(t, /\b(?:top|highest|worst|first|show|list)\s+(\d{1,2})\b/) ??
    numberAfter(t, /\b(\d{1,2})\s+(?:highest|worst|most|students)/);
  const predictive = has(
    t,
    /predict|forecast|predicted|likely|risk level|highest.*risk|top.*risk|risk.*(rank|list)/,
  );
  if (predictive) {
    add("predicted_risk", {
      kind: has(t, /placement|employab|job|interview/)
        ? "placement"
        : has(t, /result|marks|exam|fail|sgpa/)
          ? "result"
          : "overall",
      ...filters,
      ...(limit ? { limit: Math.min(20, limit) } : {}),
    });
  }

  if (has(t, /attend|below 75|\b75\b|absent|short(age)?/) && !wantsTeachers)
    add("find_students", { lowAttendance: true, ...filters, limit: 10 });

  const strongAcademics = has(
    t,
    /(good|high|strong|great|decent|above)\s+(cgpa|grades|marks|academics)|cgpa.*(good|high|above)|\d\.?\d*\+?\s*cgpa|but.*(low|weak|poor)/,
  );
  const placementTopic = has(
    t,
    /placement|employab|job|coding|leetcode|aptitude|resume|interview|career|ready/,
  );
  if (strongAcademics && placementTopic) {
    const min =
      numberAfter(t, /(\d\.?\d*)\+?\s*cgpa/) ??
      numberAfter(t, /cgpa\s*(?:above|over|of|>=?)\s*(\d\.?\d*)/) ??
      7.5;
    add("find_students", { minCgpa: min, placementRisk: "High", ...filters, limit: 10 });
    add("find_students", { minCgpa: min, placementRisk: "Medium", ...filters, limit: 10 });
  } else if (placementTopic && !predictive) {
    add("find_students", { placementRisk: "High", ...filters, limit: 10 });
  }

  if (
    has(
      t,
      /at.?risk|attention|struggl|help|worst|priority|danger|weak|failing|low (score|marks|cgpa)|backlog|concern/,
    ) &&
    !predictive &&
    !wantsTeachers
  )
    add("find_students", { atRiskOnly: true, ...filters, limit: limit ?? 10 });

  if (
    has(
      t,
      /overview|summary|class|how is|how are|campus|total|how many|average|status|breakdown|distribution/,
    ) ||
    (wantsDepartments && Object.keys(filters).length)
  )
    add("class_overview", filters);

  if (!out.length) {
    add("class_overview", filters);
    add("find_students", { atRiskOnly: true, ...filters, limit: 8 });
  }
  return out.slice(0, 4);
}

/**
 * The lookups to run for this question: [{ tool, input }]. `roster` is the students this person may
 * see (names and IDs) and `branches` the departments that exist, both from the server.
 */
export function planLookups({ role, text, history = [], roster = [], branches = [] }) {
  if (role === "visitor") return [];
  const t = contextOf(text, history).toLowerCase();
  // A named student in the question itself always counts, even when the rest is a follow-up.
  return role === "student"
    ? studentPlan(t)
    : staffPlan(`${t} ${String(text).toLowerCase()}`, { role, roster, branches });
}
