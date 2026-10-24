import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const list = [
  {
    id: "a",
    role: "Analyst",
    difficulty: "easy",
    status: "terminated",
    violations: 3,
    overall: 30,
    createdAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "b",
    role: "Developer",
    difficulty: "hard",
    status: "completed",
    violations: 1,
    overall: 74,
    createdAt: "2026-10-18T10:00:00Z",
  },
];
vi.mock("@/lib/platform.functions", () => ({
  loadStudentInterviews: vi.fn(async () => list),
  loadStudentInterviewResult: vi.fn(async () => ({
    id: "a",
    role: "Analyst",
    overall: 30,
    summary: "Stopped early.",
    strengths: ["Polite"],
    improvements: ["Stay on screen"],
    byType: { hr: 30 },
    violations: 3,
    terminated: true,
    questions: [
      {
        index: 0,
        type: "hr",
        question: "Why us?",
        answer: "Money",
        score: 3,
        feedback: "Be specific",
      },
    ],
  })),
}));

import { StaffInterviews } from "@/components/portal/StaffInterviews";

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StaffInterviews studentId="S-ANN" name="Ann" />
    </QueryClientProvider>,
  );

describe("teacher view of AI interviews", () => {
  it("shows each interview with its score and the times the student left the screen", async () => {
    show();
    expect(await screen.findByText("Analyst")).toBeInTheDocument();
    expect(screen.getByText("Ended early")).toBeInTheDocument();
    expect(screen.getByText("Left the screen 3 times")).toBeInTheDocument();
    expect(screen.getByText("Left the screen 1 time")).toBeInTheDocument();
    expect(screen.getByText("74/100")).toBeInTheDocument();
  });
  it("opens one interview to read the answers, and offers the report", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Analyst/ }));
    expect(await screen.findByText(/left the interview screen 3 times/)).toBeInTheDocument();
    expect(screen.getByText("Money")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download report/ })).toBeInTheDocument();
  });
});
