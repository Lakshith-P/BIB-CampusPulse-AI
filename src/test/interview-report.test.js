import { describe, expect, it } from "vitest";
import { buildInterviewReportHtml, reportFileName, verdict } from "@/lib/interview-report";

const result = {
  role: "Software Engineer <b>",
  takenAt: "2026-10-24T09:00:00.000Z",
  overall: 72,
  summary: "Good <script>alert(1)</script> start.",
  strengths: ["Clear communication"],
  improvements: ["Complexity analysis"],
  byType: { hr: 80, coding: 60 },
  violations: 1,
  terminated: false,
  questions: [
    {
      index: 0,
      type: "coding",
      question: "Reverse a list",
      answer: "Use two pointers",
      code: "a[::-1] if x < y else None",
      score: 7,
      feedback: "OK",
      better: "Swap in place",
    },
    {
      index: 1,
      type: "hr",
      question: "Why us?",
      answer: "",
      code: "",
      score: 0,
      feedback: "You did not answer this question.",
      better: "",
    },
  ],
};

describe("interview report", () => {
  it("contains the score, verdict, every question and the feedback", () => {
    const html = buildInterviewReportHtml(result, { name: "Ann" });
    expect(html).toContain("72/100");
    expect(html).toContain("Interview ready");
    expect(html).toContain("Ann · ");
    expect(html).toContain("Reverse a list");
    expect(html).toContain("Not answered");
    expect(html).toContain("Swap in place");
    expect(html).toContain("left the interview screen 1 time");
  });
  it("escapes everything the student or the model wrote", () => {
    const html = buildInterviewReportHtml(result);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Software Engineer &lt;b&gt;");
    expect(html).toContain("x &lt; y");
  });
  it("says when an interview was ended early", () => {
    const html = buildInterviewReportHtml({ ...result, terminated: true, violations: 3 });
    expect(html).toContain("ended early");
  });
  it("names the file safely and rates the score", () => {
    expect(reportFileName(result)).toBe("slqg-mock-interview-software-engineer-b-2026-10-24.html");
    expect([verdict(80), verdict(50), verdict(10)]).toEqual([
      "Interview ready",
      "Getting there",
      "Needs practice",
    ]);
  });
});
