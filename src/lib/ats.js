// Rule-based resume checks, the way an applicant tracking system reads a resume: can the text
// be parsed, are the sections an ATS looks for present, and do the words a job asks for appear.
// Everything here is deterministic and explained to the student — no model call, no guessing,
// and no claim about whether they will be selected.

/** Skills an ATS commonly screens on. The first spelling is the one shown. */
export const SKILL_TERMS = {
  java: ["java", "core java", "j2ee"],
  python: ["python"],
  "c++": ["c++", "cpp"],
  c: ["\\bc\\b", "c language", "programming in c"],
  javascript: ["javascript", "java script", "\\bjs\\b", "es6"],
  typescript: ["typescript"],
  react: ["react", "react.js", "reactjs"],
  "node.js": ["node.js", "nodejs", "node js", "express.js", "express"],
  html: ["html", "html5"],
  css: ["css", "css3", "tailwind", "bootstrap"],
  sql: ["sql", "mysql", "postgresql", "postgres", "oracle db", "plsql", "pl/sql"],
  nosql: ["mongodb", "mongo", "cassandra", "dynamodb", "nosql"],
  "data structures": ["data structures", "\\bdsa\\b", "algorithms"],
  oop: ["object oriented", "object-oriented", "\\boops?\\b"],
  dbms: ["dbms", "database management"],
  "operating systems": ["operating system", "\\bos concepts\\b"],
  networking: ["computer networks", "networking", "tcp/ip"],
  git: ["git", "github", "gitlab", "version control"],
  linux: ["linux", "unix", "shell script", "bash"],
  docker: ["docker", "container"],
  kubernetes: ["kubernetes", "k8s"],
  aws: ["\\baws\\b", "amazon web services", "ec2", "\\bs3\\b"],
  azure: ["azure"],
  gcp: ["google cloud", "\\bgcp\\b"],
  "ci/cd": ["ci/cd", "jenkins", "github actions", "devops"],
  rest: ["rest api", "restful", "\\bapi\\b", "microservice"],
  "machine learning": ["machine learning", "\\bml\\b", "deep learning", "neural network"],
  "data analysis": ["data analysis", "data analytics", "pandas", "numpy"],
  "power bi": ["power bi", "powerbi", "tableau", "data visuali"],
  excel: ["excel", "spreadsheet", "vlookup", "pivot table"],
  statistics: ["statistics", "statistical", "probability"],
  testing: ["testing", "test case", "selenium", "junit", "\\bqa\\b", "automation test"],
  agile: ["agile", "scrum", "sprint", "jira"],
  android: ["android", "kotlin", "flutter", "react native", "mobile app"],
  "problem solving": ["problem solving", "problem-solving", "competitive programming", "leetcode"],
  communication: ["communication", "presentation", "public speaking"],
  teamwork: ["teamwork", "team player", "collaborat"],
  leadership: ["leadership", "led a team", "team lead", "coordinator"],
  internship: ["internship", "intern at", "trainee"],
  autocad: ["autocad", "solidworks", "catia", "ansys"],
  manufacturing: ["manufacturing", "cnc", "lathe", "welding", "production line"],
  thermodynamics: ["thermodynamic", "heat transfer", "fluid mechanic"],
  "circuit design": ["circuit design", "vlsi", "verilog", "pcb", "embedded"],
  matlab: ["matlab", "simulink"],
  "civil design": ["staad", "surveying", "concrete", "structural analysis"],
  accounting: ["accounting", "tally", "gst", "book keeping", "bookkeeping"],
  marketing: ["marketing", "\\bseo\\b", "social media", "campaign"],
};

const STRONG_VERBS = [
  "built",
  "developed",
  "designed",
  "implemented",
  "created",
  "led",
  "managed",
  "improved",
  "reduced",
  "increased",
  "automated",
  "optimised",
  "optimized",
  "delivered",
  "launched",
  "analysed",
  "analyzed",
  "tested",
  "deployed",
  "migrated",
  "integrated",
  "trained",
  "organised",
  "organized",
  "presented",
  "won",
  "achieved",
  "mentored",
  "maintained",
  "collaborated",
];

const SECTION_PATTERNS = {
  education: ["education", "academic", "qualification", "schooling", "b.tech", "bachelor"],
  experience: ["experience", "internship", "employment", "work history", "trainee", "worked at"],
  projects: ["project", "mini project", "capstone", "portfolio"],
  skills: ["skill", "technical skill", "technologies", "tech stack", "proficien"],
  achievements: [
    "achievement",
    "certification",
    "certificate",
    "award",
    "accomplish",
    "hackathon",
    "publication",
  ],
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\s-]{8,}\d)/;
const LINK_RE = /(?:linkedin\.com|github\.com|gitlab\.com|https?:\/\/)/i;
const DATE_RE =
  /(?:19|20)\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2}\b/gi;
const NUMBER_RE = /\d+\s?%|\b\d{2,}\b|\b\d+(?:\.\d+)?\s?(?:x|times|users|students|hours|lpa)\b/i;

const lower = (text) => (text ?? "").toLowerCase();
const lines = (text) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
export const wordCount = (text) => ((text ?? "").match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;

// Patterns are plain text apart from the \b word boundaries written into them, so every other
// regular-expression character is escaped before they are joined.
const escapeTerm = (p) => p.replace(/[.*+?^${}()|[\]]/g, "\\$&");
const matcher = (patterns) => new RegExp(patterns.map(escapeTerm).join("|"), "i");

/** The skill terms a piece of text mentions, in the order they are listed above. */
export function extractTerms(text) {
  const body = lower(text);
  if (!body.trim()) return [];
  return Object.entries(SKILL_TERMS)
    .filter(([, patterns]) => matcher(patterns).test(body))
    .map(([term]) => term);
}

/** Which of the sections an ATS looks for are present. */
export function sectionsIn(text) {
  const body = lower(text);
  return Object.fromEntries(
    Object.entries(SECTION_PATTERNS).map(([name, patterns]) => [
      name,
      matcher(patterns).test(body),
    ]),
  );
}

const state = (points, max) => (points >= max ? "pass" : points > 0 ? "partial" : "fail");

/**
 * The ATS report: a score out of 100 built from checks that each say what was found, what it
 * cost and how to fix it. `roles` are the student's target roles, used only for the keyword
 * advice, never for the score.
 */
export function atsReport(text, { roles = [] } = {}) {
  const body = (text ?? "").trim();
  if (body.length < 50) return null;
  const rows = lines(body);
  const words = wordCount(body);
  const found = sectionsIn(body);
  const terms = extractTerms(body);
  const dates = [...new Set((body.match(DATE_RE) ?? []).map((d) => d.toLowerCase()))];
  const bulletRows = rows.filter((l) => /^[-•*▪·o]\s|^\d+[.)]\s/.test(l));
  const quantified = rows.filter((l) => NUMBER_RE.test(l));
  const verbs = [...new Set(STRONG_VERBS.filter((v) => new RegExp(`\\b${v}\\b`, "i").test(body)))];
  const wideGaps = rows.filter((l) => /\S {3,}\S/.test(l));
  const checks = [];
  const push = (c) => checks.push({ ...c, state: state(c.points, c.max) });

  const contact = [EMAIL_RE.test(body), PHONE_RE.test(body), LINK_RE.test(body)].filter(
    Boolean,
  ).length;
  push({
    id: "contact",
    label: "Contact details an ATS can read",
    max: 10,
    points: contact >= 3 ? 10 : contact === 2 ? 7 : contact === 1 ? 4 : 0,
    detail: `${contact} of 3 found (email, phone, profile link).`,
    fix: "Put your email, phone number and a GitHub or LinkedIn link as plain text at the top — not inside a header, image or text box.",
  });

  const sectionScore = { education: 8, experience: 12, projects: 12, skills: 10 };
  for (const [name, max] of Object.entries(sectionScore))
    push({
      id: name,
      label: `${name[0].toUpperCase() + name.slice(1)} section`,
      max,
      points: found[name] ? max : 0,
      detail: found[name] ? "Found." : "No heading for this section was found.",
      fix:
        name === "experience"
          ? "Add an Experience or Internship heading. With no job yet, list internships, training or freelance work under it."
          : `Add a clearly named "${name[0].toUpperCase() + name.slice(1)}" heading — parsers look for the word itself.`,
    });
  push({
    id: "achievements",
    label: "Achievements or certifications",
    max: 5,
    points: found.achievements ? 5 : 0,
    detail: found.achievements ? "Found." : "No achievements or certifications listed.",
    fix: "List certifications, hackathons, awards or ranks under an Achievements heading.",
  });

  push({
    id: "quantified",
    label: "Results with numbers in them",
    max: 12,
    points: Math.min(12, quantified.length * 3),
    detail: `${quantified.length} line${quantified.length === 1 ? "" : "s"} carry a number or percentage.`,
    fix: 'Put a measure on each claim: "cut page load from 4s to 1.2s", "handled 500+ records", "scored 92%".',
  });

  push({
    id: "verbs",
    label: "Strong action verbs",
    max: 9,
    points: Math.min(9, verbs.length * 2),
    detail: verbs.length ? `${verbs.length} used: ${verbs.slice(0, 6).join(", ")}.` : "None found.",
    fix: 'Start each bullet with what you did — "Built", "Automated", "Reduced" — instead of "Responsible for".',
  });

  const lengthPoints = words >= 250 && words <= 900 ? 6 : words >= 150 && words <= 1200 ? 4 : 1;
  push({
    id: "length",
    label: "Length",
    max: 6,
    points: lengthPoints,
    detail: `${words} words.`,
    fix: "Aim for 250–900 words: one page as a fresher, two at most.",
  });

  push({
    id: "bullets",
    label: "Bullet points rather than paragraphs",
    max: 5,
    points: bulletRows.length >= 8 ? 5 : bulletRows.length >= 3 ? 3 : 0,
    detail: `${bulletRows.length} bulleted line${bulletRows.length === 1 ? "" : "s"}.`,
    fix: "Write experience and projects as short bullets; long paragraphs get truncated in a parsed profile.",
  });

  push({
    id: "dates",
    label: "Dates on education and experience",
    max: 6,
    points: dates.length >= 3 ? 6 : dates.length >= 1 ? 3 : 0,
    detail: dates.length
      ? `${dates.length} date${dates.length === 1 ? "" : "s"} found.`
      : "None found.",
    fix: 'Give every entry a period, like "Jun 2025 – Aug 2025" or "2023 – 2027".',
  });

  push({
    id: "terms",
    label: "Recognised skill keywords",
    max: 5,
    points: terms.length >= 8 ? 5 : terms.length >= 4 ? 3 : terms.length >= 1 ? 1 : 0,
    detail: terms.length
      ? `${terms.length} found: ${terms.slice(0, 8).join(", ")}.`
      : "None found.",
    fix: "Name the tools and subjects you actually used, spelled the way job posts spell them.",
  });

  const score = Math.round(checks.reduce((a, c) => a + c.points, 0));
  const notes = [];
  if (wideGaps.length > 3)
    notes.push(
      `${wideGaps.length} lines look like columns or a table. Parsers read these left to right and scramble them — use a single-column layout.`,
    );
  if (/\b(i|my|me)\b/i.test(body) && (body.match(/\bI\b/g) ?? []).length > 3)
    notes.push('Several lines are written in the first person ("I built…"). Drop the "I".');
  if (/references available|marital status|father'?s name|date of birth/i.test(body))
    notes.push(
      "Personal details like date of birth, marital status or a references line take space without helping an application.",
    );
  if (rows.some((l) => l.length > 400))
    notes.push(
      "At least one very long line was read as one block, which usually means the layout is not plain text.",
    );

  const roleKeywords = (roles ?? [])
    .map((role) => ({ role, ...keywordMatch(body, role) }))
    .filter((r) => r.wanted.length);

  return {
    score,
    band: score >= 80 ? "Strong" : score >= 60 ? "Needs work" : "Weak",
    checks,
    notes,
    words,
    terms,
    sections: found,
    roleKeywords,
  };
}

// --------------------------------------------------------------- matching a job
/** Role titles mapped to the keywords a posting for them normally carries. */
const ROLE_KEYWORDS = {
  "software engineer": ["java", "python", "data structures", "oop", "git", "sql", "rest"],
  "software developer": ["java", "python", "data structures", "oop", "git", "sql", "rest"],
  "web developer": ["html", "css", "javascript", "react", "node.js", "git", "rest"],
  "full stack": ["html", "css", "javascript", "react", "node.js", "sql", "rest", "git"],
  "frontend developer": ["html", "css", "javascript", "react", "git"],
  "backend developer": ["java", "node.js", "sql", "rest", "docker", "git"],
  "data analyst": ["sql", "excel", "python", "data analysis", "power bi", "statistics"],
  "data scientist": ["python", "machine learning", "statistics", "data analysis", "sql"],
  "qa engineer": ["testing", "selenium", "sql", "agile", "problem solving"],
  "test engineer": ["testing", "selenium", "sql", "agile"],
  "business analyst": ["excel", "sql", "communication", "agile", "data analysis"],
  "technical support": ["communication", "operating systems", "networking", "sql", "teamwork"],
  "systems engineer": ["linux", "networking", "sql", "operating systems", "git"],
  "devops engineer": ["linux", "docker", "kubernetes", "ci/cd", "aws", "git"],
  "cloud engineer": ["aws", "azure", "docker", "linux", "ci/cd"],
  "mechanical engineer": ["autocad", "manufacturing", "thermodynamics", "matlab"],
  "design engineer": ["autocad", "matlab", "manufacturing"],
  "civil engineer": ["civil design", "autocad", "manufacturing"],
  "electrical engineer": ["circuit design", "matlab", "networking"],
  "embedded engineer": ["circuit design", "c", "linux", "matlab"],
  analyst: ["excel", "sql", "data analysis", "communication"],
  consultant: ["communication", "excel", "agile", "problem solving"],
};

function wantedFor(role, text) {
  const fromText = extractTerms(text);
  const name = lower(role);
  const profile = Object.entries(ROLE_KEYWORDS).find(([k]) => name.includes(k))?.[1] ?? [];
  const wanted = [...new Set([...fromText, ...profile])];
  return { wanted, source: fromText.length ? (profile.length ? "both" : "description") : "role" };
}

/** How many of a job's keywords a resume carries. */
export function keywordMatch(resumeText, role, jobText = "") {
  const { wanted, source } = wantedFor(role, jobText);
  if (!wanted.length) return { percent: null, matched: [], missing: [], wanted, source };
  const have = new Set(extractTerms(resumeText));
  const matched = wanted.filter((w) => have.has(w));
  return {
    percent: Math.round((matched.length / wanted.length) * 100),
    matched,
    missing: wanted.filter((w) => !have.has(w)),
    // Two or three keywords are too few to read much into, and the reader is told so.
    thin: wanted.length < 3,
    wanted,
    source,
  };
}

/**
 * How well a resume matches one drive: the keywords from the role and the posting, and how
 * complete the resume itself is. Returns null when there is no resume to read yet.
 */
export function driveMatch(resumeText, drive) {
  if (!resumeText || resumeText.trim().length < 50) return null;
  const jobText = [drive?.roleTitle, drive?.description].filter(Boolean).join("\n");
  const m = keywordMatch(resumeText, drive?.roleTitle ?? "", jobText);
  if (m.percent === null) return null;
  return {
    ...m,
    company: drive?.company ?? "",
    role: drive?.roleTitle ?? "",
    basis:
      m.source === "description"
        ? "keywords taken from this posting"
        : m.source === "role"
          ? "keywords typical for this role (the posting lists none)"
          : "keywords from this posting and the role",
  };
}
