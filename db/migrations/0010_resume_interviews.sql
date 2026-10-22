-- Student resumes (kept as a file plus the text used to ask resume-based questions) and
-- AI mock interview sessions with their questions, answers and graded results.

CREATE TABLE resumes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_data bytea,
  resume_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  role text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  types text[] NOT NULL,
  questions jsonb NOT NULL,
  answers jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX interview_sessions_owner_idx ON interview_sessions(owner_id, created_at DESC);
