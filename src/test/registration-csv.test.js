import { describe, expect, it } from "vitest";
import { REGISTRATION_TEMPLATE, parseRegistrationCsv } from "@/lib/registration-csv";

describe("registration CSV", () => {
  it("reads the template: two students and a teacher", () => {
    const { rows, fileErrors } = parseRegistrationCsv(REGISTRATION_TEMPLATE);
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => r.errors)).toEqual([[], [], []]);
    expect(rows[0].user).toEqual({
      name: "Asha Rao",
      email: undefined, // left blank: the login is made from the name
      role: "student",
      studentId: "S-1001",
      course: "B.Tech",
      branch: "CSE",
      section: "A",
      semester: 5,
      gradYear: 2027,
      teacherEmail: "tina@insightiq.com",
    });
    expect(rows[2].user).toMatchObject({ role: "faculty", name: "Tina Teacher" });
  });

  it("lowercases emails, accepts quoted commas, a BOM and Windows line endings", () => {
    const { rows } = parseRegistrationCsv(
      String.fromCharCode(0xfeff) + 'Name,Email,Role\r\n"Rao, Asha",ASHA@College.edu,Student\r\n',
    );
    expect(rows[0].user).toMatchObject({
      name: "Rao, Asha",
      email: "asha@college.edu",
      role: "student",
    });
  });

  it("reports each problem against its line and keeps the good rows", () => {
    const { rows } = parseRegistrationCsv(
      [
        "name,email,role,semester",
        "Good,good@x.edu,student,3",
        ",noname@x.edu,student,",
        "Bad Mail,not-an-email,student,",
        "Bad Role,role@x.edu,principal,",
        "Bad Sem,sem@x.edu,student,12",
        "Twice,good@x.edu,student,",
      ].join("\n"),
    );
    expect(rows.filter((r) => r.user).map((r) => r.user.email)).toEqual(["good@x.edu"]);
    const reasons = Object.fromEntries(rows.map((r) => [r.line, r.errors.join(" ")]));
    expect(reasons[3]).toMatch(/Name is missing/);
    expect(reasons[4]).toMatch(/Email is not valid/);
    expect(reasons[5]).toMatch(/Role must be/);
    expect(reasons[6]).toMatch(/Semester/);
    expect(reasons[7]).toMatch(/twice/);
  });

  it("rejects a file without the required columns, an empty file and too many rows", () => {
    expect(parseRegistrationCsv("name,email\nA,a@x.edu").fileErrors).toEqual([
      'Missing the "role" column.',
    ]);
    expect(parseRegistrationCsv("").fileErrors).toEqual(["The file is empty."]);
    const many =
      "name,email,role\n" +
      Array.from({ length: 501 }, (_, i) => `P${i},p${i}@x.edu,student`).join("\n");
    expect(parseRegistrationCsv(many).fileErrors[0]).toMatch(/at most 500/);
  });
});
