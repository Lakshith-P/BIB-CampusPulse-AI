// Maps a free-text career goal to the roadmap.sh roadmap that describes it. The student can type
// any role; roles with no match are still researched, just without a published roadmap.

export const PRESET_ROLES = [
  "Cyber Security",
  "DevOps",
  "Cloud Engineer",
  "Data Analyst",
  "Data Scientist / AI",
  "Full Stack Developer",
  "Backend Developer",
  "Frontend Developer",
  "QA Engineer",
  "Android Developer",
];

// [slug on roadmap.sh, words that point to it]; the first entry with a matching word wins.
const TRACKS = [
  ["devsecops", ["devsecops"]],
  ["cyber-security", ["cyber", "security", "infosec", "ethical hack", "pentest", "soc analyst"]],
  ["devops", ["devops", "sre", "site reliability", "platform engineer"]],
  ["aws", ["aws", "cloud engineer", "cloud"]],
  ["mlops", ["mlops"]],
  [
    "ai-data-scientist",
    ["data scien", "machine learning", "ml engineer", "ai engineer", "artificial"],
  ],
  ["data-analyst", ["data analy", "business intelligence", "bi analyst", "analytics"]],
  ["full-stack", ["full stack", "fullstack", "full-stack", "mern"]],
  [
    "backend",
    ["backend", "back end", "back-end", "api developer", "software engineer", "software developer"],
  ],
  ["frontend", ["frontend", "front end", "front-end", "web developer", "ui developer"]],
  ["qa", ["qa", "quality", "tester", "testing", "sdet"]],
  ["android", ["android"]],
  ["ios", ["ios", "swift"]],
  ["blockchain", ["blockchain", "web3", "smart contract"]],
  ["ux-design", ["ux", "ui/ux", "designer", "design"]],
  ["product-manager", ["product manager", "product management"]],
  ["game-developer", ["game"]],
  ["system-design", ["system design", "architect"]],
];

/** The roadmap.sh slug for a role, or null when nothing matches. */
export function resolveTrack(role) {
  const text = ` ${String(role ?? "").toLowerCase()} `;
  for (const [slug, words] of TRACKS)
    if (words.some((word) => text.includes(word.length <= 3 ? ` ${word} ` : word))) return slug;
  return null;
}

export const cleanRole = (role) =>
  String(role ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

// The platform assesses five generic skills. These are the levels each track typically needs
// of them, used to find the student's gaps; unlisted tracks use the default.
const DEFAULT_NEEDS = { coding: 55, analytical: 55, communication: 50, aptitude: 50 };
const SKILL_NEEDS = {
  "cyber-security": { analytical: 65, coding: 45, communication: 50, aptitude: 55 },
  devsecops: { coding: 60, analytical: 65, communication: 50 },
  devops: { coding: 60, analytical: 60, communication: 50 },
  aws: { analytical: 60, coding: 50, communication: 50 },
  "data-analyst": { analytical: 70, aptitude: 65, coding: 50, communication: 55 },
  "ai-data-scientist": { analytical: 70, coding: 65, aptitude: 65, communication: 50 },
  frontend: { coding: 65, analytical: 55, communication: 50 },
  backend: { coding: 70, analytical: 60, aptitude: 55, communication: 50 },
  "full-stack": { coding: 70, analytical: 60, communication: 50 },
  qa: { analytical: 60, coding: 45, communication: 55 },
};

/** Where the student stands against what a track asks for; unassessed skills are reported as such. */
export function careerGaps(skills, slug) {
  return Object.entries(SKILL_NEEDS[slug] ?? DEFAULT_NEEDS).map(([skill, needed]) => {
    const value = skills?.[skill];
    const assessed = typeof value === "number" && value >= 0;
    return {
      skill,
      needed,
      value: assessed ? value : null,
      status: !assessed ? "not assessed" : value >= needed ? "met" : "gap",
    };
  });
}
