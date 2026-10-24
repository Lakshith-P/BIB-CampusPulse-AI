-- Tamper-evident audit chain for the confidential complaint workflow: severity and assignment on
-- the complaint itself, and a single append-only hash chain recording every lifecycle event.

ALTER TABLE complaints ADD COLUMN severity text NOT NULL DEFAULT 'medium'
  CHECK (severity IN ('low','medium','high'));
ALTER TABLE complaints ADD COLUMN assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;

-- Each block's hash commits to its own content and to the previous block's hash, so altering any
-- stored block, or any row in `complaints`, is detectable without trusting the database operator.
CREATE TABLE chain_blocks (
  id bigserial PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN
    ('CREATED','STATUS_CHANGED','REOPENED','ASSIGNED','SEVERITY_OVERRIDE','RESOLUTION_EVIDENCE')),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chain_blocks_complaint_idx ON chain_blocks(complaint_id, id);
