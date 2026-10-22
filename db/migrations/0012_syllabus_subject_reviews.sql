-- The course header of a subject's syllabus (code, credits, outcomes, books), published by the
-- teacher who manages the subject. The six units themselves stay in lms_units.
CREATE TABLE lms_syllabus (
  subject text PRIMARY KEY,
  code text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  lectures int NOT NULL DEFAULT 3 CHECK (lectures BETWEEN 0 AND 20),
  tutorials int NOT NULL DEFAULT 0 CHECK (tutorials BETWEEN 0 AND 20),
  practicals int NOT NULL DEFAULT 0 CHECK (practicals BETWEEN 0 AND 20),
  credits int NOT NULL DEFAULT 3 CHECK (credits BETWEEN 0 AND 30),
  outcomes text NOT NULL DEFAULT '',
  textbooks text NOT NULL DEFAULT '',
  references_list text NOT NULL DEFAULT '',
  session text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A student's review of the teaching of one subject. One review per student per subject, which
-- the student may update; staff only ever read the averages across students.
CREATE TABLE subject_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  subject text NOT NULL,
  teaching int NOT NULL CHECK (teaching BETWEEN 1 AND 5),
  clarity int NOT NULL CHECK (clarity BETWEEN 1 AND 5),
  support int NOT NULL CHECK (support BETWEEN 1 AND 5),
  pace int NOT NULL CHECK (pace BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject)
);
CREATE INDEX subject_reviews_subject_idx ON subject_reviews(subject);
