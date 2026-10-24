import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { predictStudent } from "@/lib/prediction";
import { emptyStudent } from "@/lib/student-defaults";

const student = {
  ...emptyStudent,
  id: "S1",
  name: "Asha",
  cgpa: 6.5,
  mockInterviews: 0,
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
  exams: [
    { subject: "Maths", kind: "mid1", score: 12, max: 50 },
    { subject: "Maths", kind: "mid2", score: 14, max: 50 },
    { subject: "Coding", kind: "mid1", score: 44, max: 50 },
  ],
});

const decisions = (name, label) => [
  {
    name,
    label,
    accuracy: 0.955,
    precision: 0.863,
    recall: 0.804,
    f1: 0.832,
    support: 102,
    n: 735,
  },
];
const reliability = (name) => ({
  trainedAt: "2026-10-24T10:00:00Z",
  rows: 735,
  mae: 4.56,
  rmse: 5.58,
  r2: 0.859,
  decisions: decisions(name, "final marks below 40 (the pass mark)"),
  headline: name,
});
const learned = {
  studentId: "S1",
  trained: true,
  result: {
    subjects: [
      {
        subject: "Maths",
        value: 33.2,
        interval: { low: 24, high: 42.4 },
        headline: { name: "Fail", flagged: true, confidence: 0.82 },
        drivers: [{ feature: "Mid exams %", value: 28, average: 60, effect: -8.1 }],
        improve: [{ label: "Raise attendance from 60% to 80%", change: 20, gain: 1.4 }],
        ruleBased: 31,
      },
    ],
    reliability: reliability("Fail"),
  },
  nextSgpa: {
    value: 6.4,
    interval: { low: 5.5, high: 7.3 },
    headline: { name: "Weak semester", flagged: false, confidence: 0.71 },
    drivers: [],
    last: 6.2,
    improves: true,
    reliability: reliability("Weak semester"),
  },
  interview: {
    value: 48.5,
    interval: { low: 34, high: 63 },
    headline: { name: "Not interview-ready", flagged: true, confidence: 0.88 },
    drivers: [],
    improve: [{ label: "Raise the resume by 15 points", change: 15, gain: 3.3 }],
    reliability: reliability("Not interview-ready"),
  },
};
const report = [
  {
    key: "result_marks",
    label: "Result model",
    outcome: "Final subject marks",
    unit: "marks out of 100",
    trained: true,
    trainedAt: "2026-10-24T10:00:00Z",
    rows: 735,
    metrics: {
      mae: 4.56,
      rmse: 5.58,
      r2: 0.859,
      baselines: { "Always predict the average": { mae: 12.03 } },
      decisions: decisions("Needs attention", "final marks below 55"),
      effects: [{ feature: "Mid exams %", perUnit: 0.5542 }],
    },
  },
  {
    key: "next_sgpa",
    label: "Next-semester model",
    outcome: "Next semester's SGPA",
    unit: "SGPA",
    trained: false,
  },
];

vi.mock("@/lib/platform.functions", () => ({
  loadStudentPrediction: vi.fn(async () => ({
    studentId: "S1",
    name: "Asha",
    canEditCoding: true,
    ...prediction,
  })),
  loadPredictionInputs: vi.fn(async () => ({
    studentId: "S1",
    subjects: ["Maths"],
    coding: null,
    exams: [],
    ratings: [],
    canEditCoding: true,
  })),
  loadLearnedPredictions: vi.fn(async () => learned),
  loadModelReport: vi.fn(async () => report),
  loadAgentPlans: vi.fn(async () => ({ prediction: null })),
  trainModels: vi.fn(),
  runPredictionCoach: vi.fn(),
  runPredictionAgent: vi.fn(),
  loadPredictions: vi.fn(async () => []),
  saveCodingProfile: vi.fn(),
  addExamScore: vi.fn(),
  addTeacherRating: vi.fn(),
  deleteExamScore: vi.fn(),
  setAgentPlanItem: vi.fn(),
}));
vi.mock("@/lib/use-campus", () => ({
  useCampus: () => ({ role: "admin" }),
  campusOptions: { queryKey: ["campus"] },
}));
vi.mock("@/lib/campus.functions", () => ({ saveCampusIntervention: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import { ModelReport } from "@/components/portal/LearnedModels";
import { PredictionCoach, PredictionPanel } from "@/components/portal/PredictionPanel";
import { ToastProvider } from "@/components/ui-kit";

const wrap = (node) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider>{node}</ToastProvider>
  </QueryClientProvider>
);

describe("prediction panels", () => {
  it("shows the risk level, both predictions, the drivers and the recommended actions", async () => {
    render(wrap(<PredictionPanel />));
    expect(await screen.findByText(/Risk level: High/)).toBeInTheDocument();
    expect(screen.getByText("Placement prediction")).toBeInTheDocument();
    expect(screen.getByText("Result prediction")).toBeInTheDocument();
    expect(screen.getByLabelText("Recommended actions")).toBeInTheDocument();
    expect(screen.getAllByText(/Training & placement cell|Faculty mentor/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Sections to improve first/)).toBeInTheDocument();
  });

  it("shows the learned model's prediction with its confidence, range, accuracy and F1", async () => {
    render(wrap(<PredictionPanel />));
    expect(await screen.findByText(/Linear-regression model/)).toBeInTheDocument();
    expect(await screen.findByText("33.2")).toBeInTheDocument();
    expect(
      screen.getByText(/82% confident the marks will be below the pass mark/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Accuracy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("F1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.83").length).toBeGreaterThan(0);
    expect(screen.getByText(/Expected SGPA/)).toBeInTheDocument();
    expect(screen.getByText(/Expected mock-interview score/)).toBeInTheDocument();
  });

  it("can show only the placement half", async () => {
    render(wrap(<PredictionPanel show="placement" />));
    expect(await screen.findByText("Placement prediction")).toBeInTheDocument();
    expect(screen.queryByText("Result prediction")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Expected mock-interview score/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Expected final marks per subject/)).not.toBeInTheDocument();
  });
});

describe("model report and coach", () => {
  it("lists each model with accuracy, precision, recall and F1, and offers retraining to administrators", async () => {
    render(wrap(<ModelReport />));
    expect(await screen.findByText(/Prediction models: accuracy and F1/)).toBeInTheDocument();
    expect(screen.getByText("Result model")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Not trained yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retrain from live data/ })).toBeInTheDocument();
  });

  it("invites a student with no plan to choose a role", async () => {
    render(wrap(<PredictionCoach />));
    expect(await screen.findByText(/No plan yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cyber Security" })).toBeInTheDocument();
  });
});
