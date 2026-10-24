import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let data;
vi.mock("@/lib/student-coach.functions", () => ({ loadMyRanking: vi.fn(async () => data) }));

import { RankingCard } from "@/components/portal/RankingCard";

const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RankingCard />
    </QueryClientProvider>,
  );

describe("My ranking", () => {
  it("shows the position in the class, the branch and the university", async () => {
    data = {
      students: 164,
      updatedAt: "2026-10-25T10:00:00Z",
      groups: [
        {
          key: "class",
          label: "your class",
          detail: "CSE · Semester 3",
          size: 12,
          available: true,
          rank: 9,
          of: 12,
          percentile: 27,
          topPercent: 75,
          mine: 52,
          median: 62,
          top10: 84,
          nextGap: 4,
        },
        {
          key: "branch",
          label: "your branch",
          detail: "CSE, every semester",
          size: 40,
          available: true,
          rank: 21,
          of: 40,
          percentile: 50,
          topPercent: 53,
          mine: 52,
          median: 52,
          top10: 88,
          nextGap: 1.5,
        },
        {
          key: "university",
          label: "the whole university",
          detail: "Every student",
          size: 164,
          available: true,
          rank: 1,
          of: 164,
          percentile: 100,
          topPercent: 1,
          mine: 99,
          median: 60,
          top10: 90,
          nextGap: null,
        },
      ],
      measures: [
        {
          key: "score",
          label: "Success Score",
          class: { rank: 9, of: 12 },
          branch: { rank: 21, of: 40 },
          university: { rank: 1, of: 164 },
        },
        {
          key: "attendance",
          label: "Attendance",
          class: { rank: 2, of: 12 },
          branch: null,
          university: { rank: 3, of: 164 },
        },
      ],
    };
    show();
    expect(await screen.findByText("University ranking")).toBeInTheDocument();
    expect(screen.getByText("Class ranking")).toBeInTheDocument();
    expect(screen.getByText("CSE · Semester 3")).toBeInTheDocument();
    expect(screen.getAllByText("9th").length).toBe(2); // the tile and the measures table
    expect(screen.getByText("of 12 students")).toBeInTheDocument();
    expect(screen.getByText(/Top 75% · ahead of 27% of students/)).toBeInTheDocument();
    expect(screen.getAllByText(/moves you up one place/)).toHaveLength(2); // class and branch; the university rank is first
    expect(screen.getByText("You are first.")).toBeInTheDocument(); // university rank 1
    expect(screen.getByText(/Among 164 students/)).toBeInTheDocument();
    // per measure
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getByText("2nd")).toBeInTheDocument();
    expect(screen.getByText("3rd")).toBeInTheDocument();
  });

  it("says why a group is not ranked yet", async () => {
    data = {
      students: 6,
      updatedAt: "2026-10-25T10:00:00Z",
      groups: [
        {
          key: "class",
          label: "your class",
          detail: "IT · Semester 3",
          size: 3,
          available: false,
          reason: "too few students",
        },
        {
          key: "branch",
          label: "your branch",
          detail: "IT, every semester",
          size: 3,
          available: false,
          reason: "too few students",
        },
        {
          key: "university",
          label: "the whole university",
          detail: "Every student",
          size: 6,
          available: true,
          rank: 2,
          of: 6,
          percentile: 80,
          topPercent: 34,
          mine: 70,
          median: 60,
          top10: 75,
          nextGap: null,
        },
      ],
      measures: [],
    };
    show();
    expect(
      (await screen.findAllByText(/Not shown yet: too few students \(3 students\)/)).length,
    ).toBe(2);
    expect(screen.getByText("2nd")).toBeInTheDocument();
  });
});
