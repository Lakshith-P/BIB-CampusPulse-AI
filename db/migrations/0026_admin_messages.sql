-- Messages an administrator posts from the Messages page: to all students, all teachers,
-- everyone, or one person (for example a reply to someone who used the contact form). Each
-- recipient also gets a notification; this table keeps what was sent.
CREATE TABLE admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  audience text NOT NULL CHECK (audience IN ('students','teachers','everyone','person')),
  recipient_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_label text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 150),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  recipients int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_messages_created_idx ON admin_messages(created_at DESC);
