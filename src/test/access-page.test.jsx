import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const register = vi.fn();
const decide = vi.fn();
let mailReady = true;
let requests = [];

vi.mock("@/lib/access.functions", () => ({
  registerAccounts: (...a) => register(...a),
  decidePasswordRequest: (...a) => decide(...a),
  loadPasswordRequests: vi.fn(async () => requests),
  loadMailStatus: vi.fn(async () => ({ ready: mailReady })),
}));
vi.mock("@/lib/campus.functions", () => ({
  listAccounts: vi.fn(async () => [
    { id: "t1", email: "tina@x.edu", name: "Tina", roles: ["faculty"] },
    { id: "a1", email: "ann@x.edu", name: "Ann", roles: ["student"] },
  ]),
}));
vi.mock("@/components/portal/PortalShell", () => ({
  PageTitle: ({ title }) => <h1>{title}</h1>,
  RoleGate: ({ children }) => children,
}));

import { AccessPage } from "@/components/portal/AccessPage";

const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccessPage />
    </QueryClientProvider>,
  );

beforeEach(() => {
  register.mockReset();
  decide.mockReset();
  mailReady = true;
  requests = [];
});

describe("Login & access: registering people", () => {
  it("registers one student with their details and the chosen teacher", async () => {
    register.mockResolvedValue({
      created: 1,
      emailed: 1,
      skipped: 0,
      failed: 0,
      results: [
        { name: "Asha", email: "asha@x.edu", role: "student", status: "created", emailed: true },
      ],
    });
    show();
    expect(await screen.findByText(/Email is set up/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Asha" } });
    fireEvent.change(screen.getByLabelText(/Email \(their login\)/), {
      target: { value: "asha@x.edu" },
    });
    fireEvent.change(screen.getByLabelText("Assigned teacher"), {
      target: { value: "tina@x.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Register and send login/ }));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0]).toEqual({
      data: {
        people: [
          { role: "student", name: "Asha", email: "asha@x.edu", teacherEmail: "tina@x.edu" },
        ],
      },
    });
    expect(await screen.findByText("Registered and emailed")).toBeInTheDocument();
  });

  it("a teacher needs no student details", async () => {
    show();
    fireEvent.change(await screen.findByLabelText("Role"), { target: { value: "faculty" } });
    expect(screen.queryByLabelText("Assigned teacher")).not.toBeInTheDocument();
    expect(screen.queryByText("Branch")).not.toBeInTheDocument();
  });

  it("shows a password once, with a download, when email is not set up", async () => {
    mailReady = false;
    register.mockResolvedValue({
      created: 1,
      emailed: 0,
      skipped: 0,
      failed: 0,
      results: [
        {
          name: "Zed",
          email: "zed@x.edu",
          role: "student",
          status: "created",
          emailed: false,
          password: "Abc#4567xyZ9",
        },
      ],
    });
    show();
    expect(await screen.findByText(/Email is not set up on this server yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Zed" } });
    fireEvent.change(screen.getByLabelText(/Email \(their login\)/), {
      target: { value: "zed@x.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Register and send login/ }));
    expect(await screen.findByText("Abc#4567xyZ9")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download these logins/ })).toBeInTheDocument();
  });

  it("previews a CSV, lists the bad rows, and registers only the good ones", async () => {
    register.mockResolvedValue({
      created: 1,
      emailed: 1,
      skipped: 0,
      failed: 0,
      results: [
        { name: "Good", email: "good@x.edu", role: "student", status: "created", emailed: true },
      ],
    });
    show();
    const csv = new File(
      ["name,email,role\nGood,good@x.edu,student\nBad,nope,student\n"],
      "people.csv",
      { type: "text/csv" },
    );
    // jsdom has no File.text(); a browser does
    Object.defineProperty(csv, "text", {
      value: async () => "name,email,role\nGood,good@x.edu,student\nBad,nope,student\n",
    });
    fireEvent.change(await screen.findByLabelText("CSV file of people to register"), {
      target: { files: [csv] },
    });
    expect(await screen.findByText(/with problems that will be skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Line 3: Email is not valid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Register 1 and send logins/ }));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0].data.people.map((p) => p.email)).toEqual(["good@x.edu"]);
  });
});

describe("Login & access: password requests", () => {
  const req = (over) => ({
    id: "00000000-0000-4000-8000-000000000001",
    kind: "forgot",
    status: "pending",
    email: "ann@x.edu",
    name: "Ann",
    roles: ["student"],
    createdAt: "2026-10-24T10:00:00Z",
    decidedAt: null,
    ...over,
  });

  it("counts the pending requests on the tab and lets the administrator approve one", async () => {
    requests = [
      req(),
      req({
        id: "00000000-0000-4000-8000-000000000002",
        status: "approved",
        name: "Old",
        email: "old@x.edu",
      }),
    ];
    decide.mockResolvedValue({ status: "approved", emailed: true });
    show();
    const tab = await screen.findByRole("tab", { name: /Password requests \(1\)/ });
    fireEvent.click(tab);
    const row = (await screen.findByText("Ann")).closest("li");
    expect(within(row).getByText(/Forgot password/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0][0]).toEqual({
      data: { id: "00000000-0000-4000-8000-000000000001", decision: "approve" },
    });
    expect(screen.getByText("Approved")).toBeInTheDocument(); // the earlier, decided one
  });

  it("says an approved request is waiting for the person to set their password", async () => {
    requests = [
      req({ status: "approved", waiting: true }),
      req({
        id: "00000000-0000-4000-8000-000000000003",
        status: "completed",
        name: "Done",
        email: "d@x.edu",
      }),
    ];
    show();
    fireEvent.click(await screen.findByRole("tab", { name: /Password requests/ }));
    expect(await screen.findByText("Approved, waiting for them to set it")).toBeInTheDocument();
    expect(screen.getByText("New password set")).toBeInTheDocument();
  });

  it("tells the administrator what approving does, with no link to hand over", async () => {
    requests = [req()];
    decide.mockResolvedValue({ status: "approved", emailed: false });
    show();
    fireEvent.click(await screen.findByRole("tab", { name: /Password requests/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(screen.queryByLabelText(/Reset link/)).not.toBeInTheDocument();
  });
});
