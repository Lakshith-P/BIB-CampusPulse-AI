import { describe, expect, it } from "vitest";
import { atsReport, driveMatch, extractTerms, keywordMatch, sectionsIn } from "@/lib/ats";

const GOOD = `Asha Menon
asha.menon@example.com | +91 98765 43210 | github.com/ashamenon

EDUCATION
B.Tech Computer Science, Anna University, 2022 - 2026. CGPA 8.4

EXPERIENCE
Software Intern, Zoho. Jun 2025 - Aug 2025
- Built a REST API in Java that served 12000 requests a day
- Reduced report generation time from 9s to 2s by adding SQL indexes
- Automated deployment with Docker and GitHub Actions

PROJECTS
- Developed a React dashboard showing 400 student records with live filters
- Designed a MySQL schema of 14 tables for a library system

SKILLS
Java, Python, SQL, React, Git, Docker, data structures

ACHIEVEMENTS
- Won the 2024 inter-college hackathon among 60 teams
- Certification in AWS Cloud Practitioner, 2025`;

describe("reading a resume", () => {
  it("picks out the skills it mentions, however they are spelled", () => {
    const terms = extractTerms("Worked with Node JS, Mongo, k8s and PL/SQL");
    expect(terms).toContain("node.js");
    expect(terms).toContain("nosql");
    expect(terms).toContain("kubernetes");
    expect(terms).toContain("sql");
  });

  it("handles skill names with regular-expression characters in them", () => {
    expect(extractTerms("Strong in C++ and CI/CD pipelines")).toContain("c++");
    expect(extractTerms("Strong in C++ and CI/CD pipelines")).toContain("ci/cd");
  });

  it("finds the sections an ATS looks for", () => {
    expect(sectionsIn(GOOD)).toEqual({
      education: true,
      experience: true,
      projects: true,
      skills: true,
      achievements: true,
    });
    expect(sectionsIn("Just a paragraph about me").education).toBe(false);
  });
});

describe("the ATS score", () => {
  it("scores a complete resume well and explains every check", () => {
    const report = atsReport(GOOD);
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.band).toBe("Strong");
    expect(report.checks.every((c) => c.detail && c.fix)).toBe(true);
    expect(report.checks.find((c) => c.id === "contact").state).toBe("pass");
    expect(report.checks.reduce((a, c) => a + c.max, 0)).toBe(100);
  });

  it("marks down a resume with no sections, dates, numbers or contact details", () => {
    const weak = atsReport(
      "I am a hard working person who is responsible for many things and wants a job in a good company. ".repeat(
        4,
      ),
    );
    expect(weak.score).toBeLessThan(40);
    expect(weak.checks.find((c) => c.id === "contact").state).toBe("fail");
    expect(weak.checks.find((c) => c.id === "dates").state).toBe("fail");
    expect(weak.notes.some((n) => n.includes("first person"))).toBe(true);
  });

  it("warns about a column layout, which parsers scramble", () => {
    const columns = atsReport(
      `${GOOD}\n` +
        ["Java     Expert", "SQL     Advanced", "React     Good", "Docker     Basic"].join("\n"),
    );
    expect(columns.notes.some((n) => n.includes("columns"))).toBe(true);
  });

  it("has nothing to say about a resume that is not there yet", () => {
    expect(atsReport("")).toBeNull();
    expect(atsReport("too short")).toBeNull();
  });

  it("compares the resume with the keywords of each target role", () => {
    const report = atsReport(GOOD, { roles: ["Data Analyst"] });
    const analyst = report.roleKeywords.find((r) => r.role === "Data Analyst");
    expect(analyst.matched).toContain("sql");
    expect(analyst.missing).toContain("excel");
    expect(analyst.percent).toBeGreaterThan(0);
  });
});

describe("matching a drive", () => {
  const drive = {
    company: "Zoho",
    roleTitle: "Software Engineer",
    description: "Looking for Java, SQL and Kubernetes experience. Docker is a plus.",
  };

  it("counts the keywords of the posting that the resume carries", () => {
    const m = driveMatch(GOOD, drive);
    expect(m.matched).toContain("java");
    expect(m.matched).toContain("docker");
    expect(m.percent).toBeGreaterThan(50);
    expect(m.basis).toContain("posting");
  });

  it("falls back to the keywords typical for the role when the posting lists none", () => {
    const m = driveMatch(GOOD, { company: "X", roleTitle: "Web Developer", description: "" });
    expect(m.basis).toContain("typical");
    expect(m.wanted).toContain("html");
    expect(m.missing).toContain("html");
  });

  it("says nothing at all without a resume, and nothing to match on an unknown role", () => {
    expect(driveMatch("", drive)).toBeNull();
    expect(driveMatch(GOOD, { roleTitle: "Village Astrologer", description: "" })).toBeNull();
    expect(keywordMatch(GOOD, "Village Astrologer").percent).toBeNull();
  });
});
