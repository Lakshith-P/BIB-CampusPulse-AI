-- Persistent notifications, LMS content and submissions, confidential complaints, satisfaction
-- ratings, placement drives, engagement opportunities, skill assessments and mock interviews.

-- ---------------------------------------------------------------- notifications
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '/portal',
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

-- One row per sign-in, so LMS activity (login frequency) comes from real usage.
CREATE TABLE login_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_events_user_idx ON login_events(user_id, at DESC);

-- ---------------------------------------------------------------- LMS
-- Each subject has up to six units. Teachers can rename units and list their syllabus topics.
CREATE TABLE lms_units (
  subject text NOT NULL,
  unit int NOT NULL CHECK (unit BETWEEN 1 AND 6),
  title text NOT NULL,
  topics text NOT NULL DEFAULT '',
  PRIMARY KEY (subject, unit)
);

CREATE TABLE lms_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  unit int NOT NULL CHECK (unit BETWEEN 1 AND 6),
  kind text NOT NULL CHECK (kind IN ('note','video','link','file')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_data bytea,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lms_materials_subject_idx ON lms_materials(subject, unit);

CREATE TABLE lms_progress (
  material_id uuid NOT NULL REFERENCES lms_materials(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, student_id)
);

-- One assignment per unit.
CREATE TABLE lms_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  unit int NOT NULL CHECK (unit BETWEEN 1 AND 6),
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  assigned_on date NOT NULL DEFAULT current_date,
  due_on date NOT NULL,
  max_marks int NOT NULL DEFAULT 10 CHECK (max_marks BETWEEN 1 AND 1000),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, unit)
);

CREATE TABLE lms_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES lms_assignments(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  answer text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_data bytea,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  marks numeric,
  remarks text NOT NULL DEFAULT '',
  graded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  graded_at timestamptz,
  UNIQUE (assignment_id, student_id)
);

-- ---------------------------------------------------------------- feedback centre
-- Only the person who wrote a complaint and administrators can ever read it.
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('academic','faculty','facilities','harassment','other')),
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in-review','resolved')),
  response text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaints_user_idx ON complaints(user_id, created_at DESC);

CREATE TABLE satisfaction_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  teaching int NOT NULL CHECK (teaching BETWEEN 1 AND 5),
  content int NOT NULL CHECK (content BETWEEN 1 AND 5),
  support int NOT NULL CHECK (support BETWEEN 1 AND 5),
  facilities int NOT NULL CHECK (facilities BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX satisfaction_student_idx ON satisfaction_ratings(student_id, created_at DESC);

-- ---------------------------------------------------------------- placement
CREATE TABLE placement_drives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  role_title text NOT NULL,
  description text NOT NULL DEFAULT '',
  package text NOT NULL DEFAULT '',
  drive_date date,
  deadline date NOT NULL,
  min_cgpa numeric NOT NULL DEFAULT 0 CHECK (min_cgpa BETWEEN 0 AND 10),
  max_backlogs int NOT NULL DEFAULT 0 CHECK (max_backlogs >= 0),
  branches text[] NOT NULL DEFAULT '{}',
  grad_year int,
  requires_assessment boolean NOT NULL DEFAULT false,
  link text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drive_applications (
  drive_id uuid NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','shortlisted','selected','rejected')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drive_id, student_id)
);

CREATE TABLE mock_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  interview_date date NOT NULL DEFAULT current_date,
  interviewer text NOT NULL DEFAULT '',
  score numeric CHECK (score BETWEEN 0 AND 100),
  feedback text NOT NULL DEFAULT '',
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mock_interviews_student_idx ON mock_interviews(student_id, interview_date DESC);

-- ---------------------------------------------------------------- engagement
CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('event','club','hackathon','certification')),
  title text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  benefits text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  eligibility text NOT NULL DEFAULT '',
  how_to_apply text NOT NULL DEFAULT '',
  deadline date,
  link text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunities_type_idx ON opportunities(type, created_at DESC);

CREATE TABLE opportunity_participation (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'interested' CHECK (status IN ('interested','applied','participating','completed')),
  evidence text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, student_id)
);

-- ---------------------------------------------------------------- skills
CREATE TABLE skill_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('coding','aptitude','analytical','verbal','communication')),
  topic text NOT NULL DEFAULT '',
  score numeric NOT NULL CHECK (score BETWEEN 0 AND 100),
  taken_on date NOT NULL DEFAULT current_date,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skill_assessments_student_idx ON skill_assessments(student_id, taken_on DESC);
