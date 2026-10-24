// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as leetcode from "@/backend/leetcode.server";

const PROFILE = {
  data: {
    matchedUser: {
      username: "ann_codes",
      submitStatsGlobal: {
        acSubmissionNum: [
          { difficulty: "All", count: 120 },
          { difficulty: "Easy", count: 60 },
          { difficulty: "Medium", count: 50 },
          { difficulty: "Hard", count: 10 },
        ],
      },
      profile: { ranking: 50000 },
    },
    userContestRanking: { rating: 1650, attendedContestsCount: 5 },
  },
};
const UPCOMING = {
  data: {
    upcomingContests: [
      {
        title: "Weekly Contest 1",
        titleSlug: "weekly-contest-1",
        startTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        duration: 5400,
      },
    ],
  },
};

function mockFetch(queue) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => queue.shift(),
  }));
}

let ctx, db, ann, teacher, other;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  other = await addUser(db, "o@x.edu", "Other", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  await addStudent(db, "S-ANN", ann, teacher);
}, 60_000);

afterAll(() => ctx?.close());
afterEach(() => vi.restoreAllMocks());

describe("leetcode", () => {
  it("saves and validates a linked username against LeetCode", async () => {
    mockFetch([PROFILE]);
    const stats = await leetcode.saveMyLeetcodeUsername(db, ann, "ann_codes");
    expect(stats.totalSolved).toBe(120);
    const { rows } = await db.query("SELECT username FROM leetcode_accounts WHERE user_id=$1", [
      ann.id,
    ]);
    expect(rows[0].username).toBe("ann_codes");
  });

  it("is visible to the owner, their assigned faculty and admin, not to an unrelated faculty", async () => {
    const own = await leetcode.getLeetcodeProfile(db, ann, "S-ANN");
    expect(own.username).toBe("ann_codes");
    const viaFaculty = await leetcode.getLeetcodeProfile(db, teacher, "S-ANN");
    expect(viaFaculty.username).toBe("ann_codes");
    await expect(leetcode.getLeetcodeProfile(db, other, "S-ANN")).rejects.toThrow();
  });

  it("notifies a contest once even across repeated daily syncs", async () => {
    mockFetch([UPCOMING, PROFILE, PROFILE]); // contests, then per-account stats refresh
    await leetcode.runDailySync(db);
    const first = await db.query("SELECT * FROM notifications WHERE user_id=$1", [ann.id]);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].title).toMatch(/Weekly Contest 1/);

    mockFetch([UPCOMING, PROFILE]); // contest already notified; only stats refresh runs
    await leetcode.runDailySync(db);
    const second = await db.query("SELECT * FROM notifications WHERE user_id=$1", [ann.id]);
    expect(second.rows).toHaveLength(1);
  });
});
