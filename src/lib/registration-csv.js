// Bulk registration: a CSV of the students and teachers an administrator wants to give logins to.
// Columns: name, email, role (student or teacher), then for students the optional student_id,
// course, branch, section, semester, grad_year and teacher_email (the assigned teacher).

export const REGISTRATION_TEMPLATE = `name,email,role,student_id,course,branch,section,semester,grad_year,teacher_email
Asha Rao,asha@college.edu,student,S-1001,B.Tech,CSE,A,5,2027,tina@college.edu
Ravi Kumar,ravi@college.edu,student,S-1002,B.Tech,CSE,A,5,2027,tina@college.edu
Tina Teacher,tina@college.edu,teacher,,,,,,,
`;

export const MAX_REGISTRATION_ROWS = 500;
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Splits one CSV line, keeping commas inside double quotes. */
function splitLine(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

const ROLE = { student: "student", teacher: "faculty", faculty: "faculty" };

/**
 * Reads a registration CSV. Every row comes back either as a clean `user` or with the reasons it
 * cannot be used, so the administrator can fix a row without losing the rest.
 * @returns {{ rows: { line: number, user?: object, errors: string[] }[], fileErrors: string[] }}
 */
export function parseRegistrationCsv(text) {
  // A spreadsheet export may start with a byte-order mark (code 65279); drop it.
  const raw = String(text ?? "");
  const lines = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return { rows: [], fileErrors: ["The file is empty."] };
  const headers = splitLine(lines[first]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const fileErrors = ["name", "email", "role"]
    .filter((h) => !headers.includes(h))
    .map((h) => `Missing the "${h}" column.`);
  if (fileErrors.length) return { rows: [], fileErrors };

  const rows = [];
  const seen = new Set();
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i]);
    const rec = Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ""]));
    const errors = [];
    const email = rec.email.toLowerCase();
    if (!rec.name) errors.push("Name is missing.");
    if (!EMAIL.test(email)) errors.push("Email is not valid.");
    else if (seen.has(email)) errors.push("This email appears twice in the file.");
    const role = ROLE[rec.role.toLowerCase()];
    if (!role) errors.push('Role must be "student" or "teacher".');
    const semester = rec.semester ? Number(rec.semester) : undefined;
    if (rec.semester && !(Number.isInteger(semester) && semester >= 1 && semester <= 8))
      errors.push("Semester must be 1 to 8.");
    const gradYear = rec.grad_year ? Number(rec.grad_year) : undefined;
    if (rec.grad_year && !(Number.isInteger(gradYear) && gradYear >= 2020 && gradYear <= 2040))
      errors.push("Graduation year is not valid.");
    if (rec.teacher_email && !EMAIL.test(rec.teacher_email))
      errors.push("Teacher email is not valid.");
    if (EMAIL.test(email)) seen.add(email);
    rows.push({
      line: i + 1,
      errors,
      user: errors.length
        ? undefined
        : {
            name: rec.name,
            email,
            role,
            studentId: rec.student_id || undefined,
            course: rec.course || undefined,
            branch: rec.branch || undefined,
            section: rec.section || undefined,
            semester,
            gradYear,
            teacherEmail: rec.teacher_email ? rec.teacher_email.toLowerCase() : undefined,
          },
    });
  }
  if (rows.length > MAX_REGISTRATION_ROWS)
    return {
      rows: [],
      fileErrors: [`Register at most ${MAX_REGISTRATION_ROWS} people at a time.`],
    };
  return { rows, fileErrors: [] };
}
