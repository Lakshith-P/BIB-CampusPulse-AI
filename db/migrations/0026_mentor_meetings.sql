-- One-to-one meetings between a student and their assigned faculty mentor. The student requests a
-- slot; the mentor confirms or declines it, and can mark it completed. Either side is notified.
CREATE TABLE mentor_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  slot_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 30 CHECK (duration_min IN (15, 30, 45, 60)),
  mode text NOT NULL DEFAULT 'in-person' CHECK (mode IN ('in-person', 'online')),
  topic text NOT NULL CHECK (length(topic) BETWEEN 3 AND 300),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'completed')),
  mentor_note text NOT NULL DEFAULT '' CHECK (length(mentor_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_meetings_mentor_idx ON mentor_meetings(mentor_id, slot_at);
CREATE INDEX mentor_meetings_student_idx ON mentor_meetings(student_id, slot_at);
