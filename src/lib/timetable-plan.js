// Plans a weekly timetable so that every student with subjects on their record has classes to
// attend. A student's week is the slots of their own subjects, so two subjects taken by the
// same student may never sit in the same period: the planner treats that as a clash and places
// them elsewhere. Nothing here touches the database.

// Six teaching periods, Monday to Friday; Saturday is left free.
export const PERIODS = [
  { period: 1, start: "09:00", end: "09:55" },
  { period: 2, start: "10:00", end: "10:55" },
  { period: 3, start: "11:10", end: "12:05" },
  { period: 4, start: "12:10", end: "13:05" },
  { period: 5, start: "14:00", end: "14:55" },
  { period: 6, start: "15:00", end: "15:55" },
];
export const TEACHING_DAYS = [1, 2, 3, 4, 5];
export const DEFAULT_CLASSES_PER_WEEK = 3;

const key = (day, period) => `${day}:${period}`;

/**
 * Which subjects can never share a period, from the subject lists of the students.
 * Each cohort is one student's subjects.
 */
export function clashMap(cohorts) {
  const clashes = new Map();
  const add = (a, b) => {
    if (!clashes.has(a)) clashes.set(a, new Set());
    clashes.get(a).add(b);
  };
  for (const cohort of cohorts) {
    const subjects = [...new Set(cohort.filter(Boolean))];
    for (const s of subjects) {
      if (!clashes.has(s)) clashes.set(s, new Set());
      for (const other of subjects) if (other !== s) add(s, other);
    }
  }
  return clashes;
}

/**
 * A weekly plan for the given subjects.
 *
 * - `cohorts`: one array of subject names per student, which is what makes two subjects clash.
 * - `classesPerWeek(subject)`: how many classes a subject needs (3 by default).
 * - `skip`: subjects already scheduled, left untouched.
 * - `taken`: slots already on the timetable, as { subject, day, period }, so a partly filled
 *   week is extended rather than fought with.
 *
 * Subjects with the most clashes are placed first (they have the fewest options), each class of
 * a subject on a different day where possible. Anything that cannot be placed is reported in
 * `unplaced` rather than dropped silently.
 */
export function planTimetable({
  cohorts,
  classesPerWeek = () => DEFAULT_CLASSES_PER_WEEK,
  skip = [],
  taken = [],
  roomFor = (subject, index) => `Room ${101 + (index % 40)}`,
}) {
  const clashes = clashMap(cohorts);
  const skipped = new Set(skip);
  const occupied = new Map(); // "day:period" -> Set of subjects already there
  const place = (day, period, subject) => {
    const cell = occupied.get(key(day, period)) ?? new Set();
    cell.add(subject);
    occupied.set(key(day, period), cell);
  };
  for (const t of taken) place(t.day, t.period, t.subject);

  const free = (day, period, subject) => {
    const cell = occupied.get(key(day, period));
    if (!cell || cell.size === 0) return true;
    if (cell.has(subject)) return false;
    const against = clashes.get(subject) ?? new Set();
    for (const other of cell) if (against.has(other)) return false;
    return true;
  };

  const subjects = [...clashes.keys()]
    .filter((s) => !skipped.has(s))
    .sort(
      (a, b) => (clashes.get(b)?.size ?? 0) - (clashes.get(a)?.size ?? 0) || a.localeCompare(b),
    );

  const slots = [];
  const unplaced = [];
  subjects.forEach((subject, index) => {
    const wanted = Math.max(0, Number(classesPerWeek(subject)) || 0);
    const already = taken.filter((t) => t.subject === subject).length;
    const room = roomFor(subject, index);
    const usedDays = new Set(taken.filter((t) => t.subject === subject).map((t) => t.day));
    let placed = 0;
    // Each subject starts its week on a different day and at a different period, so the week
    // fills out evenly instead of piling every class onto Monday morning.
    const rotate = (list, by) => [
      ...list.slice(by % list.length),
      ...list.slice(0, by % list.length),
    ];
    const days = rotate(TEACHING_DAYS, index);
    const periods = rotate(PERIODS, Math.floor(index / TEACHING_DAYS.length));
    // Two passes: first one class per day, then fill the rest wherever there is room.
    for (const onePerDay of [true, false]) {
      for (const day of days) {
        if (already + placed >= wanted) break;
        if (onePerDay && usedDays.has(day)) continue;
        for (const p of periods) {
          if (already + placed >= wanted) break;
          if (!free(day, p.period, subject)) continue;
          place(day, p.period, subject);
          usedDays.add(day);
          slots.push({ subject, day, period: p.period, start: p.start, end: p.end, room });
          placed += 1;
          if (onePerDay) break;
        }
      }
    }
    const short = wanted - already - placed;
    if (short > 0) unplaced.push({ subject, short });
  });

  return { slots, unplaced, subjects };
}
