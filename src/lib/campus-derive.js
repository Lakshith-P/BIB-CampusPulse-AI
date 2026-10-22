import { academicRisk, effectiveBand, placementRisk } from "./risk-flags";
import { liveNotifications } from "./live-profile";
import { componentScores, lmsCompletion, studentAttendancePct, successScore } from "./scoring";
import { segmentOf } from "./student-extras";
import { studentSchema } from "./student-validation";
import { DEFAULT_WEIGHTS } from "./types";

const COMPONENT_LABELS = {
  academics: "Academics",
  attendance: "Attendance",
  lms: "LMS",
  engagement: "Engagement",
  skills: "Skills",
  placement: "Placement",
};

// Turns the raw rows from the database into what the portal pages show: one row per student
// with the score, band, attendance and alert counts already worked out.

export const BAND_ORDER = ["High Priority", "Needs Attention", "Monitor", "On Track"];

export function buildRows(records, today) {
  return records.flatMap((rec) => {
    const parsed = studentSchema.safeParse(rec.record);
    if (!parsed.success) return [];
    const s = parsed.data;
    const r = successScore(s);
    const acad = academicRisk(s);
    const place = placementRisk(s);
    const alerts = liveNotifications(s, today).filter((n) => n.tone !== "info");
    // Explainability: the indicator adding the most points to the score, and the signal adding
    // the most points to either risk flag.
    const topComponent = Object.entries(r.components)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => ({ k, impact: (v * DEFAULT_WEIGHTS[k]) / 100 }))
      .sort((a, b) => b.impact - a.impact)[0];
    const topRisk = [...acad.drivers, ...place.drivers].sort((a, b) => b.points - a.points)[0];
    return [
      {
        rec,
        s,
        id: s.id,
        name: s.name,
        branch: s.branch,
        semester: s.semester,
        year: Math.ceil(s.semester / 2),
        gender: s.gender,
        course: s.course,
        section: s.section,
        score: r.score,
        topDriver: topComponent ? COMPONENT_LABELS[topComponent.k] : null,
        riskDriver: topRisk ? topRisk.signal : null,
        band: r.score === null ? null : effectiveBand(r.score, r.band, acad, place),
        cgpa: s.cgpa > 0 ? s.cgpa : null,
        attendance: studentAttendancePct(s),
        lms: lmsCompletion(s),
        academicRisk: acad.level,
        academicPoints: acad.points,
        placementRisk: place.level,
        placementPoints: place.points,
        segment: segmentOf(s).name,
        alerts: alerts.length,
        urgent: alerts.filter((n) => n.tone === "danger").length,
        ownerId: rec.owner_id,
        ownerEmail: rec.owner_email ?? "",
        mentorId: rec.faculty_id,
        mentorName: rec.mentor_name || rec.mentor_email || "",
        mentorEmail: rec.mentor_email ?? "",
      },
    ];
  });
}

const rank = (row) => (row.band === null ? 99 : BAND_ORDER.indexOf(row.band));

/** Students who most need help first; students with no data yet go last. */
export function byAttention(rows) {
  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b) || (a.score ?? 101) - (b.score ?? 101) || a.name.localeCompare(b.name),
  );
}

export const isAtRisk = (row) => row.band === "High Priority" || row.band === "Needs Attention";
export const lowAttendance = (row) => row.attendance !== null && row.attendance < 75;

const mean = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
};

/** Averages across students (missing values are skipped, never counted as zero) and data coverage. */
export function averages(rows) {
  const comps = rows.map((r) => componentScores(r.s));
  const cells = comps.flatMap((c) => Object.values(c));
  const missing = cells.filter((v) => v === null).length;
  return {
    avgScore: mean(rows.map((r) => r.score)),
    avgCgpa: mean(rows.map((r) => r.cgpa)),
    avgAtt: mean(rows.map((r) => r.attendance)),
    avgLms: mean(rows.map((r) => r.lms)),
    avgPlace: mean(comps.map((c) => c.placement)),
    coverage: cells.length ? ((cells.length - missing) / cells.length) * 100 : 100,
    cells: cells.length,
    missing,
  };
}

export function summarize(rows, interventions, today) {
  const withData = rows.filter((r) => r.score !== null);
  const byBand = Object.fromEntries(BAND_ORDER.map((b) => [b, 0]));
  for (const r of withData) byBand[r.band] += 1;
  const open = interventions.filter((i) => i.status !== "resolved");
  return {
    total: rows.length,
    withData: withData.length,
    noData: rows.length - withData.length,
    byBand,
    avgScore: withData.length ? withData.reduce((a, r) => a + r.score, 0) / withData.length : null,
    atRisk: rows.filter(isAtRisk).length,
    lowAttendance: rows.filter(lowAttendance).length,
    unassigned: rows.filter((r) => !r.mentorId).length,
    openInterventions: open.length,
    overdueFollowUps: open.filter((i) => i.follow_up_date < today).length,
  };
}
