import { describe, expect, it } from "vitest";

import {
  academicChanges,
  academicSnapshot,
  analyzeAcademics,
  trendOf,
} from "@/lib/academic-analytics";
import {
  applyMemory,
  itemId,
  parseJsonObject,
  placementPlanSchema,
  planningWeeks,
  sameStep,
  weekRanges,
  withIds,
} from "@/lib/agent-plan";
import { buildAcademicPlanFallback, buildCareerPlanFallback } from "@/lib/agent-fallback";
import { careerGaps, resolveTrack } from "@/lib/career-tracks";
import { gatherRoleResearch, parseRoadmap } from "@/backend/research.server";
import { emptyStudent } from "@/lib/student-defaults";

const student = (over = {}) => ({ ...emptyStudent, id: "S1", name: "A", ...over });

describe("career tracks", () => {
  it.each([
    ["Cyber Security", "cyber-security"],
    ["devops engineer", "devops"],
    ["Data Scientist / AI", "ai-data-scientist"],
    ["QA Engineer", "qa"],
    ["Full Stack Developer", "full-stack"],
    ["Underwater basket weaving", null],
  ])("maps %s", (role, slug) => expect(resolveTrack(role)).toBe(slug));

  it("reports gaps, met needs and unassessed skills", () => {
    const gaps = careerGaps({ coding: 40, analytical: 80, communication: -1 }, "devops");
    expect(gaps.find((g) => g.skill === "coding").status).toBe("gap");
    expect(gaps.find((g) => g.skill === "analytical").status).toBe("met");
    expect(gaps.find((g) => g.skill === "communication").status).toBe("not assessed");
  });
});

describe("plan memory", () => {
  const phase = (...texts) => ({
    title: "P",
    weeks: "",
    goal: "",
    items: texts.map((text) => ({ text, type: "learn" })),
  });

  it("ids are stable and near-duplicates are recognised as the same step", () => {
    expect(itemId("Learn Linux basics today")).toBe(itemId("today learn linux basics"));
    expect(
      sameStep(
        "Raise coding from 40 to 60 with practice sets",
        "Raise coding from 45 to 60 with practice sets",
      ),
    ).toBe(true);
    expect(sameStep("Learn Linux basics", "Build a portfolio website")).toBe(false);
  });

  it("drops finished steps, carries unfinished ones and keeps forgotten ones", () => {
    const previous = {
      phases: [
        {
          id: "p1",
          items: [
            { id: "a", text: "Learn Linux file permissions and users", done: true },
            { id: "b", text: "Practice TCP and DNS troubleshooting labs", done: false },
            { id: "c", text: "Write a resume summary for security roles", done: false },
          ],
        },
      ],
    };
    const next = withIds([
      phase(
        "Learn Linux file permissions and users",
        "Practice TCP and DNS troubleshooting labs",
        "Study web application attacks in OWASP Top 10",
      ),
    ]);
    const { phases, notes } = applyMemory(next, previous);
    const texts = phases.flatMap((p) => p.items.map((i) => i.text));
    expect(texts).not.toContain("Learn Linux file permissions and users");
    expect(texts.filter((t) => t.includes("TCP and DNS"))).toHaveLength(1);
    expect(texts).toContain("Study web application attacks in OWASP Top 10");
    expect(phases[0].id).toBe("carried");
    expect(phases[0].items.map((i) => i.text)).toContain(
      "Write a resume summary for security roles",
    );
    expect(notes.join(" ")).toContain("completed last time");
  });

  it("does nothing on a first run", () => {
    const next = withIds([phase("Learn something specific today")]);
    expect(applyMemory(next, null)).toEqual({ phases: next, notes: [] });
  });

  it("parses fenced model output and validates the plan shape", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJsonObject("no json here")).toThrow();
    expect(placementPlanSchema.safeParse({ summary: "short" }).success).toBe(false);
  });

  it("plans between 8 and 24 weeks and splits them across phases", () => {
    expect(planningWeeks(2099)).toBe(24);
    expect(planningWeeks(2000)).toBe(8);
    expect(weekRanges(12, 3)).toEqual(["Weeks 1-4", "Weeks 5-8", "Weeks 9-12"]);
  });
});

describe("academic analytics", () => {
  const record = student({
    cgpa: 6.8,
    semester: 4,
    semesterGrades: [6.2, 6.6, 7.0],
    backlogs: 1,
    subjects: [
      { subject: "Math", marks: 32, classesHeld: 40, classesAttended: 24 },
      { subject: "Physics", marks: 52, classesHeld: 40, classesAttended: 36 },
      { subject: "Coding", marks: 82, classesHeld: 40, classesAttended: 39 },
    ],
  });

  it("fits a trend and projects the next SGPA within bounds", () => {
    expect(trendOf([6, 7, 8]).slope).toBeCloseTo(1);
    const analysis = analyzeAcademics(record);
    expect(analysis.projection.direction).toBe("improving");
    expect(analysis.projection.nextSgpa).toBeCloseTo(7.4, 1);
    expect(analysis.projection.low).toBeLessThan(analysis.projection.nextSgpa);
    expect(analysis.projection.high).toBeLessThanOrEqual(10);
    expect(analyzeAcademics(student({ cgpa: 6, semesterGrades: [6] })).projection).toBeNull();
  });

  it("works out the SGPA needed for a target CGPA and the classes to reach 75%", () => {
    const analysis = analyzeAcademics(record, { targetCgpa: 7.5 });
    // (7.5*8 - 6.8*3) / 5 = 7.92
    expect(analysis.targetPlan.requiredAverageSgpa).toBeCloseTo(7.92, 2);
    expect(analysis.weakest[0].subject).toBe("Math");
    expect(analysis.lowAttendance[0]).toMatchObject({ subject: "Math", attendance: 60 });
    expect(analysis.lowAttendance[0].classesToReach75).toBe(24); // (75*40-100*24)/25 = 24
  });

  it("describes what changed between two runs", () => {
    const before = academicSnapshot(analyzeAcademics(record));
    const improved = student({
      ...record,
      subjects: record.subjects.map((s) => (s.subject === "Math" ? { ...s, marks: 48 } : s)),
    });
    const changes = academicChanges(before, academicSnapshot(analyzeAcademics(improved)));
    expect(changes).toEqual(["Math marks rose from 32 to 48."]);
    expect(academicChanges(null, before)).toEqual([]);
  });

  it("builds a plan of specific, numbered steps from the analysis", () => {
    const plan = buildAcademicPlanFallback(analyzeAcademics(record, { targetCgpa: 7.5 }));
    const text = plan.phases.flatMap((p) => p.items.map((i) => i.text)).join("\n");
    expect(text).toContain("Math (marks 32, below the pass mark of 40)");
    expect(text).toContain("next 24 class(es) of Math");
    expect(text).toContain("CGPA 7.5");
    expect(plan.summary).toContain("improving");
  });
});

describe("online research", () => {
  const roadmapJson = {
    title: { page: "Cyber Security Expert" },
    nodes: [
      { type: "topic", data: { label: "Networking" }, position: { y: 100 } },
      { type: "topic", data: { label: "Operating Systems" }, position: { y: 600 } },
      { type: "subtopic", data: { label: "TCP/IP" }, position: { y: 110 } },
      { type: "subtopic", data: { label: "CompTIA Security+" }, position: { y: 300 } },
      { type: "subtopic", data: { label: "Linux" }, position: { y: 610 } },
    ],
  };

  it("groups subtopics under their stage in learning order", () => {
    const roadmap = parseRoadmap(roadmapJson, "cyber-security");
    expect(roadmap.stages).toEqual([
      { name: "Networking", items: ["TCP/IP"] },
      { name: "Operating Systems", items: ["Linux"] },
    ]);
    expect(roadmap.certifications).toEqual(["CompTIA Security+"]);
  });

  it("gathers roadmap, web and reference sources and records a trace", async () => {
    const fetchImpl = async (url) => ({
      ok: true,
      json: async () =>
        url.includes("roadmap.sh")
          ? roadmapJson
          : url.includes("tavily")
            ? { results: [{ title: "Skills", url: "https://x.test/a", content: "SIEM, Splunk" }] }
            : url.includes("list=search")
              ? { query: { search: [{ title: "Computer security" }] } }
              : {
                  title: "Computer security",
                  extract: "Protection of systems.",
                  content_urls: {
                    desktop: { page: "https://en.wikipedia.org/wiki/Computer_security" },
                  },
                },
    });
    const result = await gatherRoleResearch("Cyber Security", {
      fetchImpl,
      env: { TAVILY_API_KEY: "k" },
    });
    expect(result.slug).toBe("cyber-security");
    expect(result.sources.map((s) => s.kind)).toEqual(["roadmap", "web", "web", "reference"]);
    expect(result.sources.map((s) => s.id)).toEqual(["S1", "S2", "S3", "S4"]);
    expect(result.trace.length).toBeGreaterThanOrEqual(3);
  });

  it("survives a failing source and refuses when nothing can be gathered", async () => {
    const down = async () => ({ ok: false, status: 503 });
    await expect(
      gatherRoleResearch("Cyber Security", { fetchImpl: down, env: {} }),
    ).rejects.toThrow(/online/);
  });

  it("builds a roadmap-based plan with the student's gaps first", () => {
    const research = {
      sources: [{ id: "S1", kind: "roadmap", ...parseRoadmap(roadmapJson, "cyber-security") }],
    };
    const gaps = careerGaps({ coding: 30, analytical: 70 }, "cyber-security");
    const plan = buildCareerPlanFallback({
      role: "Cyber Security",
      research,
      student: student({ gradYear: 2099, mockInterviews: 1 }),
      gaps,
    });
    const text = plan.phases.flatMap((p) => p.items.map((i) => i.text)).join("\n");
    expect(text).toContain("Learn Networking: TCP/IP");
    expect(text).toContain("Raise coding from 30");
    expect(text).toContain("Plan the CompTIA Security+ certification");
    expect(text).toContain("Complete 2 mock interview(s)");
    expect(plan.phases.at(-1).title).toBe("Get job-ready");
  });
});
