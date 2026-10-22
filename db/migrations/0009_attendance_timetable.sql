-- Class-by-class attendance marked by teachers, and the weekly timetable per subject.

CREATE TABLE attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  held_on date NOT NULL,
  period int NOT NULL DEFAULT 1 CHECK (period BETWEEN 1 AND 10),
  marked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, held_on, period)
);

CREATE TABLE attendance_marks (
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  present boolean NOT NULL,
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX attendance_marks_student_idx ON attendance_marks(student_id);

-- day: 1 = Monday ... 6 = Saturday
CREATE TABLE timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  day int NOT NULL CHECK (day BETWEEN 1 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX timetable_slots_subject_idx ON timetable_slots(subject, day, start_time);
