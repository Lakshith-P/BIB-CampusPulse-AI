const cell = (v) => {
  const text = v === null || v === undefined ? "" : String(v);
  // Quote anything with a comma, quote or newline, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Turns the student list shown on screen into CSV text a spreadsheet can open. */
export function studentsToCsv(rows) {
  const head = [
    "student_id",
    "name",
    "branch",
    "semester",
    "year",
    "course",
    "section",
    "gender",
    "success_score",
    "status",
    "cgpa",
    "attendance_pct",
    "lms_pct",
    "academic_risk",
    "placement_risk",
    "alerts",
    "segment",
    "teacher",
  ];
  const num = (v, d = 1) => (v === null ? "" : v.toFixed(d));
  const lines = rows.map((r) =>
    [
      r.id,
      r.name,
      r.branch,
      r.semester,
      r.year ?? "",
      r.course ?? "",
      r.section ?? "",
      r.gender ?? "",
      num(r.score, 0),
      r.band ?? "",
      num(r.cgpa, 2),
      num(r.attendance),
      num(r.lms),
      r.academicRisk,
      r.placementRisk,
      r.alerts,
      r.segment,
      r.mentorName,
    ]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n");
}

export const CSV_TEMPLATE = `student_id,name,gender,course,branch,section,semester,grad_year,cgpa,sgpa_history,backlogs,subjects,lms_logins_per_week,lms_lessons_pct,lms_assignments_pct,events,clubs,hackathons,certifications,coding,aptitude,analytical,verbal,communication,mock_interviews,resume_completeness,assessments_done,assessments_required,satisfaction
S-1001,Asha Rao,Female,B.Tech,CSE,A,5,2027,8.2,7.8;8.0;8.2,0,Maths:78:40:36;Physics:72:40:34;DBMS:85:40:38,5,80,70,3,1,1,2,70,65,72,68,75,2,80,3,4,4
S-1002,Ravi Kumar,Male,B.Tech,CSE,A,5,2027,7.4,8.1;7.8;7.4,1,Maths:55:40:28;Physics:61:40:30;DBMS:70:40:33,2,40,50,0,0,0,0,60,58,62,55,64,0,70,1,4,3
`;
const GENDERS = { m: "Male", male: "Male", f: "Female", female: "Female" };
const REQUIRED = ["student_id", "name", "branch", "semester", "grad_year", "cgpa"];
const today = () => new Date().toISOString().slice(0, 10);

/** "Maths:78:40:36;Physics:72:40:34" -> subject, marks, classes held, classes attended. */
function parseSubjects(text, errors) {
  const out = [];
  for (const part of text
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [subject, marks, held, attended] = part.split(":").map((x) => x.trim());
    const m = parseFloat(marks);
    const h = parseInt(held);
    const a = parseInt(attended);
    if (!subject || [m, h, a].some(isNaN) || m < 0 || m > 100 || h < 0 || a < 0 || a > h) {
      errors.push(`subjects: "${part}" must look like Subject:marks:held:attended`);
      continue;
    }
    out.push({ subject, marks: m, classesHeld: h, classesAttended: a });
  }
  return out;
}

/** Percentages are stored as ten lesson/assignment slots, so they are kept to the nearest 10%. */
function lmsFromPercent(lessonsPct, assignPct) {
  const lessonsDone = Math.round(lessonsPct / 10);
  const assignDone = Math.round(assignPct / 10);
  return [
    {
      subject: "Imported LMS summary",
      units: Array.from({ length: 10 }, (_, i) => ({
        unit: i + 1,
        title: `Slot ${i + 1}`,
        lessons: [{ title: `Lesson ${i + 1}`, completed: i < lessonsDone, resource: "" }],
        assignment: {
          title: `Assignment ${i + 1}`,
          deadline: "",
          submitted: i < assignDone,
          marks: null,
        },
      })),
    },
  ];
}

export function parseStudentCsv(text, existingIds) {
  const lines = text.trim().split(/\r?\n/);
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
  const results = [];
  const seen = new Set(existingIds);
  for (let i = 1; i < lines.length; i++) {
    if (!(lines[i] ?? "").trim()) continue;
    const vals = (lines[i] ?? "").split(",").map((v) => v.trim());
    const rec = {};
    headers.forEach((h, j) => (rec[h] = vals[j] ?? ""));
    const errors = [];
    const missing = [];
    for (const f of REQUIRED) if (!rec[f]) missing.push(f);
    const cgpa = parseFloat(rec["cgpa"] ?? "");
    if (rec["cgpa"] && (isNaN(cgpa) || cgpa < 0 || cgpa > 10)) errors.push("cgpa must be 0–10");
    const sem = parseInt(rec["semester"] ?? "");
    if (rec["semester"] && (isNaN(sem) || sem < 1 || sem > 8)) errors.push("semester must be 1–8");
    const gy = parseInt(rec["grad_year"] ?? "");
    if (rec["grad_year"] && (isNaN(gy) || gy < 2020 || gy > 2035)) errors.push("grad_year invalid");
    const att = parseFloat(rec["attendance_pct"] ?? "");
    if (rec["attendance_pct"] && (isNaN(att) || att < 0 || att > 100))
      errors.push("attendance_pct must be 0–100");
    // A blank cell means "not recorded" (-1 / undefined), never zero.
    const opt = (k, lo, hi) => {
      if (!rec[k]) return undefined;
      const v = parseFloat(rec[k]);
      if (isNaN(v) || v < lo || v > hi) {
        errors.push(`${k} must be ${lo}–${hi}`);
        return undefined;
      }
      return v;
    };
    const skill = (k) => opt(k, 0, 100) ?? -1;
    const sgpas = rec["sgpa_history"]
      ? rec["sgpa_history"].split(";").map((x) => parseFloat(x))
      : [];
    if (sgpas.some((x) => isNaN(x) || x < 0 || x > 10))
      errors.push("sgpa_history must be 0–10 values split by ;");
    const subjects = rec["subjects"] ? parseSubjects(rec["subjects"], errors) : [];
    const logins = opt("lms_logins_per_week", 0, 100);
    const lessonsPct = opt("lms_lessons_pct", 0, 100);
    const assignPct = opt("lms_assignments_pct", 0, 100);
    const mock = opt("mock_interviews", 0, 100);
    const satisfaction = opt("satisfaction", 1, 5);
    const assessDone = opt("assessments_done", 0, 1000);
    const assessReq = opt("assessments_required", 0, 1000);
    const counts = Object.fromEntries(
      ["events", "clubs", "hackathons", "certifications"].map((k) => [k, opt(k, 0, 100)]),
    );
    const hasEngagement = Object.values(counts).some((v) => v !== undefined);
    const sid = rec["student_id"] ?? "";
    const isDuplicate = sid ? seen.has(sid) : false;
    if (isDuplicate) errors.push("duplicate student_id");
    if (sid) seen.add(sid);
    let student;
    if (errors.length === 0 && missing.length === 0) {
      // Without a subject list, an overall attendance % still gives one aggregate subject.
      if (subjects.length === 0 && !isNaN(att)) {
        subjects.push({
          subject: "Imported aggregate",
          marks: 0,
          classesHeld: 40,
          classesAttended: Math.round((att / 100) * 40),
        });
      }
      const engagement = [];
      const types = {
        events: "event",
        clubs: "club",
        hackathons: "hackathon",
        certifications: "certification",
      };
      for (const [k, type] of Object.entries(types))
        for (let n = 1; n <= (counts[k] ?? 0); n++)
          engagement.push({ type, name: `${type} ${n}`, date: today(), verified: true });
      student = {
        id: sid,
        name: rec["name"] ?? "",
        branch: rec["branch"] ?? "",
        semester: sem,
        gradYear: gy,
        gender: GENDERS[(rec["gender"] ?? "").toLowerCase()] ?? rec["gender"] ?? "",
        course: rec["course"] ?? "",
        section: rec["section"] ?? "",
        mentorId: "",
        cgpa,
        semesterGrades: sgpas.length ? sgpas : [cgpa],
        backlogs: parseInt(rec["backlogs"] ?? "") || 0,
        subjects,
        lms:
          lessonsPct === undefined && assignPct === undefined
            ? []
            : lmsFromPercent(lessonsPct ?? 0, assignPct ?? 0),
        skills: {
          coding: skill("coding"),
          aptitude: skill("aptitude"),
          analytical: skill("analytical"),
          verbal: skill("verbal"),
          communication: skill("communication"),
        },
        engagement,
        hasEngagementData: hasEngagement,
        resumeCompleteness: skill("resume_completeness"),
        targetRoles: [],
        assessmentsCompleted: assessDone ?? 0,
        assessmentsRequired: assessReq ?? 0,
        facultyFeedback: [],
        studentFeedback: [],
        ...(mock !== undefined && { mockInterviews: Math.round(mock) }),
        ...(logins !== undefined && { lmsLoginsPerWeek: logins }),
        ...(satisfaction !== undefined && { satisfaction }),
      };
    }
    results.push({ row: i + 1, student, errors, isDuplicate, missing });
  }
  return { results, headers };
}
