-- WhatsApp (Twilio) chat sign-in. One row per WhatsApp number: where it is in the sign-in
-- conversation, how many wrong passwords it has sent, and which account it is signed in as.
-- Signing out deletes the link, and the session expires on its own.

CREATE TABLE whatsapp_sessions (
  phone text PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  step text NOT NULL DEFAULT 'idle' CHECK (step IN ('idle','email','password')),
  pending_email text,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_sessions_user_idx ON whatsapp_sessions(user_id);
