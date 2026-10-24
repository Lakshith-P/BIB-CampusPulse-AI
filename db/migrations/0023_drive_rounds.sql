-- Selection rounds for placement drives (for example Aptitude, Technical interview, HR). A drive
-- lists its rounds in order; each application records the result of every round so far.
ALTER TABLE placement_drives
  ADD COLUMN rounds text[] NOT NULL DEFAULT '{}';

ALTER TABLE drive_applications
  ADD COLUMN round_results jsonb NOT NULL DEFAULT '{}'::jsonb;
