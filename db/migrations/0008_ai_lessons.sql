-- Personalised AI video lessons: each student's learning profile (from the psychology
-- questionnaire) and the lessons generated from it for their LMS subjects.

CREATE TABLE learning_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  traits jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  unit int CHECK (unit BETWEEN 1 AND 6),
  topic text NOT NULL,
  focus text NOT NULL DEFAULT '',
  traits jsonb NOT NULL,
  content jsonb NOT NULL,
  quiz_best int,
  quiz_total int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_lessons_owner_idx ON ai_lessons(owner_id, created_at DESC);
