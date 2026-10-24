import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const post = vi.fn(async () => ({ sent: 3, to: "All students" }));
vi.mock("@/lib/access.functions", () => ({
  postAdminMessage: (...a) => post(...a),
  loadAdminMessages: vi.fn(async () => [
    {
      id: "m1",
      audience: "students",
      recipient_label: "All students",
      subject: "Exam timetable",
      body: "Exams begin on 3 December.",
      recipients: 120,
      sender: "Admin One",
      created_at: "2026-10-24T10:00:00Z",
    },
  ]),
}));
vi.mock("@/lib/campus.functions", () => ({
  listAccounts: vi.fn(async () => [
    { id: "u1", email: "ann@x.edu", name: "Ann", roles: ["student"] },
    { id: "u2", email: "tina@x.edu", name: "Tina", roles: ["faculty"] },
  ]),
}));

import { AdminMessages } from "@/components/portal/AdminMessages";

const show = (props = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminMessages {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => post.mockClear());

describe("the administrator's Messages page: posting", () => {
  it("posts a message to all students", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Subject (optional)"), { target: { value: "Holiday" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "No class Friday" } });
    fireEvent.click(screen.getByRole("button", { name: /Post message/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toEqual({
      data: { audience: "students", subject: "Holiday", body: "No class Friday" },
    });
    expect(
      await screen.findByText(/Posted to All students: 3 people notified/),
    ).toBeInTheDocument();
  });

  it("lists what has already been posted", async () => {
    show();
    expect(await screen.findByText("Exams begin on 3 December.")).toBeInTheDocument();
    expect(screen.getByText(/to All students \(120\)/)).toBeInTheDocument();
  });

  it("needs a person chosen for a personal message", async () => {
    show();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "person" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    expect(screen.getByRole("button", { name: /Post message/ })).toBeDisabled();
    await screen.findByRole("option", { name: /Ann/ }); // the people list has loaded
    fireEvent.change(screen.getByLabelText("Person"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: /Post message/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0].data).toMatchObject({
      audience: "person",
      userId: "u1",
      body: "Hello",
    });
  });

  it("a reply is addressed to the person who wrote", async () => {
    show({ replyTo: { userId: "u1", name: "Ann" } });
    expect(await screen.findByText(/Replying to/)).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toHaveValue("person");
    await waitFor(() => expect(screen.getByLabelText("Person")).toHaveValue("u1"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Fixed" } });
    fireEvent.click(screen.getByRole("button", { name: /Post message/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0].data).toMatchObject({
      audience: "person",
      userId: "u1",
      body: "Fixed",
    });
  });
});
