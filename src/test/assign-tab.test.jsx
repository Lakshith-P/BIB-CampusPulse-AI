import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const accounts = [
  {
    id: id(1),
    email: "tina@x.edu",
    name: "Tina Teacher",
    roles: ["faculty"],
    teacherRequest: false,
  },
  { id: id(2), email: "tom@x.edu", name: "Tom Teacher", roles: ["faculty"], teacherRequest: false },
  {
    id: id(3),
    email: "asha@x.edu",
    name: "Asha Student",
    roles: ["student"],
    teacherRequest: false,
  },
  {
    id: id(4),
    email: "ravi@x.edu",
    name: "Ravi Student",
    roles: ["student"],
    teacherRequest: false,
  },
  {
    id: id(5),
    email: "mira@x.edu",
    name: "Mira Student",
    roles: ["student"],
    teacherRequest: false,
  },
  { id: id(6), email: "zed@x.edu", name: "Zed Student", roles: ["student"], teacherRequest: false },
  { id: id(7), email: "pending@x.edu", name: "Pat Pending", roles: [], teacherRequest: true },
];
// who owns which record, and which teacher each student has
const records = [
  { owner_id: id(3), faculty_id: id(1) }, // Asha -> Tina
  { owner_id: id(4), faculty_id: id(2) }, // Ravi -> Tom
  { owner_id: id(5), faculty_id: null }, // Mira: no teacher
  { owner_id: id(6), faculty_id: null }, // Zed: no teacher
];

const link = vi.fn(async () => ({ linked: 1, created: 0 }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn) => fn }));
vi.mock("@/lib/campus.functions", () => ({
  listAccounts: vi.fn(async () => accounts),
  listContactMessages: vi.fn(async () => []),
  linkStudentsToTeacher: (...args) => link(...args),
  setAccountRole: vi.fn(),
  resetAccountPassword: vi.fn(),
  deleteAccount: vi.fn(),
  saveCampusStudent: vi.fn(),
}));

vi.mock("@/lib/access.functions", () => ({
  postAdminMessage: vi.fn(),
  loadAdminMessages: vi.fn(async () => []),
}));

import { AdminTools } from "@/components/AdminTools";

const renderAssign = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminTools tabs={["connect"]} students={[]} records={records} onSaved={() => {}} />
    </QueryClientProvider>,
  );

beforeEach(() => link.mockClear());

describe("Assign students, teacher first", () => {
  it("lists only teachers, with how many students each has, and no student names", async () => {
    renderAssign();
    expect(await screen.findByText("Tina Teacher")).toBeInTheDocument();
    expect(screen.getByText("Tom Teacher")).toBeInTheDocument();
    for (const name of [
      "Asha Student",
      "Ravi Student",
      "Mira Student",
      "Zed Student",
      "Pat Pending",
    ])
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    expect(screen.getAllByText(/1 student ·/)).toHaveLength(2); // one student each
    expect(screen.getByText(/2 students do not have a teacher yet/)).toBeInTheDocument();
  });

  it("opening a teacher shows only their students, not everyone", async () => {
    renderAssign();
    fireEvent.click(await screen.findByRole("button", { name: /Tina Teacher/ }));
    const tina = screen.getByRole("region", { name: "Teacher Tina Teacher" });
    expect(within(tina).getByText("Asha Student")).toBeInTheDocument();
    expect(screen.queryByText("Ravi Student")).not.toBeInTheDocument(); // Tom's student
    expect(screen.queryByText("Mira Student")).not.toBeInTheDocument();
    expect(within(tina).getByText("Type at least 2 letters to search.")).toBeInTheDocument();
  });

  it("finds a student by search and adds them to the opened teacher", async () => {
    renderAssign();
    fireEvent.click(await screen.findByRole("button", { name: /Tina Teacher/ }));
    fireEvent.change(screen.getByLabelText("Add a student"), { target: { value: "mir" } });
    const result = await screen.findByText("Mira Student");
    expect(screen.getByText(/no teacher yet/)).toBeInTheDocument();
    fireEvent.click(
      within(result.closest("div").parentElement).getByRole("button", { name: /Add/ }),
    );
    await waitFor(() => expect(link).toHaveBeenCalled());
    expect(link.mock.calls[0][0]).toEqual({ data: { facultyId: id(1), studentUserIds: [id(5)] } });
  });

  it("shows a student's current teacher when searching, and never lists the pending teacher", async () => {
    renderAssign();
    fireEvent.click(await screen.findByRole("button", { name: /Tina Teacher/ }));
    fireEvent.change(screen.getByLabelText("Add a student"), { target: { value: "ravi" } });
    expect(await screen.findByText(/now with Tom Teacher/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Add a student"), { target: { value: "pending" } });
    expect(screen.getByText("No other student matches.")).toBeInTheDocument();
  });

  it("removes a student from a teacher", async () => {
    renderAssign();
    fireEvent.click(await screen.findByRole("button", { name: /Tina Teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(link).toHaveBeenCalled());
    expect(link.mock.calls[0][0]).toEqual({ data: { facultyId: null, studentUserIds: [id(3)] } });
  });

  it("does not search until at least two letters are typed", async () => {
    renderAssign();
    fireEvent.click(await screen.findByRole("button", { name: /Tom Teacher/ }));
    fireEvent.change(screen.getByLabelText("Add a student"), { target: { value: "a" } });
    expect(screen.queryByText("Asha Student")).not.toBeInTheDocument();
    expect(screen.getByText("Type at least 2 letters to search.")).toBeInTheDocument();
  });
});
