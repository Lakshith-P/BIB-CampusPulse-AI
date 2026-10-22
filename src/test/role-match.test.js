import { describe, expect, it } from "vitest";
import { profileFor, roleMatch } from "@/lib/role-match";

describe("role match", () => {
  it("scores the skills that were assessed and lists gaps, biggest first", () => {
    const r = roleMatch(
      { coding: 35, aptitude: 60, analytical: 60, communication: 50 },
      "Software Engineer",
    );
    expect(r.match).toBe(88);
    expect(r.gaps).toEqual([{ skill: "coding", required: 70, value: 35, gap: 35 }]);
    expect(r.unknown).toEqual([]);
  });

  it("treats unassessed skills as unknown, not zero", () => {
    const r = roleMatch(
      { coding: 70, aptitude: -1, analytical: -1, communication: -1 },
      "software engineer",
    );
    expect(r.match).toBe(100);
    expect(r.unknown).toEqual(["aptitude", "analytical", "communication"]);
  });

  it("returns null match with nothing assessed and null for unconfigured roles", () => {
    expect(roleMatch({ coding: -1 }, "Web Developer").match).toBeNull();
    expect(roleMatch({}, "Astronaut")).toBeNull();
    expect(profileFor("Junior web developer").name).toBe("Web Developer");
  });
});
