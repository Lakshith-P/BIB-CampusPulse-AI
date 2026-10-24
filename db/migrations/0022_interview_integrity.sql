-- Proctoring for AI mock interviews: every time the student leaves the interview screen it is
-- counted, and the third time ends the interview. The session says how it ended.
ALTER TABLE interview_sessions
  ADD COLUMN violations int NOT NULL DEFAULT 0,
  ADD COLUMN violation_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN ended_reason text NOT NULL DEFAULT '';

ALTER TABLE interview_sessions DROP CONSTRAINT interview_sessions_status_check;
ALTER TABLE interview_sessions
  ADD CONSTRAINT interview_sessions_status_check
  CHECK (status IN ('started','completed','terminated'));
