-- Which subjects each teacher teaches. Only the teacher of a subject marks its attendance;
-- administrators assign subjects to teachers and can view attendance but not mark it.
CREATE TABLE teacher_subjects (
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 100),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, subject)
);
CREATE INDEX teacher_subjects_subject_idx ON teacher_subjects(subject);

-- Keep what teachers already do: a teacher who has marked a subject before keeps teaching it.
INSERT INTO teacher_subjects(teacher_id, subject)
SELECT DISTINCT s.marked_by, s.subject
  FROM attendance_sessions s
  JOIN user_roles r ON r.user_id = s.marked_by AND r.role = 'faculty'
 WHERE s.marked_by IS NOT NULL
ON CONFLICT DO NOTHING;
