-- Visitors who cannot log in (for example after forgetting a password) can still write to support.
ALTER TABLE contact_messages ALTER COLUMN user_id DROP NOT NULL;
