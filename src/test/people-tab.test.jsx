import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const accounts = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "asha.student@x.edu",
    name: "Asha Student",
    roles: ["student"],
    teacherRequest: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "ravi.student@x.edu",
    name: "Ravi Student",
    roles: ["student"],
    teacherRequest: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "tina.teacher@x.edu",
    name: "Tina Teacher",
    roles: ["student", "faculty"],
    teacherRequest: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "nora.pending@x.edu",
    name: "Nora Pending",
    roles: ["student"],
    teacherRequest: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    email: "adam.admin@x.edu",
    name: "Adam Admin",
    roles: ["student", "admin"],
    teacherRequest: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    email: "both@x.edu",
    name: "Both Roles",
    roles: ["student", "faculty", "admin"],
    teacherRequest: false,
  },
];

const grant = vi.fn(async () => ({ saved: true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn) => fn }));
vi.mock("@/lib/campus.functions", () => ({
  listAccounts: vi.fn(async () => accounts),
  listContactMessages: vi.fn(async () => []),
  setAccountRole: (...args) => grant(...args),
  resetAccountPassword: vi.fn(),
  deleteAccount: vi.fn(),
  saveCampusStudent: vi.fn(),
  linkStudentsToTeacher: vi.fn(),
}));

vi.mock("@/lib/access.functions", () => ({
  postAdminMessage: vi.fn(),
  loadAdminMessages: vi.fn(async () => []),
}));

import { AdminTools } from "@/components/AdminTools";

const renderPeople = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminTools tabs={["people"]} students={[]} records={[]} onSaved={() => {}} />
    </QueryClientProvider>,
  );

beforeEach(() => grant.mockClear());

describe("People & roles", () => {
  it("lists teachers, teacher requests and administrators, and no student accounts", async () => {
    renderPeople();
    expect(await screen.findByText("Tina Teacher")).toBeInTheDocument();
    expect(screen.getByText("Nora Pending")).toBeInTheDocument();
    expect(screen.getByText("Adam Admin")).toBeInTheDocument();
    expect(screen.queryByText("Asha Student")).not.toBeInTheDocument();
    expect(screen.queryByText("Ravi Student")).not.toBeInTheDocument();
    expect(screen.queryByText("asha.student@x.edu")).not.toBeInTheDocument();
    expect(screen.getByText(/Student accounts are not listed here/)).toBeInTheDocument();
  });

  it("groups them: pending requests first, then teachers, then administrators", async () => {
    renderPeople();
    await screen.findByText("Tina Teacher");
    const pending = screen.getByRole("region", { name: "Teacher requests" });
    const teachers = screen.getByRole("region", { name: "Teachers" });
    const admins = screen.getByRole("region", { name: "Administrators" });
    expect(within(pending).getByText("Nora Pending")).toBeInTheDocument();
    expect(within(pending).getByText(/requested teacher access/)).toBeInTheDocument();
    expect(within(teachers).getByText("Tina Teacher")).toBeInTheDocument();
    expect(within(teachers).getByText("Both Roles")).toBeInTheDocument();
    expect(within(teachers).queryByText("Nora Pending")).not.toBeInTheDocument();
    // an administrator who is also a teacher is listed once, with the teachers
    expect(within(admins).getByText("Adam Admin")).toBeInTheDocument();
    expect(within(admins).queryByText("Both Roles")).not.toBeInTheDocument();
    expect(within(teachers).getByText("Teachers (2)")).toBeInTheDocument();
  });

  it("still lets the administrator approve a pending request", async () => {
    renderPeople();
    await screen.findByText("Nora Pending");
    const pending = screen.getByRole("region", { name: "Teacher requests" });
    fireEvent.click(within(pending).getByRole("button", { name: "Make faculty" }));
    await waitFor(() => expect(grant).toHaveBeenCalled());
    expect(grant.mock.calls[0][0]).toEqual({
      data: { userId: "00000000-0000-4000-8000-000000000004", role: "faculty", grant: true },
    });
  });

  it("keeps remove-teacher and remove-admin available", async () => {
    renderPeople();
    await screen.findByText("Tina Teacher");
    const teachers = screen.getByRole("region", { name: "Teachers" });
    expect(within(teachers).getAllByRole("button", { name: "Remove faculty" }).length).toBe(2);
    const admins = screen.getByRole("region", { name: "Administrators" });
    expect(within(admins).getByRole("button", { name: "Remove admin" })).toBeInTheDocument();
  });
});
