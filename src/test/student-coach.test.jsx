import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ask = vi.fn();
vi.mock("@/lib/student-coach.functions", () => ({
  askStudentCoach: (...a) => ask(...a),
  loadCoachSuggestions: vi.fn(async () => ({
    students: 164,
    group: "your class",
    list: [
      "How do I compare with my class?",
      "Who is better than me in attendance, and what do they do differently?",
      "What should I improve first to raise my score?",
    ],
  })),
}));
// the answer view is shared with the Analytics Copilot; a stand-in keeps this test small
vi.mock("@/components/portal/AnalyticsCopilot", () => ({
  Answer: ({ turn }) => <div data-testid="answer">{turn.answer}</div>,
}));
vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children }) => <span>{children}</span>,
}));

import { StudentCoach } from "@/components/portal/StudentCoach";

const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StudentCoach />
    </QueryClientProvider>,
  );

// jsdom cannot scroll; the page scrolls to the newest answer in a browser
Element.prototype.scrollIntoView = () => {};

beforeEach(() => ask.mockReset());

describe("the student's coach chat", () => {
  it("says other students are anonymous and offers questions to start with", async () => {
    show();
    expect(screen.getByText("Other students stay anonymous")).toBeInTheDocument();
    expect(await screen.findByText(/Comparing you with 164 students/)).toBeInTheDocument();
    expect(await screen.findByText("How do I compare with my class?")).toBeInTheDocument();
    expect(
      screen.getByText(/Names\s+and IDs of other students are never shown/),
    ).toBeInTheDocument();
  });

  it("sends a suggested question and shows the answer", async () => {
    ask.mockResolvedValue({
      answer: "You rank 9 of 12 in your class. [E1]",
      evidence: [],
      note: null,
    });
    show();
    fireEvent.click(
      await screen.findByText(
        "Who is better than me in attendance, and what do they do differently?",
      ),
    );
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0][0]).toEqual({
      data: {
        question: "Who is better than me in attendance, and what do they do differently?",
        messages: [],
      },
    });
    expect(await screen.findByTestId("answer")).toHaveTextContent("You rank 9 of 12");
  });

  it("sends what was said earlier with the next question, so the coach can follow on", async () => {
    ask.mockResolvedValue({ answer: "First answer", evidence: [], note: null });
    show();
    const box = screen.getByLabelText("Ask your coach");
    fireEvent.change(box, { target: { value: "Where do I rank?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByTestId("answer");
    fireEvent.change(box, { target: { value: "And in coding?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls[1][0].data.messages).toEqual([
      { role: "user", content: "Where do I rank?" },
      { role: "assistant", content: "First answer" },
    ]);
  });

  it("shows why a plain summary was given when the AI could not be reached", async () => {
    ask.mockResolvedValue({
      answer: "Plain summary",
      evidence: [],
      note: "The AI provider's usage limit has been reached.",
    });
    show();
    fireEvent.change(screen.getByLabelText("Ask your coach"), {
      target: { value: "Where do I rank?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByText(/usage limit has been reached/)).toBeInTheDocument();
  });

  it("shows an error, and a new conversation clears the chat", async () => {
    ask.mockRejectedValueOnce(new Error("Too many questions. Please wait a few minutes."));
    show();
    fireEvent.change(screen.getByLabelText("Ask your coach"), {
      target: { value: "Where do I rank?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many questions");
    ask.mockResolvedValue({ answer: "Fine", evidence: [], note: null });
    fireEvent.change(screen.getByLabelText("Ask your coach"), {
      target: { value: "Try again please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByTestId("answer");
    fireEvent.click(screen.getByRole("button", { name: /New conversation/ }));
    expect(screen.queryByTestId("answer")).not.toBeInTheDocument();
    expect(screen.getByText("Ask your coach", { selector: "h2" })).toBeInTheDocument();
  });
});
