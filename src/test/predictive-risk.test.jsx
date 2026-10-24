import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { predictStudent } from "@/lib/prediction";
import { emptyStudent } from "@/lib/student-defaults";

const student = {
  ...emptyStudent,
  id: "S1",
  name: "Asha",
  cgpa: 6.5,
  resumeCompleteness: 45,
  skills: { coding: 40, aptitude: 45, analytical: 50, verbal: 50, communication: 50 },
  subjects: [
    { subject: "Maths", marks: 30, classesHeld: 40, classesAttended: 24 },
    { subject: "Coding", marks: 80, classesHeld: 40, classesAttended: 38 },
  ],
};
const prediction = predictStudent({
  student,
  coding: { easy: 20, medium: 5, hard: 0 },
  exams: [{ subject: "Maths", kind: "mid1", score: 12, max: 50 }],
});
const reliability = {
  rows: 735,
  mae: 4.56,
  r2: 0.859,
  headline: "Fail",
  decisions: [
    {
      name: "Fail",
      label: "marks below 40",
      accuracy: 0.95,
      precision: 0.86,
      recall: 0.8,
      f1: 0.83,
      support: 102,
      n: 735,
    },
  ],
};

vi.mock("@/lib/platform.functions", () => ({
  loadStudentPrediction: vi.fn(async () => ({
    studentId: "S1",
    canEditCoding: true,
    ...prediction,
  })),
  loadPredictionInputs: vi.fn(async () => ({ coding: null })),
  loadLearnedPredictions: vi.fn(async () => ({
    trained: true,
    result: {
      subjects: [
        {
          subject: "Maths",
          value: 33.2,
          interval: { low: 24, high: 42.4 },
          headline: { confidence: 0.82, flagged: true },
          improve: [{ label: "Raise attendance", gain: 1.4 }],
        },
      ],
      reliability,
    },
    nextSgpa: null,
    interview: null,
  })),
  loadAgentPlans: vi.fn(async () => ({ prediction: null })),
  runPredictionCoach: vi.fn(),
  saveCodingProfile: vi.fn(),
  setAgentPlanItem: vi.fn(),
}));
vi.mock("@/lib/use-campus", () => ({
  useCampus: () => ({ myRow: { s: student, score: 55 }, today: "2026-10-24" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import { PredictiveRisk } from "@/components/portal/PredictiveRisk";
import { ToastProvider } from "@/components/ui-kit";

const wrap = (node) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider>{node}</ToastProvider>
  </QueryClientProvider>
);

describe("Predictive Risk & AI page", () => {
  it("shows every section from real prediction data", async () => {
    render(wrap(<PredictiveRisk />));
    expect(await screen.findByText(/Risk level:/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Predictive Risk/ })).toBeInTheDocument();
    expect(screen.getByText("Needs your immediate attention")).toBeInTheDocument();
    expect(screen.getByLabelText("Placement prediction")).toBeInTheDocument();
    expect(screen.getByLabelText("Result prediction")).toBeInTheDocument();
    expect(await screen.findByText("33.2")).toBeInTheDocument();
    expect(screen.getByText(/82% confident marks will be below the pass mark/)).toBeInTheDocument();
    expect(screen.getByLabelText("Recommended action plan")).toBeInTheDocument();
    expect(screen.getByLabelText("Prediction coach")).toBeInTheDocument();
    expect(screen.getByLabelText("Risk identification breakdown")).toBeInTheDocument();
    expect(screen.getByLabelText("What makes up your Success Score")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recalculate/ })).toBeInTheDocument();
  });
});
