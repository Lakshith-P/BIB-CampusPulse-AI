// Synthetic campus data covering every section of the dashboard. Pure and deterministic: the
// same seed always yields the same people, so runs are reproducible. Nothing here touches a
// database; scripts/demo-data/write.js stores the result.

export const DEMO_DOMAIN = "insightiq.demo";
export const DEMO_PASSWORD = "Demo@12345";
export const STUDENT_COUNT = 150;
export const TEACHER_COUNT = 20;
export const ID_PREFIX = "SYN-";

const BRANCHES = ["CSE", "IT", "ECE", "MECH"];

// Five subjects per branch and year. Shared names (for example Communication Skills) share LMS content.
const SUBJECTS = {
  CSE: {
    1: [
      "Programming in C",
      "Engineering Mathematics I",
      "Engineering Physics",
      "Digital Logic",
      "Communication Skills",
    ],
    2: [
      "Data Structures",
      "Discrete Mathematics",
      "Object Oriented Programming",
      "Computer Organization",
      "Database Systems",
    ],
    3: [
      "Operating Systems",
      "Computer Networks",
      "Design and Analysis of Algorithms",
      "Software Engineering",
      "Web Technologies",
    ],
    4: [
      "Machine Learning",
      "Cloud Computing",
      "Information Security",
      "Distributed Systems",
      "Compiler Design",
    ],
  },
  IT: {
    1: [
      "Programming in Python",
      "Engineering Mathematics I",
      "Engineering Physics",
      "Digital Electronics",
      "Communication Skills",
    ],
    2: [
      "Data Structures",
      "Probability and Statistics",
      "Java Programming",
      "Computer Architecture",
      "Database Management",
    ],
    3: [
      "Operating Systems",
      "Data Communication",
      "Web Development",
      "Software Testing",
      "Data Mining",
    ],
    4: [
      "Cloud Infrastructure",
      "Cyber Security",
      "Mobile Application Development",
      "Big Data Analytics",
      "IT Project Management",
    ],
  },
  ECE: {
    1: [
      "Basic Electrical Engineering",
      "Engineering Mathematics I",
      "Engineering Physics",
      "Programming Fundamentals",
      "Communication Skills",
    ],
    2: [
      "Electronic Devices",
      "Signals and Systems",
      "Network Analysis",
      "Digital Circuits",
      "Engineering Mathematics III",
    ],
    3: [
      "Analog Communication",
      "Microprocessors",
      "Control Systems",
      "Electromagnetic Fields",
      "VLSI Design",
    ],
    4: [
      "Digital Signal Processing",
      "Embedded Systems",
      "Wireless Communication",
      "Optical Communication",
      "Antenna Theory",
    ],
  },
  MECH: {
    1: [
      "Engineering Mechanics",
      "Engineering Mathematics I",
      "Engineering Chemistry",
      "Engineering Graphics",
      "Communication Skills",
    ],
    2: [
      "Thermodynamics",
      "Fluid Mechanics",
      "Strength of Materials",
      "Manufacturing Processes",
      "Engineering Mathematics III",
    ],
    3: [
      "Heat Transfer",
      "Machine Design",
      "Dynamics of Machinery",
      "Metrology",
      "Industrial Engineering",
    ],
    4: [
      "CAD CAM",
      "Robotics",
      "Refrigeration and Air Conditioning",
      "Finite Element Analysis",
      "Operations Research",
    ],
  },
};

const UNIT_THEMES = [
  "Foundations",
  "Core Concepts",
  "Applications",
  "Advanced Topics",
  "Problem Solving",
  "Revision and Case Studies",
];

const MALE = [
  "Arun",
  "Rahul",
  "Vikram",
  "Karthik",
  "Siddharth",
  "Aditya",
  "Rohan",
  "Manoj",
  "Harish",
  "Naveen",
  "Pranav",
  "Suresh",
  "Deepak",
  "Ganesh",
  "Ishaan",
  "Kiran",
  "Lokesh",
  "Mohan",
  "Nikhil",
  "Om",
  "Rajesh",
  "Sanjay",
  "Tarun",
  "Uday",
  "Varun",
  "Yash",
  "Akash",
  "Bharath",
  "Dinesh",
  "Ethan",
];
const FEMALE = [
  "Ananya",
  "Priya",
  "Divya",
  "Meera",
  "Sneha",
  "Kavya",
  "Lakshmi",
  "Nisha",
  "Pooja",
  "Riya",
  "Shruti",
  "Tanvi",
  "Aishwarya",
  "Bhavana",
  "Chitra",
  "Deepika",
  "Esha",
  "Gayathri",
  "Harini",
  "Isha",
  "Janani",
  "Keerthi",
  "Madhuri",
  "Nandini",
  "Preeti",
  "Ramya",
  "Swathi",
  "Trisha",
  "Uma",
  "Varsha",
];
const SURNAMES = [
  "Sharma",
  "Reddy",
  "Nair",
  "Iyer",
  "Patel",
  "Kumar",
  "Singh",
  "Rao",
  "Menon",
  "Gupta",
  "Das",
  "Pillai",
  "Joshi",
  "Naidu",
  "Bose",
  "Chandra",
  "Desai",
  "Krishnan",
  "Mehta",
  "Verma",
];
const TEACHER_TITLES = ["Dr.", "Prof.", "Mr.", "Ms."];

const ROLES = [
  "Software Engineer",
  "Web Developer",
  "Data Analyst",
  "QA Engineer",
  "Business Analyst",
  "Technical Support",
];

const TOPICS = {
  coding: ["Arrays", "Strings", "Recursion", "SQL queries", "Sorting"],
  aptitude: ["Percentages", "Time and work", "Probability", "Number series"],
  analytical: ["Logical reasoning", "Data interpretation", "Puzzles"],
  verbal: ["Reading comprehension", "Vocabulary", "Sentence correction"],
  communication: ["Presentation", "Group discussion", "Email writing"],
};
const SKILL_KEYS = Object.keys(TOPICS);

// Archetypes give each student a believable shape across all sources.
const ARCHETYPES = [
  ["strong", 0.22],
  ["steady", 0.38],
  ["lowAttendance", 0.12],
  ["academicRisk", 0.13],
  ["placementGap", 0.15],
];
const PROFILE = {
  strong: {
    cgpa: [8.3, 9.5],
    att: [88, 97],
    marks: [74, 95],
    skill: [70, 92],
    resume: [75, 95],
    mock: [2, 3],
    lms: 0.92,
    sub: 0.97,
    engage: 0.9,
  },
  steady: {
    cgpa: [6.8, 8.2],
    att: [78, 90],
    marks: [58, 82],
    skill: [52, 76],
    resume: [55, 80],
    mock: [1, 2],
    lms: 0.7,
    sub: 0.85,
    engage: 0.6,
  },
  lowAttendance: {
    cgpa: [6.5, 8.5],
    att: [55, 73],
    marks: [52, 80],
    skill: [45, 72],
    resume: [45, 75],
    mock: [0, 1],
    lms: 0.5,
    sub: 0.55,
    engage: 0.35,
  },
  academicRisk: {
    cgpa: [4.8, 6.2],
    att: [64, 82],
    marks: [32, 58],
    skill: [30, 58],
    resume: [35, 65],
    mock: [0, 1],
    lms: 0.35,
    sub: 0.45,
    engage: 0.2,
  },
  placementGap: {
    cgpa: [7.4, 9.0],
    att: [80, 93],
    marks: [64, 88],
    skill: [55, 80],
    resume: [30, 60],
    mock: [0, 0],
    lms: 0.75,
    sub: 0.85,
    engage: 0.3,
  },
};

// ---------------------------------------------------------------- helpers
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const atTime = (isoDate, hour = 10, minute = 0) =>
  `${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

export function generate({ today = "2026-10-21", seed = 20261021 } = {}) {
  const rand = mulberry32(seed);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const int = (lo, hi) => Math.floor(between(lo, hi + 1));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const chance = (p) => rand() < p;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, "");

  // ------------------------------------------------------------ teachers
  const teachers = Array.from({ length: TEACHER_COUNT }, (_, i) => {
    const branch = BRANCHES[Math.floor(i / 5)];
    const female = i % 2 === 1;
    const first = (female ? FEMALE : MALE)[(i * 3 + 7) % 30];
    const last = SURNAMES[(i * 7 + 3) % SURNAMES.length];
    const title = female ? pick(["Dr.", "Prof.", "Ms."]) : pick(["Dr.", "Prof.", "Mr."]);
    return {
      key: `T${String(i + 1).padStart(2, "0")}`,
      email: `teacher${String(i + 1).padStart(2, "0")}@${DEMO_DOMAIN}`,
      name: `${title} ${first} ${last}`,
      branch,
    };
  });
  void TEACHER_TITLES;

  // ------------------------------------------------------------ students
  const students = [];
  const usedNames = new Set();
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const branch = BRANCHES[i % 4];
    const year = (Math.floor(i / 4) % 4) + 1;
    const section = Math.floor(i / 16) % 2 === 0 ? "A" : "B";
    const female = chance(0.5);
    let name;
    do name = `${pick(female ? FEMALE : MALE)} ${pick(SURNAMES)}`;
    while (usedNames.has(name));
    usedNames.add(name);
    const r = rand();
    let acc = 0;
    let archetype = "steady";
    for (const [key, w] of ARCHETYPES) {
      acc += w;
      if (r < acc) {
        archetype = key;
        break;
      }
    }
    // Three students have an account but nothing recorded yet, to show "no data" states.
    const nodata = i % 50 === 49;
    const branchTeachers = teachers.filter((t) => t.branch === branch);
    const teacher = branchTeachers[Math.floor(i / 4) % branchTeachers.length];
    students.push({
      id: `${ID_PREFIX}${branch}-${String(i + 1).padStart(3, "0")}`,
      email: `student${String(i + 1).padStart(3, "0")}@${DEMO_DOMAIN}`,
      name,
      gender: female ? "Female" : "Male",
      branch,
      year,
      semester: year * 2 - 1,
      section,
      gradYear: 2027 + (4 - year),
      archetype: nodata ? "nodata" : archetype,
      teacherKey: teacher.key,
    });
  }

  const subjectNames = [
    ...new Set(BRANCHES.flatMap((b) => [1, 2, 3, 4].flatMap((y) => SUBJECTS[b][y]))),
  ];
  const subjectHeld = Object.fromEntries(subjectNames.map((s) => [s, 36 + (s.length % 7)]));

  // ------------------------------------------------------------ per-student academic data
  for (const s of students) {
    if (s.archetype === "nodata") {
      s.record = base(s, { subjects: [] });
      continue;
    }
    const p = PROFILE[s.archetype];
    const completed = s.semester - 1;
    const cgpaTarget = between(...p.cgpa);
    let grades = [];
    for (let k = 0; k < completed; k++) {
      let g = cgpaTarget + between(-0.5, 0.5);
      if (s.archetype === "academicRisk") g += (completed - 1 - k) * 0.25 - 0.4;
      if (s.archetype === "lowAttendance" && k === completed - 1) g -= 0.4;
      grades.push(round1(clamp(g, 3.5, 10)));
    }
    s.cgpa = grades.length ? round1(grades.reduce((a, c) => a + c, 0) / grades.length) : 0;
    s.grades = grades;
    s.backlogs =
      s.archetype === "academicRisk" && grades.length
        ? int(1, 3)
        : s.archetype === "lowAttendance" && chance(0.2)
          ? 1
          : 0;
    const att = between(...p.att);
    s.subjects = SUBJECTS[s.branch][s.year].map((subject) => {
      const held = subjectHeld[subject];
      let pct = att + between(-6, 6);
      if (s.archetype === "lowAttendance" && chance(0.4)) pct -= between(5, 12);
      const attended = clamp(Math.round((clamp(pct, 35, 100) / 100) * held), 0, held);
      const marks = Math.round(clamp(between(...p.marks) + between(-8, 8), 18, 99));
      return { subject, marks, classesHeld: held, classesAttended: attended };
    });
    // Skills: tests recorded in the last 60 days. Some students have never taken one category.
    s.assessments = [];
    s.skills = { coding: -1, aptitude: -1, analytical: -1, verbal: -1, communication: -1 };
    for (const key of SKILL_KEYS) {
      if (chance(0.12)) continue;
      let level = between(...p.skill);
      if (s.archetype === "placementGap" && key === "aptitude") level = between(28, 48);
      if (s.archetype === "placementGap" && key === "coding") level = between(72, 92);
      const tests = int(1, 3);
      for (let t = 0; t < tests; t++)
        s.assessments.push({
          id: null,
          category: key,
          topic: pick(TOPICS[key]),
          score: Math.round(clamp(level + between(-9, 9), 5, 100)),
          takenOn: addDays(today, -int(2, 60)),
        });
      const mine = s.assessments
        .filter((a) => a.category === key)
        .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
      s.skills[key] = Math.round(
        mine.slice(-3).reduce((a, c) => a + c.score, 0) / Math.min(3, mine.length),
      );
    }
    s.resume = Math.round(clamp(between(...p.resume), 10, 100));
    s.assessmentsRequired = 4;
    s.assessmentsDone = Math.min(4, Math.max(0, Math.round(between(0, 4) * (p.skill[1] / 90))));
    const mockCount = int(...p.mock);
    s.mocks = Array.from({ length: mockCount }, (_, k) => ({
      date: addDays(today, -int(5, 70) - k),
      interviewer: pick([
        "Placement Cell Panel",
        "Alumni Mentor",
        "Industry Volunteer",
        "Faculty Panel",
      ]),
      score: Math.round(clamp(between(...p.skill) + between(-10, 10), 20, 98)),
      feedback: pick([
        "Clear on fundamentals; work on structuring longer answers.",
        "Good problem solving. Practise explaining trade-offs aloud.",
        "Confident delivery. Revise core subject questions.",
        "Needs more examples from projects and internships.",
      ]),
    }));
    s.targetRoles = chance(0.85)
      ? [pick(ROLES), ...(chance(0.4) ? [pick(ROLES)] : [])].filter((v, i, a) => a.indexOf(v) === i)
      : [];
  }

  // ------------------------------------------------------------ teachers' subjects, LMS content
  const teachersOfSubject = new Map();
  for (const s of students)
    if (s.subjects)
      for (const x of s.subjects) {
        const set = teachersOfSubject.get(x.subject) ?? new Set();
        set.add(s.teacherKey);
        teachersOfSubject.set(x.subject, set);
      }
  const lms = { units: [], materials: [], assignments: [], syllabus: [] };
  for (const subject of subjectNames) {
    const owners = [...(teachersOfSubject.get(subject) ?? [])].sort();
    if (!owners.length) continue;
    const owner = owners[0];
    // The course header of the syllabus: code, credits, outcomes and the books, as a printed
    // course sheet carries them.
    const words = subject.split(/\s+/);
    const code =
      (words.length > 1 ? words.map((w) => w[0]).join("") : subject.slice(0, 3))
        .toUpperCase()
        .slice(0, 4) + String(101 + (subjectNames.indexOf(subject) % 80));
    lms.syllabus.push({
      subject,
      code,
      title: subject,
      lectures: 3,
      tutorials: 1,
      practicals: subject.match(/Lab|Programming|Workshop/) ? 2 : 0,
      credits: 4,
      outcomes: [
        `explain the foundations of ${subject.toLowerCase()} and the vocabulary used in it.`,
        `apply the core methods of ${subject.toLowerCase()} to standard problems.`,
        `analyse a given problem and choose a suitable approach, with reasons.`,
        `carry out the practical work of the course and report the results.`,
        `review a case study and judge the result against the course criteria.`,
      ].join("\n"),
      textbooks: [
        `${subject.toUpperCase()}: A COURSE TEXT by R. NARAYANAN, OXFORD`,
        `FUNDAMENTALS OF ${subject.toUpperCase()} by S. MEHTA, PEARSON`,
      ].join("\n"),
      references: [
        `${subject.toUpperCase()} THROUGH EXAMPLES by A. KULKARNI, WILEY`,
        `PROBLEMS AND SOLUTIONS IN ${subject.toUpperCase()} by P. RAO, MC GRAW HILL`,
      ].join("\n"),
      session: `${Number(today.slice(0, 4))}-${String((Number(today.slice(0, 4)) + 1) % 100).padStart(2, "0")}`,
      owner,
    });
    UNIT_THEMES.forEach((theme, u) => {
      const unit = u + 1;
      lms.units.push({
        subject,
        unit,
        title: `${theme}`,
        topics: [
          `${theme.toLowerCase()} of ${subject.toLowerCase()}`,
          "definitions and notation",
          "worked examples",
          "standard methods and when each applies",
          "common mistakes and how to avoid them",
          "review questions",
        ].join(", "),
      });
      lms.materials.push({
        key: `${subject}|${unit}|note`,
        subject,
        unit,
        kind: "note",
        title: `${subject} Unit ${unit} lecture notes`,
        description: `Summary notes for ${theme.toLowerCase()}.`,
        url: "",
        owner,
      });
      lms.materials.push({
        key: `${subject}|${unit}|video`,
        subject,
        unit,
        kind: "video",
        title: `${theme}: recorded lecture`,
        description: "Reference lecture from the NPTEL archive.",
        url: "https://nptel.ac.in/courses",
        owner,
      });
      if (unit === 1)
        lms.materials.push({
          key: `${subject}|${unit}|file`,
          subject,
          unit,
          kind: "file",
          title: `${subject} course outline`,
          description: "Syllabus, evaluation scheme and reading list.",
          url: "",
          owner,
          fileName: `${slug(subject)}-outline.txt`,
          fileText: `${subject}\nCourse outline\n\nUnits: ${UNIT_THEMES.join(", ")}\nEvaluation: assignments, internal tests, end-semester exam.\n(Synthetic demo content)\n`,
        });
    });
    // One assignment for each of the first four units, a mix of past and upcoming due dates.
    const dueOffsets = [-18, -7, 4, 14];
    dueOffsets.forEach((offset, u) =>
      lms.assignments.push({
        key: `${subject}|${u + 1}`,
        subject,
        unit: u + 1,
        title: `${subject}: Assignment ${u + 1}`,
        instructions: `Answer all questions on ${UNIT_THEMES[u].toLowerCase()}. Show your working.`,
        assignedOn: addDays(today, offset - 14),
        dueOn: addDays(today, offset),
        maxMarks: 10,
        owner,
      }),
    );
  }

  // Progress and submissions follow each student's archetype.
  const progress = [];
  const submissions = [];
  for (const s of students) {
    if (!s.subjects || !s.subjects.length) continue;
    const p = PROFILE[s.archetype];
    for (const x of s.subjects) {
      for (const m of lms.materials.filter((m) => m.subject === x.subject && m.kind !== "file")) {
        const decay = 1 - (m.unit - 1) * 0.12;
        if (chance(clamp(p.lms * decay, 0, 0.98)))
          progress.push({
            materialKey: m.key,
            studentId: s.id,
            completedOn: addDays(today, -int(1, 30)),
          });
      }
      for (const a of lms.assignments.filter((a) => a.subject === x.subject)) {
        const past = a.dueOn < today;
        const prob = past ? p.sub : a.unit === 3 ? p.sub * 0.45 : p.sub * 0.1;
        if (!chance(prob)) continue;
        const late = past && chance(s.archetype === "strong" ? 0.03 : 0.2);
        const submittedOn = late ? addDays(a.dueOn, int(1, 4)) : addDays(a.dueOn, -int(1, 9));
        const graded = past;
        const ratio = clamp((p.marks[0] + p.marks[1]) / 200 + between(-0.18, 0.18), 0.2, 1);
        submissions.push({
          assignmentKey: a.key,
          studentId: s.id,
          answer: `My answer for ${a.title}. (Synthetic demo submission)`,
          submittedAt: atTime(submittedOn, int(9, 21), int(0, 59)),
          marks: graded ? Math.round(ratio * a.maxMarks * 2) / 2 : null,
          remarks: graded
            ? pick([
                "Good work.",
                "Clear steps, revise question 3.",
                "Well structured.",
                "Please show more working.",
                "",
              ])
            : "",
          gradedBy: graded ? s.teacherKey : null,
          gradedAt: graded ? atTime(addDays(submittedOn, int(1, 3)), 15, 30) : null,
        });
      }
    }
  }

  // ------------------------------------------------------------ placement drives
  const drives = [
    {
      key: "infosys",
      company: "Infosys",
      roleTitle: "Systems Engineer Trainee",
      package: "4.5 LPA",
      deadline: addDays(today, 9),
      driveDate: addDays(today, 20),
      minCgpa: 6.5,
      maxBacklogs: 0,
      branches: ["CSE", "IT"],
      gradYear: 2027,
      requiresAssessment: false,
      description:
        "Campus drive for the 2027 batch. Online test followed by technical and HR interviews.",
    },
    {
      key: "tcs",
      company: "TCS Digital",
      roleTitle: "Digital Engineer",
      package: "7 LPA",
      deadline: addDays(today, 14),
      driveDate: addDays(today, 25),
      minCgpa: 7.0,
      maxBacklogs: 1,
      branches: ["CSE", "IT", "ECE"],
      gradYear: 2027,
      requiresAssessment: false,
      description: "Advanced coding round and a technical interview.",
    },
    {
      key: "wipro",
      company: "Wipro",
      roleTitle: "Project Engineer",
      package: "3.5 LPA",
      deadline: addDays(today, 5),
      driveDate: addDays(today, 12),
      minCgpa: 6.0,
      maxBacklogs: 2,
      branches: [],
      gradYear: 2027,
      requiresAssessment: true,
      description: "Open to all branches. All placement assessments must be completed.",
    },
    {
      key: "bosch",
      company: "Bosch",
      roleTitle: "Embedded Systems Engineer",
      package: "6.5 LPA",
      deadline: addDays(today, 21),
      driveDate: addDays(today, 32),
      minCgpa: 7.5,
      maxBacklogs: 0,
      branches: ["ECE", "MECH"],
      gradYear: 2027,
      requiresAssessment: false,
      description: "Core engineering role with a design problem round.",
    },
    {
      key: "lnt",
      company: "L&T Technology Services",
      roleTitle: "Graduate Engineer Trainee",
      package: "4 LPA",
      deadline: addDays(today, 3),
      driveDate: addDays(today, 10),
      minCgpa: 6.5,
      maxBacklogs: 1,
      branches: ["MECH", "ECE"],
      gradYear: 2027,
      requiresAssessment: false,
      description: "Applications close soon.",
    },
    {
      key: "accenture",
      company: "Accenture",
      roleTitle: "Associate Software Engineer",
      package: "4.6 LPA",
      deadline: addDays(today, -10),
      driveDate: addDays(today, -3),
      minCgpa: 6.0,
      maxBacklogs: 1,
      branches: [],
      gradYear: 2027,
      requiresAssessment: false,
      description: "This drive has closed. Results are published.",
    },
  ].map((d) => ({ ...d, owner: teachers[0].key }));

  const eligible = (s, d) =>
    s.cgpa > 0 &&
    s.cgpa >= d.minCgpa &&
    s.backlogs <= d.maxBacklogs &&
    (!d.branches.length || d.branches.includes(s.branch)) &&
    (!d.gradYear || s.gradYear === d.gradYear) &&
    (!d.requiresAssessment ||
      (s.assessmentsRequired > 0 && s.assessmentsDone >= s.assessmentsRequired));
  const applications = [];
  for (const s of students) {
    if (s.archetype === "nodata") continue;
    for (const d of drives) {
      if (!eligible(s, d) || !chance(0.55)) continue;
      const closed = d.deadline < today;
      const roll = rand();
      const status = closed
        ? roll < 0.2
          ? "selected"
          : roll < 0.55
            ? "rejected"
            : "shortlisted"
        : roll < 0.6
          ? "applied"
          : roll < 0.85
            ? "shortlisted"
            : roll < 0.93
              ? "selected"
              : "rejected";
      applications.push({
        driveKey: d.key,
        studentId: s.id,
        status,
        appliedOn: addDays(d.deadline, -int(2, 12)),
      });
    }
  }

  // ------------------------------------------------------------ engagement opportunities
  const opportunities = [
    {
      key: "symposium",
      type: "event",
      title: "Annual Tech Symposium",
      purpose: "Showcase student projects and hear from industry speakers.",
      benefits: "Networking, certificates of participation and project feedback.",
      requirements: "Register a team or attend as a participant.",
      eligibility: "All years and branches.",
      howToApply: "Register through your mentor before the deadline.",
      deadline: addDays(today, 12),
    },
    {
      key: "alumni",
      type: "event",
      title: "Alumni Interaction Day",
      purpose: "Career conversations with recent graduates.",
      benefits: "Referrals, interview tips and mentoring.",
      requirements: "Prepare two questions.",
      eligibility: "Final and pre-final year.",
      howToApply: "Sign up with the placement cell.",
      deadline: addDays(today, 6),
    },
    {
      key: "coding-club",
      type: "club",
      title: "Coding Club",
      purpose: "Weekly practice and contests for problem solving.",
      benefits: "Better coding scores and contest ratings.",
      requirements: "Attend at least two sessions a month.",
      eligibility: "Open to everyone.",
      howToApply: "Join with your club coordinator.",
      deadline: "",
    },
    {
      key: "robotics",
      type: "club",
      title: "Robotics Club",
      purpose: "Build and test autonomous robots.",
      benefits: "Hands-on hardware and control experience.",
      requirements: "Commitment of four hours a week.",
      eligibility: "ECE and MECH preferred.",
      howToApply: "Meet the faculty coordinator.",
      deadline: "",
    },
    {
      key: "cultural",
      type: "club",
      title: "Cultural and Literary Club",
      purpose: "Events, debates and creative writing.",
      benefits: "Confidence and communication practice.",
      requirements: "None.",
      eligibility: "Open to everyone.",
      howToApply: "Join any Friday session.",
      deadline: "",
    },
    {
      key: "smart-campus",
      type: "hackathon",
      title: "Smart Campus Hackathon",
      purpose: "Solve real campus problems in a 24-hour build.",
      benefits: "Prizes, mentoring and portfolio projects.",
      requirements: "Teams of three or four.",
      eligibility: "All branches.",
      howToApply: "Register your team online.",
      deadline: addDays(today, 16),
    },
    {
      key: "code-sprint",
      type: "hackathon",
      title: "Code Sprint 24h",
      purpose: "A competitive coding marathon.",
      benefits: "Ranking and recruiter visibility.",
      requirements: "Solo or pairs.",
      eligibility: "CSE and IT.",
      howToApply: "Registration has closed.",
      deadline: addDays(today, -5),
    },
    {
      key: "cloud-cert",
      type: "certification",
      title: "Cloud Practitioner Certification",
      purpose: "Foundational cloud knowledge.",
      benefits: "An industry-recognised credential.",
      requirements: "Complete the preparatory course and pass the exam.",
      eligibility: "Second year and above.",
      howToApply: "Enrol through your mentor.",
      deadline: addDays(today, 40),
    },
    {
      key: "python-cert",
      type: "certification",
      title: "Python for Data Science (NPTEL)",
      purpose: "Practical data analysis with Python.",
      benefits: "NPTEL certificate and project experience.",
      requirements: "Finish weekly assignments.",
      eligibility: "All branches.",
      howToApply: "Enrol on the NPTEL portal and share your roll number.",
      deadline: addDays(today, 25),
    },
    {
      key: "embedded-cert",
      type: "certification",
      title: "Embedded Systems Fundamentals",
      purpose: "Microcontroller programming basics.",
      benefits: "Lab experience and a certificate.",
      requirements: "Lab attendance.",
      eligibility: "ECE and MECH.",
      howToApply: "Register with the lab coordinator.",
      deadline: addDays(today, 30),
    },
  ].map((o) => ({ ...o, owner: teachers[1].key, link: "" }));

  const participation = [];
  for (const s of students) {
    if (s.archetype === "nodata") continue;
    const p = PROFILE[s.archetype];
    if (!chance(0.35 + p.engage * 0.6)) continue;
    const count = int(1, s.archetype === "strong" ? 4 : 2);
    const chosen = new Set();
    for (let k = 0; k < count; k++) chosen.add(pick(opportunities).key);
    for (const key of chosen) {
      const o = opportunities.find((x) => x.key === key);
      const roll = rand();
      const status =
        roll < 0.18
          ? "interested"
          : roll < 0.38
            ? "applied"
            : roll < 0.58
              ? "participating"
              : "completed";
      const verified = status === "completed" && chance(0.7);
      participation.push({
        opportunityKey: key,
        studentId: s.id,
        status,
        evidence:
          status === "completed"
            ? pick([
                "Certificate uploaded to the mentor",
                "Project repository shared",
                "Attendance sheet signed",
                "",
              ])
            : "",
        verified,
        type: o.type,
        title: o.title,
        date: addDays(today, -int(3, 80)),
      });
    }
  }

  // ------------------------------------------------------------ ratings, notes, complaints, support
  const ratings = [];
  for (const s of students) {
    if (s.archetype === "nodata" || !chance(0.6)) continue;
    const base = {
      strong: 4.4,
      steady: 3.8,
      lowAttendance: 3.2,
      academicRisk: 2.9,
      placementGap: 3.6,
    }[s.archetype];
    const star = () => clamp(Math.round(base + between(-1.1, 1.1)), 1, 5);
    const r = {
      studentId: s.id,
      teaching: star(),
      content: star(),
      support: star(),
      facilities: star(),
      createdOn: addDays(today, -int(1, 20)),
      comment: pick([
        "",
        "",
        "More lab hours would help.",
        "Mentor sessions are useful.",
        "Notes arrive late sometimes.",
      ]),
    };
    ratings.push(r);
  }
  const noteTexts = [
    "Participates well in class. Encourage more practice problems.",
    "Needs to improve regularity. Discussed a weekly study plan.",
    "Strong lab performance. Suggested a certification.",
    "Attendance is a concern. Please meet before the next internal test.",
    "Good progress this month. Keep the momentum.",
  ];
  const teacherName = Object.fromEntries(teachers.map((t) => [t.key, t.name]));
  for (const s of students) {
    if (s.archetype === "nodata") continue;
    s.facultyFeedback = chance(0.45)
      ? Array.from({ length: int(1, 2) }, () => ({
          from: teacherName[s.teacherKey],
          note: pick(noteTexts),
          date: addDays(today, -int(2, 50)),
        }))
      : [];
    s.studentFeedback = chance(0.25)
      ? [
          {
            about: pick(["Teaching", "Course content", "Campus facilities"]),
            note: pick([
              "The pace of the course is a little fast.",
              "More practical sessions would help.",
              "Doubt hours have been very useful.",
            ]),
            date: addDays(today, -int(2, 40)),
          },
        ]
      : [];
  }

  const interventions = [];
  const interventionText = {
    lowAttendance: [
      "Attendance below 75% in more than one subject.",
      "Meet the student, agree an attendance recovery plan and inform the parent.",
    ],
    academicRisk: [
      "Low CGPA with active backlogs.",
      "Weekly remedial sessions and a backlog clearance plan.",
    ],
    placementGap: [
      "Placement readiness is low although academics are strong.",
      "Resume workshop, aptitude practice and a mock interview this month.",
    ],
  };
  for (const s of students) {
    const text = interventionText[s.archetype];
    if (!text || !chance(0.65)) continue;
    const roll = rand();
    const status = roll < 0.35 ? "open" : roll < 0.65 ? "in-progress" : "resolved";
    interventions.push({
      studentId: s.id,
      teacherKey: s.teacherKey,
      reason: text[0],
      action: text[1],
      priority: s.archetype === "academicRisk" ? "high" : pick(["medium", "medium", "high", "low"]),
      owner: teacherName[s.teacherKey],
      followUpDate: addDays(today, status === "resolved" ? -int(3, 20) : int(-8, 18)),
      status,
      outcome:
        status === "resolved"
          ? pick([
              "Attendance improved above 75%.",
              "Backlog cleared in the supplementary exam.",
              "Resume completed and two mock interviews done.",
            ])
          : "",
      createdOn: addDays(today, -int(10, 50)),
    });
  }

  const complaintDrafts = [
    [
      "facilities",
      "Library hours",
      "The library closes too early during exam weeks. Could the hours be extended until 9 PM?",
      "resolved",
      "Hours have been extended during exam weeks.",
    ],
    [
      "academic",
      "Timetable clash",
      "Two lab sessions overlap on Thursday afternoons. Please review the timetable.",
      "in-review",
      "",
    ],
    [
      "faculty",
      "Doubt clearing",
      "It is hard to reach a faculty member for doubts outside class hours.",
      "new",
      "",
    ],
    ["other", "Hostel Wi-Fi", "The hostel Wi-Fi is unreliable in the evenings.", "new", ""],
  ];
  const complaintStudents = students.filter((s) => s.archetype !== "nodata");
  const complaints = complaintDrafts.map((c, i) => ({
    studentId: complaintStudents[i * 17 + 3].id,
    category: c[0],
    subject: c[1],
    body: c[2],
    status: c[3],
    response: c[4],
    createdOn: addDays(today, -int(2, 25)),
  }));

  const updates = [
    {
      category: "placement",
      title: "Infosys campus drive registrations open",
      body: "Final year CSE and IT students meeting the criteria can apply from the Placement page.",
      company: "Infosys",
      eventDate: addDays(today, 20),
      owner: teachers[0].key,
    },
    {
      category: "placement",
      title: "TCS Digital drive announced",
      body: "Check your eligibility checklist before applying.",
      company: "TCS",
      eventDate: addDays(today, 25),
      owner: teachers[0].key,
    },
    {
      category: "event",
      title: "Annual Tech Symposium",
      body: "Project showcase and industry talks. Register through your mentor.",
      company: "",
      eventDate: addDays(today, 18),
      owner: teachers[1].key,
    },
    {
      category: "notice",
      title: "Internal test schedule",
      body: "Internal tests begin next week. The timetable is on the notice board.",
      company: "",
      eventDate: addDays(today, 7),
      owner: teachers[2].key,
    },
    {
      category: "notice",
      title: "Attendance shortage list",
      body: "Students below 75% should meet their mentors this week.",
      company: "",
      eventDate: "",
      owner: teachers[3].key,
    },
    {
      category: "event",
      title: "Alumni Interaction Day",
      body: "Meet recent graduates and ask about their careers.",
      company: "",
      eventDate: addDays(today, 10),
      owner: teachers[4].key,
    },
    {
      category: "placement",
      title: "Wipro Elite national hiring",
      body: "Open to all branches with CGPA 6.0 and above and no active backlogs. Aptitude round first, then a coding round and a technical interview.",
      company: "Wipro",
      eventDate: addDays(today, 32),
      owner: teachers[0].key,
    },
    {
      category: "placement",
      title: "Deloitte analyst internship",
      body: "Six-month internship with a pre-placement offer for the students who do well. Shortlisting is on CGPA and the aptitude score on record.",
      company: "Deloitte",
      eventDate: addDays(today, 14),
      owner: teachers[1].key,
    },
    {
      category: "event",
      title: "Inter-college hackathon: 36 hours",
      body: "Teams of four. Themes are healthcare, campus mobility and open data. Register with your mentor; travel is arranged by the college.",
      company: "",
      eventDate: addDays(today, 26),
      owner: teachers[2].key,
    },
    {
      category: "event",
      title: "Industry workshop: cloud and DevOps",
      body: "Two-day hands-on workshop with engineers from the placement partners. Counts as a certification once you finish the assessment.",
      company: "",
      eventDate: addDays(today, 12),
      owner: teachers[3].key,
    },
    {
      category: "notice",
      title: "Mid-semester examination timetable published",
      body: "The subject-wise timetable is on your LMS page under each subject's syllabus. Carry your identity card to every paper.",
      company: "",
      eventDate: addDays(today, 15),
      owner: teachers[1].key,
    },
    {
      category: "notice",
      title: "Scholarship forms close this month",
      body: "Merit and means scholarship forms are due at the accounts office. Bring last semester's marksheet and the income certificate.",
      company: "",
      eventDate: addDays(today, 9),
      owner: teachers[4].key,
    },
    {
      category: "notice",
      title: "Library hours extended during exams",
      body: "The reading hall stays open until 11 pm from next Monday. Borrowed books are due back before the first paper.",
      company: "",
      eventDate: addDays(today, 5),
      owner: teachers[2].key,
    },
    {
      category: "poster",
      title: "Sports meet: register your team",
      body: "Cricket, volleyball, athletics and chess. Team lists close on Friday with the physical education department.",
      company: "",
      eventDate: addDays(today, 21),
      owner: teachers[3].key,
    },
    {
      category: "poster",
      title: "Annual cultural night: Rangmanch",
      body: "Auditions for music, dance and drama all week in the auditorium. Everyone is welcome to watch the final evening.",
      company: "",
      eventDate: addDays(today, 30),
      owner: teachers[0].key,
    },
  ];

  const logins = [];
  const loginRate = {
    strong: [8, 16],
    steady: [4, 10],
    lowAttendance: [1, 5],
    academicRisk: [0, 4],
    placementGap: [4, 9],
    nodata: [0, 1],
  };
  for (const s of students) {
    const [lo, hi] = loginRate[s.archetype];
    for (let k = 0; k < int(lo, hi); k++)
      logins.push({
        email: s.email,
        at: atTime(addDays(today, -int(0, 29)), int(7, 22), int(0, 59)),
      });
  }
  for (const t of teachers)
    for (let k = 0; k < int(4, 9); k++)
      logins.push({
        email: t.email,
        at: atTime(addDays(today, -int(0, 29)), int(8, 18), int(0, 59)),
      });

  // ------------------------------------------------------------ final student records
  const satisfactionOf = new Map();
  for (const r of ratings) {
    const list = satisfactionOf.get(r.studentId) ?? [];
    list.push((r.teaching + r.content + r.support + r.facilities) / 4);
    satisfactionOf.set(r.studentId, list);
  }
  const verifiedBy = new Map();
  for (const p of participation)
    if (p.verified)
      verifiedBy.set(p.studentId, [
        ...(verifiedBy.get(p.studentId) ?? []),
        {
          type: p.type,
          name: p.title,
          date: p.date,
          verified: true,
          evidence: p.evidence || undefined,
        },
      ]);

  for (const s of students) {
    if (s.archetype === "nodata") continue;
    const engagement = verifiedBy.get(s.id) ?? [];
    const sat = satisfactionOf.get(s.id);
    s.record = base(s, {
      cgpa: s.cgpa,
      semesterGrades: s.grades,
      backlogs: s.backlogs,
      subjects: s.subjects,
      skills: s.skills,
      engagement,
      hasEngagementData: true,
      resumeCompleteness: s.resume,
      targetRoles: s.targetRoles,
      assessmentsCompleted: s.assessmentsDone,
      assessmentsRequired: s.assessmentsRequired,
      mockInterviews: s.mocks.length,
      facultyFeedback: s.facultyFeedback,
      studentFeedback: s.studentFeedback,
      ...(sat ? { satisfaction: round1(sat.reduce((a, c) => a + c, 0) / sat.length) } : {}),
      lmsLoginsPerWeek: round1(logins.filter((l) => l.email === s.email).length / 4.3),
    });
  }

  function base(s, over) {
    return {
      id: s.id,
      name: s.name,
      branch: s.branch,
      semester: s.semester,
      gradYear: s.gradYear,
      gender: s.gender,
      course: "B.Tech",
      section: s.section,
      mentorId: "",
      cgpa: 0,
      semesterGrades: [],
      backlogs: 0,
      subjects: [],
      lms: [],
      skills: { coding: -1, aptitude: -1, analytical: -1, verbal: -1, communication: -1 },
      engagement: [],
      resumeCompleteness: -1,
      targetRoles: [],
      assessmentsCompleted: 0,
      assessmentsRequired: 0,
      facultyFeedback: [],
      studentFeedback: [],
      ...over,
    };
  }

  return {
    today,
    teachers,
    students,
    lms,
    progress,
    submissions,
    drives,
    applications,
    opportunities,
    participation,
    ratings,
    interventions,
    complaints,
    updates,
    logins,
  };
}
