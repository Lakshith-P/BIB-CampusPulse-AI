CREATE TABLE student_agent_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('academic', 'placement')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 4000),
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_data bytea,
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(details) > 0 OR file_data IS NOT NULL)
);
CREATE INDEX student_agent_submissions_student_idx
  ON student_agent_submissions(student_id, created_at DESC);
