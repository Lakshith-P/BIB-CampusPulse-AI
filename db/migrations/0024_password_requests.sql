-- Password changes need an administrator's approval.
--  forgot: a person who cannot log in asks for a new password. The administrator approves it and
--          the person is emailed a one-time link to choose one.
--  change: a signed-in person asks to change their password. The new password is stored (hashed)
--          with the request and only takes effect when an administrator approves it.
CREATE TABLE password_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('forgot','change')),
  new_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz
);
CREATE INDEX password_requests_status_idx ON password_requests(status, created_at DESC);
CREATE INDEX password_requests_user_idx ON password_requests(user_id, created_at DESC);
