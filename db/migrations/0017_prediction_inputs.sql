-- Inputs for the placement and result predictions, and the stored predictions themselves.

-- LeetCode progress, entered by the student (or synced from their public profile).
CREATE TABLE coding_profiles (
  student_id text PRIMARY KEY REFERENCES student_records(id) ON DELETE CASCADE,
  leetcode_username text NOT NULL DEFAULT '',
  easy int NOT NULL DEFAULT 0 CHECK (easy BETWEEN 0 AND 5000),
  medium int NOT NULL DEFAULT 0 CHECK (medium BETWEEN 0 AND 5000),
  hard int NOT NULL DEFAULT 0 CHECK (hard BETWEEN 0 AND 5000),
  contest_rating int CHECK (contest_rating BETWEEN 0 AND 4500),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'leetcode')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Mid exams and continuous assessments (quizzes, labs, class tests), per subject.
CREATE TABLE exam_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  subject text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mid1', 'mid2', 'continuous')),
  title text NOT NULL DEFAULT '',
  score numeric NOT NULL CHECK (score >= 0),
  max_score numeric NOT NULL DEFAULT 100 CHECK (max_score > 0),
  taken_on date NOT NULL DEFAULT current_date,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (score <= max_score)
);
CREATE INDEX exam_scores_student_idx ON exam_scores(student_id, subject, taken_on);

-- A teacher's rating of a student, 1 (poor) to 5 (excellent), overall or for one subject.
CREATE TABLE teacher_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
  rated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_ratings_student_idx ON teacher_ratings(student_id, created_at DESC);

-- Every stored prediction, so risk can be tracked over time and agent runs can be compared.
CREATE TABLE student_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  run_id uuid,
  placement_score numeric,
  placement_projected numeric,
  placement_band text,
  result_score numeric,
  predicted_sgpa numeric,
  result_band text,
  risk_level text NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low', 'Insufficient data')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_predictions_student_idx ON student_predictions(student_id, created_at DESC);
CREATE INDEX student_predictions_run_idx ON student_predictions(run_id);

-- The student coach stores its plans with the other agents.
ALTER TABLE agent_plans DROP CONSTRAINT agent_plans_agent_check;
ALTER TABLE agent_plans
  ADD CONSTRAINT agent_plans_agent_check CHECK (agent IN ('placement', 'academic', 'prediction'));
