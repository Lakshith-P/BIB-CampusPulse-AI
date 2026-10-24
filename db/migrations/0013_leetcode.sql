-- LeetCode accounts linked by students, the shared contest calendar, and per-student contest results.

CREATE TABLE leetcode_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL,
  total_solved int,
  easy_solved int,
  medium_solved int,
  hard_solved int,
  ranking int,
  contest_rating numeric,
  contest_count int,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A shared cache of contests seen from LeetCode's calendar, so the daily job notifies students
-- about each contest once no matter how many students are linked or how many times it runs.
CREATE TABLE leetcode_contests (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  duration_seconds int NOT NULL DEFAULT 5400,
  notified_at timestamptz,
  results_synced_at timestamptz
);
CREATE INDEX leetcode_contests_start_idx ON leetcode_contests(start_time);

CREATE TABLE leetcode_contest_results (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contest_slug text NOT NULL,
  contest_title text NOT NULL,
  contest_start_time timestamptz NOT NULL,
  rank int,
  problems_solved int,
  rating_change numeric,
  new_rating numeric,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contest_slug)
);
CREATE INDEX leetcode_contest_results_user_idx ON leetcode_contest_results(user_id, contest_start_time DESC);
