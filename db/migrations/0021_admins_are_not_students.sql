-- An administrator signs in through the administrator workspace only. Remove the student role from
-- admin accounts that have no student record of their own, so the student sign-in refuses them.
DELETE FROM user_roles ur
 WHERE ur.role = 'student'
   AND EXISTS (SELECT 1 FROM user_roles a WHERE a.user_id = ur.user_id AND a.role = 'admin')
   AND NOT EXISTS (SELECT 1 FROM student_records sr WHERE sr.owner_id = ur.user_id);
