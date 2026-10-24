import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ID = "00000000-0000-4000-8000-000000000001";
const interview = {
  id: ID,
  role: "Analyst",
  difficulty: "easy",
  questions: [
    { index: 0, type: "hr", question: "Tell me about yourself." },
    { index: 1, type: "hr", question: "Why this role?" },
  ],
};
const result = {
  id: ID,
  role: "Analyst",
  overall: 40,
  summary: "ok",
  strengths: [],
  improvements: [],
  byType: { hr: 40 },
  violations: 3,
  terminated: true,
  questions: [],
};

let violations = 0;
const report = vi.fn(async () => ({ violations: ++violations, ended: violations >= 3 }));
const submit = vi.fn(async () => result);

vi.mock("@/lib/platform.functions", () => ({
  startMockInterview: vi.fn(async () => interview),
  submitMockInterview: (...a) => submit(...a),
  reportInterviewViolation: (...a) => report(...a),
  loadInterviewResult: vi.fn(),
  removeInterview: vi.fn(),
  removeMyResume: vi.fn(),
  saveMyResume: vi.fn(),
  downloadMyResume: vi.fn(),
}));
vi.mock("@/lib/use-platform", () => ({
  KEYS: { resume: ["resume"], interviews: ["interviews"] },
  useResume: () => ({ data: null, isLoading: false }),
  useInterviews: () => ({ data: [], error: null }),
}));
vi.mock("@/lib/use-campus", () => ({
  useCampus: () => ({ profile: { id: "me", display_name: "Ann" }, rows: [] }),
}));
vi.mock("@/lib/use-speech", () => ({
  useSpeech: () => ({ speak: vi.fn(), cancel: vi.fn(), supported: false }),
}));
vi.mock("@/components/portal/PortalShell", () => ({ RoleGate: ({ children }) => children }));

import { MockInterviewHub } from "@/components/portal/InterviewPages";

const renderHub = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MockInterviewHub />
    </QueryClientProvider>,
  );

async function startRoom() {
  renderHub();
  fireEvent.change(screen.getByPlaceholderText(/Software Engineer/), {
    target: { value: "Analyst" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Start mock video interview/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Start interview in full screen/ }));
  await screen.findByText(/Exam mode/);
}

// leaving the screen: the tab becomes hidden
const leave = async () => {
  vi.setSystemTime(Date.now() + 5000); // warnings less than 1.5 s apart count as one
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
};

beforeEach(() => {
  violations = 0;
  report.mockClear();
  submit.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("interview exam mode", () => {
  it("explains the rules before the interview starts", async () => {
    renderHub();
    fireEvent.change(screen.getByPlaceholderText(/Software Engineer/), {
      target: { value: "Analyst" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Start mock video interview/ }));
    expect(await screen.findByText(/Exam rules/)).toBeInTheDocument();
    expect(screen.getByText(/After 3 warnings the interview ends/)).toBeInTheDocument();
  });

  it("warns on a tab switch, and the student can return", async () => {
    await startRoom();
    await leave();
    expect(await screen.findByText("Warning 1 of 3")).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith({ data: { id: ID, reason: "tab-switch" } });
    fireEvent.click(screen.getByRole("button", { name: /Return to the interview/ }));
    await waitFor(() => expect(screen.queryByText("Warning 1 of 3")).not.toBeInTheDocument());
    expect(submit).not.toHaveBeenCalled();
  });

  it("counts two switches in a row once, not twice", async () => {
    await startRoom();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("blur"));
    });
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("ends the interview on the third warning and shows that the teacher was told", async () => {
    await startRoom();
    await leave();
    await leave();
    await leave();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(report).toHaveBeenCalledTimes(3);
    expect(await screen.findByText(/ended early/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download report/ })).toBeInTheDocument();
  });
});
