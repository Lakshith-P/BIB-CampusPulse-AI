import { pendingAssignments } from "./scoring";
import { attendancePlan, integrityFlags } from "./student-extras";

// Helpers for the workspace pages. They invent nothing: every value comes from the student's
// own record, and "today" is the real date.

export const todayIso = () => new Date().toISOString().slice(0, 10);

const daysBetween = (fromIso, toIso) => {
  const to = Date.parse(`${toIso}T00:00:00Z`);
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  return Number.isNaN(to) || Number.isNaN(from) ? null : Math.round((to - from) / 86400000);
};

/** Assignments not yet submitted, with their real deadlines, soonest first. */
export function liveAssignments(s, today = todayIso()) {
  return pendingAssignments(s)
    .filter((a) => a.title && a.title !== "—")
    .map((a) => ({ ...a, daysLeft: daysBetween(today, a.deadline) }))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

/** Alerts built only from recorded data. Missing data produces a gentle "not recorded" note. */
export function liveNotifications(s, today = todayIso()) {
  const out = [];
  for (const sub of s.subjects) {
    const p = attendancePlan(sub.subject, sub.classesHeld, sub.classesAttended);
    if (p.status === "critical" || p.status === "warning")
      out.push({
        tone: p.status === "critical" ? "danger" : "warning",
        key: `attendance:${sub.subject}:${p.status}`,
        area: "Attendance",
        text: `${sub.subject}: ${p.pct?.toFixed(1)}%`,
        tip: p.message,
      });
  }
  for (const a of liveAssignments(s, today)) {
    if (a.daysLeft === null || a.daysLeft > 3) continue;
    out.push({
      tone: a.daysLeft < 0 ? "danger" : "warning",
      key: `assignment:${a.subject}:${a.title}:${a.daysLeft < 0 ? "late" : "soon"}`,
      area: "Assignment",
      text:
        a.daysLeft < 0
          ? `${a.title} (${a.subject}) was due ${-a.daysLeft} day(s) ago`
          : `${a.title} (${a.subject}) closes in ${a.daysLeft} day(s)`,
      tip: "Submit it to keep your LMS credit.",
    });
  }
  for (const sub of s.subjects)
    if (sub.marks < 60)
      out.push({
        tone: "danger",
        key: `marks:${sub.subject}`,
        area: "Academics",
        text: `${sub.subject} marks ${sub.marks}/100`,
        tip: "Book a doubt session with your teacher and revise the weakest topics.",
      });
  if (s.backlogs)
    out.push({
      tone: "danger",
      key: `backlogs:${s.backlogs}`,
      area: "Academics",
      text: `${s.backlogs} backlog(s) pending`,
      tip: "Register for the next re-examination and follow your recovery plan.",
    });
  if (s.skills.aptitude >= 0 && s.skills.aptitude < 60)
    out.push({
      tone: "warning",
      key: "skills:aptitude",
      area: "Skills",
      text: `Aptitude ${s.skills.aptitude}/100`,
      tip: "Practise aptitude questions regularly.",
    });
  for (const f of integrityFlags(s))
    out.push({
      tone: "warning",
      key: `engagement:${f.detail}`,
      area: "Engagement",
      text: f.detail,
      tip: "Share evidence with your mentor for review.",
    });
  const missing = [];
  if (s.subjects.length === 0) missing.push("marks and attendance");
  if (s.lms.length === 0) missing.push("LMS activity");
  if (s.cgpa <= 0) missing.push("CGPA");
  if (missing.length)
    out.push({
      tone: "info",
      key: `data:${missing.join(",")}`,
      area: "Data",
      text: `Not recorded yet: ${missing.join(", ")}`,
      tip: "Ask your teacher or administrator to add these. Missing data is never treated as zero.",
    });
  return out;
}
