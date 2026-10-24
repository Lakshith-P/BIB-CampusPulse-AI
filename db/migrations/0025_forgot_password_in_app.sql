-- "Forgot password" no longer depends on email. The person asks on the login page, an administrator
-- approves, and the person then sets the new password on the same page. The request is kept by
-- email address (even for an address with no account), so the page answers the same either way.
ALTER TABLE password_requests
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN email text NOT NULL DEFAULT '',
  ADD COLUMN expires_at timestamptz;

UPDATE password_requests pr SET email = u.email FROM users u WHERE u.id = pr.user_id;

ALTER TABLE password_requests DROP CONSTRAINT password_requests_status_check;
ALTER TABLE password_requests
  ADD CONSTRAINT password_requests_status_check
  CHECK (status IN ('pending','approved','rejected','completed'));
CREATE INDEX password_requests_email_idx ON password_requests(email, created_at DESC);
