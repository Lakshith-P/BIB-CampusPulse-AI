// Marks to grade points on the ten-point scale the results page already shows letters for.
// SGPA is the credit-weighted average of a semester's grade points and CGPA averages the
// semesters. Nothing is invented: subjects with no marks recorded are left out, and a student
// with no marks at all keeps whatever is already on their record.

export const PASS_MARK = 40;
export const DEFAULT_CREDITS = 4;

export const GRADE_BANDS = [
  { min: 90, letter: "O", points: 10 },
  { min: 80, letter: "A+", points: 9 },
  { min: 70, letter: "A", points: 8 },
  { min: 60, letter: "B+", points: 7 },
  { min: 50, letter: "B", points: 6 },
  { min: PASS_MARK, letter: "C", points: 5 },
  { min: 0, letter: "F", points: 0 },
];

/** The band a mark falls in. A failed subject earns no points, so it pulls the SGPA down. */
export function gradeFor(marks) {
  const band = GRADE_BANDS.find((b) => marks >= b.min) ?? GRADE_BANDS.at(-1);
  return { letter: band.letter, points: band.points, passed: marks >= PASS_MARK };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The current semester worked out from the marks on record, subject by subject, so a student
 * can see exactly where their SGPA comes from.
 * `creditsOf` gives a subject's credits (from its syllabus); unknown subjects count as 4.
 */
export function semesterResult(subjects, creditsOf = () => DEFAULT_CREDITS) {
  const rows = [];
  for (const s of subjects ?? []) {
    if (typeof s?.marks !== "number" || Number.isNaN(s.marks)) continue;
    const credits = Number(creditsOf(s.subject)) || DEFAULT_CREDITS;
    const { letter, points, passed } = gradeFor(s.marks);
    rows.push({ subject: s.subject, marks: s.marks, credits, letter, points, passed });
  }
  const credits = rows.reduce((a, r) => a + r.credits, 0);
  const weighted = rows.reduce((a, r) => a + r.points * r.credits, 0);
  return {
    rows,
    credits,
    weighted,
    sgpa: credits > 0 ? round2(weighted / credits) : null,
    failed: rows.filter((r) => !r.passed).map((r) => r.subject),
  };
}

/** CGPA over the semesters on record, or null when there are none. */
export function cgpaOf(grades) {
  const values = (grades ?? []).map(Number).filter((g) => Number.isFinite(g));
  if (!values.length) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * The semester grades with the current semester's SGPA in place. The list is indexed by
 * semester, so semester 3 sits at index 2 — but a record holding fewer grades than that is
 * never padded with invented semesters, the current one is appended instead.
 */
export function withCurrentSgpa(grades, semester, sgpa) {
  const list = (grades ?? []).map(Number).filter((g) => Number.isFinite(g));
  const index = Math.min(Math.max((Number(semester) || 1) - 1, 0), list.length);
  const next = [...list];
  next[index] = round2(sgpa);
  return next;
}

/**
 * What a student's record should say about their results, given the marks on it.
 * Returns null when there is nothing to work from, so the caller leaves the record alone.
 */
export function recalculatedGrades(record, creditsOf) {
  const result = semesterResult(record?.subjects, creditsOf);
  if (result.sgpa === null) return null;
  const semesterGrades = withCurrentSgpa(record?.semesterGrades, record?.semester, result.sgpa);
  return { ...result, semesterGrades, cgpa: cgpaOf(semesterGrades) };
}
