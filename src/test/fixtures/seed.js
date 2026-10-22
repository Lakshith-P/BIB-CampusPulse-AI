// Test fixtures: fictional students used only by the unit tests.
const TOPICS = [
  "Foundations",
  "Core Concepts",
  "Applied Methods",
  "Advanced Topics",
  "Case Studies",
  "Revision & Assessment",
];
function makeUnits(subject, completedUnits, seedOffset) {
  return TOPICS.map((title, i) => {
    const done = i < completedUnits;
    return {
      unit: i + 1,
      title: `${subject}: ${title}`,
      lessons: [1, 2, 3].map((n) => ({
        title: `Lesson ${i + 1}.${n}`,
        completed: done || (i === completedUnits && n === 1 && seedOffset % 2 === 0),
        resource: `Sample resource: ${subject} notes pack ${i + 1}.${n} (demo)`,
      })),
      assignment: {
        title: `Assignment ${i + 1}: ${title}`,
        deadline: `2026-0${Math.min(9, 3 + i)}-1${(i + seedOffset) % 9}`,
        submitted: done,
        marks: done ? 14 + ((i * 7 + seedOffset) % 7) : null,
      },
    };
  });
}
function lms(subjects, completion, offset) {
  return subjects.map((s, i) => ({
    subject: s,
    units: makeUnits(s, completion[i] ?? 0, offset + i),
  }));
}
const SUBJ = ["Data Structures", "DBMS", "Operating Systems", "Computer Networks"];
function subj(marks, held, att) {
  return SUBJ.map((s, i) => ({
    subject: s,
    marks: marks[i] ?? 0,
    classesHeld: held[i] ?? 0,
    classesAttended: att[i] ?? 0,
  }));
}
export { SEED_STUDENTS } from "./seed-students";
export const SEED_DRIVES = [
  {
    id: "DRV-01",
    company: "TechNova (fictional)",
    role: "SDE",
    minCgpa: 7.5,
    maxBacklogs: 0,
    branches: ["CSE", "IT"],
    gradYear: 2027,
    requiresAssessment: true,
  },
  {
    id: "DRV-02",
    company: "DataCraft (fictional)",
    role: "Data Analyst",
    minCgpa: 7.0,
    maxBacklogs: 1,
    branches: ["CSE", "IT", "ECE"],
    gradYear: 2027,
    requiresAssessment: true,
  },
  {
    id: "DRV-03",
    company: "EmbedWorks (fictional)",
    role: "Embedded Engineer",
    minCgpa: 6.5,
    maxBacklogs: 2,
    branches: ["ECE"],
    gradYear: 2027,
    requiresAssessment: false,
  },
  {
    id: "DRV-04",
    company: "CoreMech (fictional)",
    role: "Design Engineer",
    minCgpa: 6.0,
    maxBacklogs: 2,
    branches: ["ME"],
    gradYear: 2027,
    requiresAssessment: false,
  },
];
export const MENTORS = [
  { id: "FAC-01", name: "Dr. Rao" },
  { id: "FAC-02", name: "Prof. Iyer" },
];
export const SAMPLE_CSV = `student_id,name,branch,semester,grad_year,cgpa,backlogs,attendance_pct,coding,aptitude,analytical,verbal,communication,resume_completeness
BIB-2026-009,Nikhil Rao,CSE,6,2027,7.4,0,82,70,65,68,72,71,66
BIB-2026-010,Divya Menon,IT,4,2028,8.3,0,91,78,80,82,75,77,70
BIB-2026-009,Duplicate Row,CSE,6,2027,7.4,0,82,70,65,68,72,71,66
BIB-2026-011,,ECE,6,2027,6.8,1,77,60,58,62,66,64,50`;
