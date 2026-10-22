CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE app_role AS ENUM ('student', 'faculty', 'admin');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE student_records (
  id text PRIMARY KEY,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  faculty_id uuid REFERENCES users(id) ON DELETE SET NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_records_owner_idx ON student_records(owner_id);
CREATE INDEX student_records_faculty_idx ON student_records(faculty_id);

CREATE TABLE campus_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  action text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  owner text NOT NULL,
  follow_up_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in-progress','resolved')),
  outcome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campus_interventions_student_idx ON campus_interventions(student_id);

CREATE TABLE contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campus_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  record_id text NOT NULL,
  operation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
