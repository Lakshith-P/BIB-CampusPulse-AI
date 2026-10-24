import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/use-platform", () => ({ useTimetable: () => ({ data: { slots: [] } }) }));

import { AttendOrSkipTable } from "@/components/portal/AttendancePlanner";

const subjects = [
  { subject: "Heat Transfer", held: 42, attended: 37 },
  { subject: "Maths", held: 10, attended: 6 },
  { subject: "Physics", held: 4, attended: 3 },
];
const row = (name) => screen.getByText(name).closest("tr");

describe("attend or skip table", () => {
  it("gives each subject its own advice", () => {
    render(<AttendOrSkipTable subjects={subjects} target={75} perWeek={{}} />);
    expect(within(row("Heat Transfer")).getByText("Safe to skip some")).toBeInTheDocument();
    expect(within(row("Heat Transfer")).getByText("7")).toBeInTheDocument();
    expect(within(row("Maths")).getByText("Attend every class")).toBeInTheDocument();
    expect(within(row("Maths")).getByText(/attend 6 in a row first/)).toBeInTheDocument();
    expect(within(row("Physics")).getByText("Attend, little room")).toBeInTheDocument();
  });
  it("adds this week's classes from the timetable", () => {
    render(
      <AttendOrSkipTable
        subjects={subjects}
        target={75}
        perWeek={{ "Heat Transfer": 3, Maths: 4 }}
      />,
    );
    expect(within(row("Heat Transfer")).getByText("Attend 0 of 3, skip 3")).toBeInTheDocument();
    expect(within(row("Maths")).getByText("Attend 4 of 4")).toBeInTheDocument();
    expect(within(row("Physics")).getByText("No class")).toBeInTheDocument();
  });
  it("marks a skip that would drop the subject under the target", () => {
    render(<AttendOrSkipTable subjects={subjects} target={75} perWeek={{}} />);
    expect(within(row("Physics")).getByText("60.0%")).toHaveClass("text-destructive");
  });
});
