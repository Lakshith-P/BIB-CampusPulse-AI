import { isAdmin, isFaculty, notify, visibleStudent } from "./access.server.js";

const GRAPHQL_URL = "https://leetcode.com/graphql";

// A small, injectable caller so tests can stub the network. Mirrors the modelCaller() idiom
// used for the AI provider in ai-lessons.server.js: one function, one network call, friendly errors.
async function leetcodeGraphQL(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`LeetCode is not reachable right now (status ${res.status}).`);
  const json = await res.json();
  if (json.errors?.length)
    throw new Error(json.errors[0].message || "LeetCode rejected the request.");
  return json.data;
}

const PROFILE_QUERY = `
  query userStats($username: String!) {
    matchedUser(username: $username) {
      username
      submitStatsGlobal { acSubmissionNum { difficulty count } }
      profile { ranking }
    }
    userContestRanking(username: $username) { rating attendedContestsCount }
  }
`;

const CONTEST_HISTORY_QUERY = `
  query userContestHistory($username: String!) {
    userContestRankingHistory(username: $username) {
      attended
      rating
      ranking
      problemsSolved
      contest { title titleSlug startTime }
    }
  }
`;

const UPCOMING_CONTESTS_QUERY = `
  query upcomingContests {
    upcomingContests { title titleSlug startTime duration }
  }
`;

function countsByDifficulty(matchedUser) {
  const counts = { All: 0, Easy: 0, Medium: 0, Hard: 0 };
  for (const row of matchedUser?.submitStatsGlobal?.acSubmissionNum ?? []) {
    if (row.difficulty in counts) counts[row.difficulty] = row.count;
  }
  return counts;
}

/** Looks up a LeetCode username's public stats. Throws when the username does not exist. */
export async function fetchProfileStats(username) {
  const data = await leetcodeGraphQL(PROFILE_QUERY, { username });
  if (!data.matchedUser) throw new Error(`No LeetCode account found for "${username}".`);
  const counts = countsByDifficulty(data.matchedUser);
  return {
    username: data.matchedUser.username,
    totalSolved: counts.All,
    easySolved: counts.Easy,
    mediumSolved: counts.Medium,
    hardSolved: counts.Hard,
    ranking: data.matchedUser.profile?.ranking ?? null,
    contestRating: data.userContestRanking?.rating ?? null,
    contestCount: data.userContestRanking?.attendedContestsCount ?? 0,
  };
}

export async function fetchContestHistory(username) {
  const data = await leetcodeGraphQL(CONTEST_HISTORY_QUERY, { username });
  return (data.userContestRankingHistory ?? [])
    .filter((row) => row.attended && row.contest)
    .map((row) => ({
      slug: row.contest.titleSlug,
      title: row.contest.title,
      startTime: new Date(row.contest.startTime * 1000).toISOString(),
      rank: row.ranking,
      problemsSolved: row.problemsSolved,
      newRating: row.rating,
    }));
}

export async function fetchUpcomingContests() {
  const data = await leetcodeGraphQL(UPCOMING_CONTESTS_QUERY, {});
  return (data.upcomingContests ?? []).map((c) => ({
    slug: c.titleSlug,
    title: c.title,
    startTime: new Date(c.startTime * 1000).toISOString(),
    durationSeconds: c.duration,
  }));
}

/** A student links their own LeetCode account. Validated against LeetCode before saving. */
export async function saveMyLeetcodeUsername(db, user, username) {
  const stats = await fetchProfileStats(username);
  await db.query(
    `INSERT INTO leetcode_accounts
       (user_id, username, total_solved, easy_solved, medium_solved, hard_solved, ranking, contest_rating, contest_count, last_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (user_id) DO UPDATE SET
       username = excluded.username,
       total_solved = excluded.total_solved,
       easy_solved = excluded.easy_solved,
       medium_solved = excluded.medium_solved,
       hard_solved = excluded.hard_solved,
       ranking = excluded.ranking,
       contest_rating = excluded.contest_rating,
       contest_count = excluded.contest_count,
       last_synced_at = now()`,
    [
      user.id,
      stats.username,
      stats.totalSolved,
      stats.easySolved,
      stats.mediumSolved,
      stats.hardSolved,
      stats.ranking,
      stats.contestRating,
      stats.contestCount,
    ],
  );
  return stats;
}

/** A student's own, or a visible student's, LeetCode profile + recent contest results. */
export async function getLeetcodeProfile(db, user, studentId) {
  const record = await visibleStudent(db, user, studentId);
  if (!record) throw new Error("That student is not visible to you.");
  if (!record.owner_id) return null;
  const { rows } = await db.query("SELECT * FROM leetcode_accounts WHERE user_id = $1", [
    record.owner_id,
  ]);
  const account = rows[0];
  if (!account) return null;
  const results = await db.query(
    `SELECT contest_slug AS slug, contest_title AS title, contest_start_time AS "startTime",
            rank, problems_solved AS "problemsSolved", rating_change AS "ratingChange", new_rating AS "newRating"
       FROM leetcode_contest_results WHERE user_id = $1 ORDER BY contest_start_time DESC LIMIT 20`,
    [record.owner_id],
  );
  return {
    username: account.username,
    totalSolved: account.total_solved,
    easySolved: account.easy_solved,
    mediumSolved: account.medium_solved,
    hardSolved: account.hard_solved,
    ranking: account.ranking,
    contestRating: account.contest_rating,
    contestCount: account.contest_count,
    lastSyncedAt: account.last_synced_at,
    contests: results.rows,
  };
}

export const canSeeLeetcode = (user, record) =>
  record.owner_id === user.id ||
  isAdmin(user) ||
  (isFaculty(user) && record.faculty_id === user.id);

async function syncUpcomingContestsAndNotify(db) {
  let upcoming;
  try {
    upcoming = await fetchUpcomingContests();
  } catch {
    return; // LeetCode unreachable this run; the next daily run tries again.
  }
  for (const c of upcoming) {
    await db.query(
      `INSERT INTO leetcode_contests (slug, title, start_time, duration_seconds)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET title = excluded.title, start_time = excluded.start_time`,
      [c.slug, c.title, c.startTime, c.durationSeconds],
    );
  }
  const due = await db.query(
    `SELECT id, slug, title, start_time FROM leetcode_contests
      WHERE notified_at IS NULL AND start_time > now() AND start_time <= now() + interval '24 hours'`,
  );
  for (const contest of due.rows) {
    const accounts = await db.query("SELECT user_id FROM leetcode_accounts");
    for (const { user_id } of accounts.rows) {
      await notify(db, user_id, {
        area: "LeetCode",
        priority: "medium",
        title: `Contest tomorrow: ${contest.title}`,
        body: `You have ${contest.title} tomorrow. Attempt it — your score will be calculated.`,
        link: "/portal/students",
        key: `leetcode-contest-${contest.slug}`,
      });
    }
    await db.query("UPDATE leetcode_contests SET notified_at = now() WHERE id = $1", [contest.id]);
  }
}

async function refreshAccountStats(db) {
  const { rows } = await db.query("SELECT user_id, username FROM leetcode_accounts");
  for (const row of rows) {
    try {
      const stats = await fetchProfileStats(row.username);
      await db.query(
        `UPDATE leetcode_accounts SET total_solved=$2, easy_solved=$3, medium_solved=$4, hard_solved=$5,
                ranking=$6, contest_rating=$7, contest_count=$8, last_synced_at = now() WHERE user_id = $1`,
        [
          row.user_id,
          stats.totalSolved,
          stats.easySolved,
          stats.mediumSolved,
          stats.hardSolved,
          stats.ranking,
          stats.contestRating,
          stats.contestCount,
        ],
      );
    } catch {
      // One broken/renamed handle should not stop the rest of the sync.
    }
  }
}

async function syncEndedContestResults(db) {
  const ended = await db.query(
    "SELECT slug, title FROM leetcode_contests WHERE results_synced_at IS NULL AND start_time <= now()",
  );
  if (!ended.rows.length) return;
  const accounts = await db.query("SELECT user_id, username FROM leetcode_accounts");
  for (const contest of ended.rows) {
    for (const account of accounts.rows) {
      try {
        const history = await fetchContestHistory(account.username);
        const entry = history.find((h) => h.slug === contest.slug);
        if (!entry) continue;
        await db.query(
          `INSERT INTO leetcode_contest_results
             (user_id, contest_slug, contest_title, contest_start_time, rank, problems_solved, new_rating)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id, contest_slug) DO UPDATE SET
             rank = excluded.rank, problems_solved = excluded.problems_solved, new_rating = excluded.new_rating`,
          [
            account.user_id,
            entry.slug,
            entry.title,
            entry.startTime,
            entry.rank,
            entry.problemsSolved,
            entry.newRating,
          ],
        );
      } catch {
        // Skip this student for this contest; retried on the next daily run.
      }
    }
    await db.query("UPDATE leetcode_contests SET results_synced_at = now() WHERE slug = $1", [
      contest.slug,
    ]);
  }
}

/** The full daily job: contest calendar + "contest tomorrow" alerts, stats refresh, results sync. */
export async function runDailySync(db) {
  await syncUpcomingContestsAndNotify(db);
  await refreshAccountStats(db);
  await syncEndedContestResults(db);
}
