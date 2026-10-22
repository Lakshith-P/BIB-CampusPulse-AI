import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import { AttendancePlanner } from "@/components/portal/AttendancePlanner";
import { ScoreBreakdown } from "@/components/portal/ScoreBreakdown";
import { MyRiskIdentification } from "@/components/portal/RiskIdentification";
import { BandBadge, ScoreRing } from "@/components/widgets";
import { ConfirmDialog, StatusPill, ToastProvider, useToast } from "@/components/ui-kit";
import { emptyStudent } from "@/lib/student-defaults";

const student = {
  ...emptyStudent,
  id: "S1",
  name: "Asha",
  cgpa: 7.2,
  backlogs: 1,
  semesterGrades: [7.8, 7.2],
  subjects: [
    { subject: "Maths", marks: 55, classesHeld: 40, classesAttended: 28 },
    { subject: "Physics", marks: 80, classesHeld: 40, classesAttended: 38 },
  ],
  skills: { coding: 40, aptitude: 70, analytical: -1, verbal: 60, communication: 65 },
  resumeCompleteness: 60,
  targetRoles: ["Software Engineer"],
  mockInterviews: 1,
};

describe("score breakdown", () => {
  it("shows every component, marks missing data, and reveals supporting data on selection", () => {
    render(<ScoreBreakdown s={student} />);
    expect(screen.getByLabelText(/Success Score \d+ out of 100/)).toBeInTheDocument();
    expect(screen.getAllByText(/Not recorded/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Academics: supporting data/)).toBeInTheDocument();
    expect(screen.getByText("7.20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Attendance/ }));
    const detail = document.getElementById("score-detail");
    expect(within(detail).getByText(/Attendance: supporting data/)).toBeInTheDocument();
    expect(within(detail).getByText("Maths")).toBeInTheDocument();
    expect(within(detail).getByText("28/40 (70.0%)")).toBeInTheDocument();
  });

  it("keeps academic and placement risk separate and names the rules that fired", () => {
    render(<ScoreBreakdown s={student} />);
    expect(screen.getByText(/Academic risk —/)).toBeInTheDocument();
    expect(screen.getByText(/Placement risk —/)).toBeInTheDocument();
    expect(screen.getByText(/Subjects under 75% attendance/)).toBeInTheDocument();
  });
});

describe("attendance planner", () => {
  it("recomputes the classes needed when the target changes", () => {
    render(<AttendancePlanner s={student} />);
    const maths = screen.getByRole("region", { name: "Maths" });
    // 28/40 = 70%. To reach 75%: (28+x)/(40+x) >= .75 -> x >= 8. To reach 90%: x >= 40.
    expect(within(maths).getByText(/attend the next/)).toHaveTextContent("8");
    // 14 classes remain, so 80% (needs 20) is out of reach.
    fireEvent.click(screen.getByRole("button", { name: "80%" }));
    expect(within(maths).getByText(/out of reach/)).toHaveTextContent("needs 20 classes");
    expect(within(maths).getAllByText(/below the 75% requirement/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Classes still to be held/), {
      target: { value: "30" },
    });
    expect(within(maths).getByText(/attend the next/)).toHaveTextContent("20");
  });

  it("shows a red warning with a reason and an action for a breach", () => {
    render(<AttendancePlanner s={student} />);
    const maths = screen.getByRole("region", { name: "Maths" });
    const alert = within(maths).getByRole("alert");
    expect(alert).toHaveTextContent("Why:");
    expect(alert).toHaveTextContent("What to do:");
  });

  it("projects attendance when classes are skipped", () => {
    render(<AttendancePlanner s={student} />);
    const physics = screen.getByRole("region", { name: "Physics" });
    fireEvent.change(screen.getByLabelText(/If I miss the next/), { target: { value: "5" } });
    // 38 attended of 40; 14 remain, miss 5 -> (38+9)/(54) = 87.0%
    expect(within(physics).getByText(/If you miss the next 5/)).toHaveTextContent("87.0%");
  });

  it("explains an empty record instead of showing zero", () => {
    render(<AttendancePlanner s={{ ...student, subjects: [] }} />);
    expect(screen.getByText("No attendance recorded yet")).toBeInTheDocument();
  });
});

describe("risk identification", () => {
  it("names each rule that fired, with the value and the threshold behind it", () => {
    render(<MyRiskIdentification s={student} />);
    expect(screen.getByText("Academic risk")).toBeInTheDocument();
    expect(screen.getByText("Placement risk")).toBeInTheDocument();
    expect(screen.getByText("Active backlogs")).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Risk identification" });
    expect(panel).toHaveTextContent("rule: Backlogs ≥ 1");
    expect(panel).toHaveTextContent("Coding score (40; rule: Coding < 50)");
    expect(panel).toHaveTextContent("Not counted, nothing recorded: Assessments completed %");
  });
});

describe("shared widgets", () => {
  it("never shows risk by colour alone", () => {
    render(<BandBadge score={30} />);
    expect(screen.getByText("High Priority")).toBeInTheDocument();
    render(<StatusPill tone="warning">Due soon</StatusPill>);
    expect(screen.getByText("Due soon")).toBeInTheDocument();
  });

  it("describes the score ring for screen readers", () => {
    render(<ScoreRing score={74} />);
    expect(screen.getByRole("img", { name: "Success Score 74 out of 100" })).toBeInTheDocument();
    render(<ScoreRing score={null} />);
    expect(screen.getByRole("img", { name: "Success Score not available" })).toBeInTheDocument();
  });

  it("announces toasts and asks before destructive actions", async () => {
    const onConfirm = vi.fn();
    function Demo() {
      const { toast } = useToast();
      return (
        <>
          <button onClick={() => toast("Saved.")}>save</button>
          <ConfirmDialog
            open
            onOpenChange={() => {}}
            title="Remove it?"
            description="This cannot be undone."
            onConfirm={onConfirm}
          />
        </>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("save"));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
