import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const send = vi.fn(async () => ({ sent: 2, skipped: 0 }));
vi.mock("@/lib/platform.functions", () => ({ messageDashboardStudents: (...a) => send(...a) }));
vi.mock("@/lib/use-campus", () => ({
  useCampus: () => ({
    rows: [
      { id: "S-1", name: "Asha Rao", ownerId: "u1", branch: "CSE", section: "A" },
      { id: "S-2", name: "Ravi Kumar", ownerId: "u2", branch: "CSE", section: "B" },
      { id: "S-3", name: "Mira Das", ownerId: "u3", branch: "IT", section: "A" },
      { id: "S-4", name: "No Login", ownerId: null, branch: "IT", section: "A" },
    ],
  }),
}));

import { BroadcastComposer } from "@/components/portal/BroadcastComposer";

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BroadcastComposer onClose={() => {}} />
    </QueryClientProvider>,
  );

beforeEach(() => send.mockClear());

describe("message students", () => {
  it("sends one message to all students that have a login", async () => {
    show();
    expect(screen.getByText("All my students (3)")).toBeInTheDocument(); // not the one with no login
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Class at 10" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to 3 students/ }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toEqual({
      data: { all: true, studentIds: [], body: "Class at 10" },
    });
    expect(await screen.findByText(/Sent to 2 students/)).toBeInTheDocument();
  });

  it("sends only to the students that are picked, found by search", async () => {
    show();
    fireEvent.click(screen.getByLabelText(/Selected students/));
    expect(screen.getByRole("button", { name: /Send to 0 students/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "cse" } });
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByText("Mira Das")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select all shown" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Extra class" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to 2 students/ }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0].data).toMatchObject({
      all: false,
      body: "Extra class",
    });
    expect(send.mock.calls[0][0].data.studentIds.sort()).toEqual(["S-1", "S-2"]);
  });

  it("can write to a single student", async () => {
    show();
    fireEvent.click(screen.getByLabelText(/Selected students/));
    fireEvent.click(screen.getByLabelText(/Mira Das/));
    expect(screen.getByRole("button", { name: /Send to 1 student$/ })).toBeDisabled(); // no text yet
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "See me" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to 1 student$/ }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0].data.studentIds).toEqual(["S-3"]);
  });
});
