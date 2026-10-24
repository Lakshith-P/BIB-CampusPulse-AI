import { describe, expect, it } from "vitest";
import {
  STAFF_DRIVE_FILTERS,
  studentDriveFilters,
  STUDENT_DRIVE_FILTERS,
  applyDriveFilter,
  driveFilterCounts,
} from "@/lib/drive-filters";

const drive = (id, over) => ({
  id,
  open: true,
  application: null,
  eligibility: { eligible: true },
  ...over,
});
const drives = [
  drive("open-eligible", {}),
  drive("open-ineligible", { eligibility: { eligible: false } }),
  drive("applied", { application: "applied" }),
  drive("qualified", { application: "shortlisted" }),
  drive("selected", { application: "selected" }),
  drive("failed", { application: "rejected" }),
  drive("closed", { open: false }),
  drive("closed-selected", { open: false, application: "selected" }),
];
const ids = (key) => applyDriveFilter(drives, STUDENT_DRIVE_FILTERS, key).map((d) => d.id);

describe("student drive filters", () => {
  it("shows everything by default, and falls back to everything for an unknown filter", () => {
    expect(ids("all")).toHaveLength(8);
    expect(ids("nonsense")).toHaveLength(8);
  });
  it("finds drives still open to apply, split by eligibility", () => {
    expect(ids("open")).toEqual(["open-eligible", "open-ineligible"]);
    expect(ids("eligible")).toEqual(["open-eligible"]);
    expect(ids("not-eligible")).toEqual(["open-ineligible"]);
  });
  it("sorts the drives a student applied to by how far they got", () => {
    expect(ids("applied")).toEqual(["applied"]);
    expect(ids("qualified")).toEqual(["qualified"]);
    expect(ids("selected")).toEqual(["selected", "closed-selected"]);
    expect(ids("rejected")).toEqual(["failed"]);
  });
  it("finds drives whose deadline has passed", () => {
    expect(ids("closed")).toEqual(["closed", "closed-selected"]);
  });
  it("keeps a record of the closed drives the student took part in", () => {
    expect(ids("past")).toEqual(["closed-selected"]);
  });
  it("counts what each filter would show", () => {
    expect(driveFilterCounts(drives, STUDENT_DRIVE_FILTERS)).toMatchObject({
      all: 8,
      open: 2,
      qualified: 1,
      selected: 2,
      rejected: 1,
      closed: 2,
    });
  });
});

describe("teacher drive filters", () => {
  const staff = [
    { id: "a", open: true, stats: { applicants: 3, shortlisted: 1, selected: 0 } },
    { id: "b", open: false, stats: { applicants: 2, shortlisted: 2, selected: 1 } },
    { id: "c", open: true, stats: { applicants: 0, shortlisted: 0, selected: 0 } },
  ];
  const pick = (key) => applyDriveFilter(staff, STAFF_DRIVE_FILTERS, key).map((d) => d.id);
  it("filters by open or closed and by how far applicants got", () => {
    expect(pick("open")).toEqual(["a", "c"]);
    expect(pick("closed")).toEqual(["b"]);
    expect(pick("applicants")).toEqual(["a", "b"]);
    expect(pick("shortlisted")).toEqual(["a", "b"]);
    expect(pick("selected")).toEqual(["b"]);
  });
});

describe("round filters", () => {
  const R = ["Aptitude", "Technical interview", "HR"];
  const withRounds = (id, application, roundResults, over = {}) => ({
    id,
    open: true,
    application,
    rounds: R,
    roundResults,
    eligibility: { eligible: true },
    ...over,
  });
  const list = [
    withRounds("apt", "applied", {}),
    withRounds("tech", "shortlisted", { Aptitude: "passed" }),
    withRounds("hr", "shortlisted", { Aptitude: "passed", "Technical interview": "passed" }),
    withRounds("out", "rejected", { Aptitude: "passed", "Technical interview": "failed" }),
    withRounds("in", "selected", {
      Aptitude: "passed",
      "Technical interview": "passed",
      HR: "passed",
    }),
    { id: "single", open: true, application: "applied", rounds: [], roundResults: {} },
  ];
  const filters = studentDriveFilters(list);
  const pick = (key) => applyDriveFilter(list, filters, key).map((d) => d.id);

  it("finds drives where the student is still in the rounds", () => {
    expect(pick("in-rounds")).toEqual(["apt", "tech", "hr"]);
  });
  it("finds drives where a round was passed or failed", () => {
    expect(pick("passed-round")).toEqual(["tech", "hr", "out", "in"]);
    expect(pick("failed-round")).toEqual(["out"]);
  });
  it("offers a filter for each round name, matching the round that is next", () => {
    expect(filters.map(([k]) => k)).toEqual(
      expect.arrayContaining(["round:aptitude", "round:technical interview", "round:hr"]),
    );
    expect(pick("round:aptitude")).toEqual(["apt"]);
    expect(pick("round:technical interview")).toEqual(["tech"]);
    expect(pick("round:hr")).toEqual(["hr"]);
  });
  it("adds nothing when no drive has rounds", () => {
    expect(studentDriveFilters([]).length).toBe(STUDENT_DRIVE_FILTERS.length);
  });
});
