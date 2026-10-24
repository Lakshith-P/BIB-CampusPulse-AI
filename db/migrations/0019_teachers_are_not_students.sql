-- A teacher is a teacher, not also a student. Earlier sign-ups gave every account the student role,
-- and a teacher waiting for approval was given an empty student record that then showed up as a
-- student on the dashboards.
--
-- 1. Delete the empty student record owned by a teacher account. Only records with no teacher, no
--    CGPA, no subjects, no LMS work and no support actions are matched, so nothing real is lost.
-- 2. Remove the student role from teacher accounts.
-- Administrator accounts are not changed.

DELETE FROM student_records sr
 WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = sr.owner_id AND r.role = 'faculty')
   AND sr.faculty_id IS NULL
   AND COALESCE(NULLIF(sr.record->>'cgpa', '')::numeric, 0) = 0
   AND jsonb_array_length(COALESCE(sr.record->'subjects', '[]'::jsonb)) = 0
   AND jsonb_array_length(COALESCE(sr.record->'lms', '[]'::jsonb)) = 0
   AND NOT EXISTS (SELECT 1 FROM campus_interventions i WHERE i.student_id = sr.id);

DELETE FROM user_roles s
 WHERE s.role = 'student'
   AND EXISTS (SELECT 1 FROM user_roles f WHERE f.user_id = s.user_id AND f.role = 'faculty');
