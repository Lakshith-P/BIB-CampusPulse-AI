import { describe, expect, it } from "vitest";
import {
  MIN_GROUP,
  MIN_LIST,
  bestGroup,
  improvementPlan,
  standing,
  studentsAhead,
} from "@/lib/peer-benchmark";

// a compact peer with a given score and attendance
const peer = (id, score, over = {}) => ({
  id,
  branch: "CSE",
  semester: 3,
  course: "B.Tech",
  score,
  components: {
    academics: score,
    attendance: score,
    lms: score,
    engagement: score,
    skills: score,
    placement: score,
  },
  skills: {
    coding: score,
    aptitude: score,
    analytical: score,
    verbal: score,
    communication: score,
  },
  attended: Math.round(score),
  held: 100,
  subjects: [{ subject: "Maths", marks: score }],
  ...over,
});
const cohort = (n, make = (i) => peer(`p${i}`, 40 + i * 5)) =>
  Array.from({ length: n }, (_, i) => make(i));

describe("comparing with a group", () => {
  it("ranks the student and says how many they are ahead of", () => {
    const peers = cohort(10); // scores 40, 45 ... 85
    const me = peers[4]; // 60
    const s = standing(me, peers, "class");
    expect(s).toMatchObject({ mine: 60, rank: 6, of: 10, ahead: 5, size: 10 });
    expect(s.percentile).toBe(44); // ahead of 4 of the 9 others
    expect(s.best).toBe(85);
    expect(s.top10).toBe(85);
    expect(s.top25).toBeCloseTo((85 + 80 + 75) / 3, 1);
    expect(s.median).toBeCloseTo(62.5, 1);
  });

  it("gives the leader rank 1 and the share they are ahead of as 100%", () => {
    const peers = cohort(10);
    expect(standing(peers[9], peers, "class")).toMatchObject({
      rank: 1,
      ahead: 0,
      percentile: 100,
    });
  });

  it("ties share a rank", () => {
    const peers = [...cohort(8), peer("t1", 90), peer("t2", 90)];
    expect(standing(peers.at(-1), peers, "class").rank).toBe(1);
    expect(standing(peers.at(-2), peers, "class").rank).toBe(1);
  });

  it("will not compare a group smaller than the minimum", () => {
    const peers = cohort(MIN_GROUP - 1);
    expect(standing(peers[0], peers, "class")).toMatchObject({
      tooSmall: true,
      size: MIN_GROUP - 1,
    });
  });

  it("separates class, branch and university", () => {
    const peers = [
      ...cohort(6),
      ...cohort(5, (i) => peer(`o${i}`, 70, { semester: 5 })), // same branch, other semester
      ...cohort(5, (i) => peer(`w${i}`, 70, { branch: "IT" })), // other branch
    ];
    const me = peers[0];
    expect(standing(me, peers, "class").size).toBe(6);
    expect(standing(me, peers, "branch").size).toBe(11);
    expect(standing(me, peers, "university").size).toBe(16);
  });

  it("uses the smallest group that is big enough", () => {
    const small = [...cohort(3), ...cohort(4, (i) => peer(`o${i}`, 70, { semester: 5 }))];
    expect(bestGroup(small[0], small)).toBe("branch");
    expect(bestGroup(cohort(8)[0], cohort(8))).toBe("class");
    expect(bestGroup(cohort(2)[0], cohort(2))).toBeNull();
  });
});

describe("students who are ahead", () => {
  it("lists those just ahead, closest first, as lettered profiles with rounded figures", () => {
    const peers = cohort(12, (i) => peer(`p${i}`, 41 + i * 4));
    const me = peers[3]; // 53
    const r = studentsAhead(me, peers, "class", "score", 3);
    expect(r.total).toBe(8);
    expect(r.list.map((p) => p.label)).toEqual(["Student A", "Student B", "Student C"]);
    expect(r.list.map((p) => p.score)).toEqual([55, 60, 65]); // 57, 61, 65 rounded to the nearest 5
    expect(JSON.stringify(r)).not.toMatch(/p\d/); // no IDs
  });

  it("is not available for a group under the list minimum", () => {
    const peers = cohort(MIN_LIST - 1);
    expect(studentsAhead(peers[0], peers, "class")).toMatchObject({ tooSmall: true, list: [] });
  });

  it("says so when nobody is ahead", () => {
    const peers = cohort(12);
    expect(studentsAhead(peers[11], peers, "class").list).toEqual([]);
  });
});

describe("improvement plan", () => {
  it("ranks the gaps to the top quarter by the Success Score points they would add", () => {
    // everyone is level except this student, who is weak on attendance (heavy weight) and engagement (light)
    const strong = (i) => peer(`p${i}`, 80);
    const peers = [
      ...cohort(9, strong),
      peer("me", 70, {
        components: {
          academics: 80,
          attendance: 40,
          lms: 80,
          engagement: 40,
          skills: 80,
          placement: 80,
        },
        attended: 40,
        held: 100,
      }),
    ];
    const plan = improvementPlan(peers.at(-1), peers);
    expect(plan.group).toBe("class");
    expect(plan.items.map((i) => i.component).slice(0, 2)).toEqual(["attendance", "engagement"]);
    const att = plan.items[0];
    expect(att.gap).toBe(40);
    expect(att.gain).toBeCloseTo((20 / 100) * 40, 1); // attendance carries 20 of the 100 weight points
    expect(att.advice).toMatch(/Attend the next \d+ classes/);
    expect(plan.items.every((i) => i.component !== "academics")).toBe(true); // strengths are left out
  });
});

import { rankingOverview, withMe } from "@/lib/peer-benchmark";

describe("ranking overview", () => {
  const peers = [
    ...cohort(12, (i) => peer(`c${i}`, 40 + i * 4)), // CSE semester 3: 40 ... 84
    ...cohort(8, (i) => peer(`b${i}`, 50 + i * 3, { semester: 5 })), // CSE other semester
    ...cohort(3, (i) => peer(`i${i}`, 90, { branch: "IT" })), // IT: too few for a group of its own
  ];

  it("ranks the student in the class, the branch and the university", () => {
    const me = peers[3]; // 52 in the class
    const r = rankingOverview(me, peers);
    const by = Object.fromEntries(r.groups.map((g) => [g.key, g]));
    expect(by.class).toMatchObject({ available: true, rank: 9, of: 12, size: 12, topPercent: 75 });
    expect(by.branch.size).toBe(20);
    expect(by.university.size).toBe(23);
    // 3 IT students with 90 and every CSE student below 90: the 52 is behind all three of them
    expect(by.university.rank).toBe(by.branch.rank + 3);
    expect(by.class.detail).toBe("CSE · Semester 3");
  });

  it("says how many points move the student up one place", () => {
    const me = peers[3]; // 52; the next student in the class has 56
    const g = rankingOverview(me, peers).groups.find((x) => x.key === "class");
    expect(g.nextGap).toBe(4);
  });

  it("gives the leader no gap and rank 1", () => {
    const top = peers[11]; // 84, the best in the class
    const g = rankingOverview(top, peers).groups.find((x) => x.key === "class");
    expect(g).toMatchObject({ rank: 1, topPercent: 9, nextGap: null });
  });

  it("does not rank in a group that is too small, and says why", () => {
    const itMe = peers.at(-1);
    const by = Object.fromEntries(rankingOverview(itMe, peers).groups.map((g) => [g.key, g]));
    expect(by.class).toMatchObject({ available: false, reason: "too few students", size: 3 });
    expect(by.university.available).toBe(true);
  });

  it("ranks each measure separately", () => {
    const me = { ...peers[3], components: { ...peers[3].components, attendance: 99 } };
    const r = rankingOverview(me, withMe(peers, me));
    expect(r.measures.find((m) => m.key === "attendance").class).toMatchObject({ rank: 1 });
    expect(r.measures.find((m) => m.key === "lms").class.rank).toBeGreaterThan(1);
  });

  it("uses the student's fresh figures in place of an older copy in the cohort", () => {
    const stale = peers[3]; // 52 in the cached cohort
    const fresh = { ...stale, score: 90, components: { ...stale.components, attendance: 90 } };
    const merged = withMe(peers, fresh);
    expect(merged).toHaveLength(peers.length);
    expect(rankingOverview(fresh, merged).groups.find((g) => g.key === "class").rank).toBe(1);
    expect(rankingOverview(fresh, peers).groups.find((g) => g.key === "class").of).toBe(12);
  });
});
