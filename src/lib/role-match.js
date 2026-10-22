// Rule-based role fit. Each role lists the skill level employers typically ask for; a student's
// match is how close their recorded skills are to those levels. Nothing here is a prediction,
// and a skill that has not been assessed is reported as unknown, never as zero.

export const ROLE_PROFILES = {
  "Software Engineer": { coding: 70, aptitude: 60, analytical: 60, communication: 50 },
  "Web Developer": { coding: 65, analytical: 55, communication: 50 },
  "Data Analyst": { analytical: 70, aptitude: 65, coding: 50, communication: 55 },
  "QA Engineer": { analytical: 60, coding: 45, communication: 55 },
  "Business Analyst": { communication: 70, analytical: 65, verbal: 65, aptitude: 55 },
  "Technical Support": { communication: 65, verbal: 60, aptitude: 50 },
};

const norm = (s) => s.trim().toLowerCase();

/** The configured profile for a free-text role, or null when none is configured. */
export function profileFor(role) {
  const wanted = norm(role);
  const key = Object.keys(ROLE_PROFILES).find(
    (k) => norm(k) === wanted || wanted.includes(norm(k)) || norm(k).includes(wanted),
  );
  return key ? { name: key, required: ROLE_PROFILES[key] } : null;
}

/**
 * match: 0-100 across the skills that have been assessed (null when none have).
 * gaps: skills below the asked-for level, biggest gap first.
 * unknown: required skills with no assessment yet.
 */
export function roleMatch(skills, role) {
  const profile = profileFor(role);
  if (!profile) return null;
  const known = [];
  const unknown = [];
  for (const [skill, required] of Object.entries(profile.required)) {
    const value = skills[skill];
    if (value === undefined || value < 0) unknown.push(skill);
    else known.push({ skill, required, value });
  }
  const match = known.length
    ? Math.round(
        known.reduce((a, k) => a + Math.min(1, k.value / k.required) * 100, 0) / known.length,
      )
    : null;
  const gaps = known
    .filter((k) => k.value < k.required)
    .map((k) => ({ ...k, gap: k.required - k.value }))
    .sort((a, b) => b.gap - a.gap);
  return { role: profile.name, match, gaps, unknown, known };
}
